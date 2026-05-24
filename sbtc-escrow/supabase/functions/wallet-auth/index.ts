// supabase/functions/wallet-auth/index.ts
//
// SIWE-style wallet auth for Stacks.
//
// Flow:
//   1. Frontend asks user's wallet to sign a structured challenge message
//      containing { domain, address, nonce, issued_at, expiration_time }.
//   2. Frontend POSTs { address, message, signature, publicKey } here.
//   3. This function:
//        a. Verifies the Stacks signature with @stacks/transactions
//        b. Verifies the publicKey actually derives to the claimed address
//        c. Parses the message and checks expiration + domain whitelist
//        d. Inserts the nonce into auth_nonces (PK = unique => replay-proof)
//        e. Mints a Supabase JWT with `wallet_address` as a custom claim
//   4. Frontend stores the JWT and applies it to the Supabase client.
//   5. RLS policies on `escrow_messages` / `deliveries` / `dispute_reasons`
//      read `auth.jwt() ->> 'wallet_address'` to scope reads/writes.
//
// Required secrets (set via `supabase secrets set --project-ref <ref> KEY=val`):
//   JWT_SIGNING_SECRET   — the project's JWT signing secret (from Settings > API)
//   AUTH_ALLOWED_DOMAINS  — comma-separated origin hosts allowed to issue
//                           challenges (e.g. sbtc-escrow-testnet.vercel.app,localhost:8080)
//   STACKS_NETWORK        — 'mainnet' | 'testnet' — picks the address version
//
// Deployed with --no-verify-jwt: the request is unauthenticated by design
// (user has no JWT *until* this function issues one). The signature is the
// auth proof.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  verifyMessageSignatureRsv,
  getAddressFromPublicKey,
  AddressVersion,
} from "npm:@stacks/transactions@7";
import { create as signJwt, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const JWT_SECRET = Deno.env.get("JWT_SIGNING_SECRET");
const STACKS_NETWORK = Deno.env.get("STACKS_NETWORK") || "testnet";
const ALLOWED_DOMAINS = (Deno.env.get("AUTH_ALLOWED_DOMAINS") ||
  "sbtc-escrow-testnet.vercel.app,sbtc-escrow.vercel.app,localhost:8080,localhost:5173,localhost:3000"
).split(",").map((d) => d.trim());

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24h
const CLOCK_SKEW_MS = 60_000; // tolerate 1 min of clock drift

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ParsedMessage {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}

/**
 * Parse the structured challenge. The message format is fixed and human-
 * readable so the user sees what they're signing in their wallet:
 *
 *   sBTC Escrow wants you to sign in with your Stacks account:
 *   ST1HK6H...
 *
 *   I accept the Terms of Service.
 *
 *   URI: https://sbtc-escrow-testnet.vercel.app
 *   Domain: sbtc-escrow-testnet.vercel.app
 *   Network: testnet
 *   Nonce: a1b2c3d4e5f6g7h8
 *   Issued At: 2026-05-24T12:00:00.000Z
 *   Expiration Time: 2026-05-24T12:15:00.000Z
 */
function parseMessage(message: string): ParsedMessage | null {
  const lines = message.split("\n").map((l) => l.trimEnd());

  // The address is the line immediately after the intro line.
  const introIdx = lines.findIndex((l) => l.startsWith("sBTC Escrow wants you to sign in"));
  if (introIdx === -1 || !lines[introIdx + 1]) return null;
  const address = lines[introIdx + 1].trim();

  // Collect all `Key: value` fields.
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([A-Za-z ][A-Za-z ]+):\s*(.+)$/);
    if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
  }

  const requireField = (key: string) => fields[key];
  if (
    !requireField("domain") ||
    !requireField("nonce") ||
    !requireField("issued at") ||
    !requireField("expiration time")
  ) {
    return null;
  }

  const issuedAt = new Date(fields["issued at"]);
  const expiresAt = new Date(fields["expiration time"]);
  if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    return null;
  }

  return {
    domain: fields["domain"],
    address,
    nonce: fields["nonce"],
    issuedAt,
    expiresAt,
  };
}

async function mintJwt(walletAddress: string): Promise<string> {
  if (!JWT_SECRET) {
    throw new Error("JWT_SIGNING_SECRET is not configured");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return signJwt(
    { alg: "HS256", typ: "JWT" },
    {
      // Supabase requires aud + role = 'authenticated' for the JWT to grant
      // table access via RLS. Everything else is a custom claim.
      aud: "authenticated",
      role: "authenticated",
      sub: walletAddress,
      wallet_address: walletAddress,
      iat: getNumericDate(0),
      exp: getNumericDate(TOKEN_TTL_SECONDS),
    },
    key,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!JWT_SECRET) {
    console.error("[wallet-auth] JWT_SIGNING_SECRET not configured");
    return jsonResponse({ error: "auth_not_configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse({ error: "invalid_json" }, 400);

    const { address, message, signature, publicKey } = body as {
      address?: string;
      message?: string;
      signature?: string;
      publicKey?: string;
    };
    if (!address || !message || !signature || !publicKey) {
      return jsonResponse({ error: "missing_fields" }, 400);
    }

    // 1. Cryptographic signature verification — the user controls the private
    //    key corresponding to `publicKey` and signed this exact message.
    const sigValid = verifyMessageSignatureRsv({ message, signature, publicKey });
    if (!sigValid) return jsonResponse({ error: "invalid_signature" }, 401);

    // 2. The publicKey must derive to the claimed address on the right network.
    //    Prevents a valid-but-unrelated keypair from authenticating as
    //    someone else's address.
    const addressVersion = STACKS_NETWORK === "mainnet"
      ? AddressVersion.MainnetSingleSig
      : AddressVersion.TestnetSingleSig;
    const derivedAddress = getAddressFromPublicKey(publicKey, addressVersion);
    if (derivedAddress !== address) {
      return jsonResponse({ error: "address_mismatch" }, 401);
    }

    // 3. Message structure: must contain domain, nonce, timestamps, and the
    //    embedded address must match.
    const parsed = parseMessage(message);
    if (!parsed) return jsonResponse({ error: "malformed_message" }, 400);
    if (parsed.address !== address) {
      return jsonResponse({ error: "address_in_message_mismatch" }, 401);
    }

    // 4. Time bounds — block stale or pre-issued challenges.
    const now = Date.now();
    if (parsed.expiresAt.getTime() < now) {
      return jsonResponse({ error: "challenge_expired" }, 401);
    }
    if (parsed.issuedAt.getTime() > now + CLOCK_SKEW_MS) {
      return jsonResponse({ error: "challenge_issued_in_future" }, 401);
    }

    // 5. Domain whitelist — anti-phishing across deployments.
    if (!ALLOWED_DOMAINS.includes(parsed.domain)) {
      return jsonResponse({ error: "domain_not_allowed" }, 401);
    }

    // 6. Replay guard — a unique-constraint violation on nonce insert means
    //    this challenge was already consumed.
    const { error: nonceErr } = await supabase.from("auth_nonces").insert({
      nonce: parsed.nonce,
      address,
      issued_at: parsed.issuedAt.toISOString(),
      expires_at: parsed.expiresAt.toISOString(),
    });
    if (nonceErr) {
      if (nonceErr.code === "23505") {
        return jsonResponse({ error: "nonce_already_used" }, 401);
      }
      console.error("[wallet-auth] nonce insert failed:", nonceErr);
      return jsonResponse({ error: "internal_error" }, 500);
    }

    // 7. Mint and return.
    const accessToken = await mintJwt(address);
    return jsonResponse({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: TOKEN_TTL_SECONDS,
      wallet_address: address,
    });
  } catch (err) {
    console.error("[wallet-auth] top-level error:", err);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
