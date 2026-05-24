import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { request } from '@stacks/connect';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { STACKS_NETWORK } from '@/lib/stacks-config';
import { useWallet } from '@/contexts/WalletContext';

/**
 * SIWE-style wallet authentication.
 *
 * The connected wallet (via WalletContext) gives us a Stacks address. To
 * convert that into Supabase auth — so RLS policies can scope per-user —
 * the user signs a structured challenge with their wallet, the
 * `wallet-auth` edge function verifies the signature, and returns a
 * Supabase-compatible JWT carrying `wallet_address` as a custom claim.
 *
 * Token lifetime: 24h. On expiry, the user signs again. No refresh tokens.
 *
 * Persistence: localStorage. Restored automatically on mount.
 *
 * NOTE: this context does NOT auto-prompt for signature when the wallet
 * connects. It exposes a `signIn()` method that components (or pages that
 * need RLS-gated write access) can call explicitly. This is so casual
 * read-only browsing — landing page, public escrow detail — doesn't trigger
 * an unexpected wallet popup.
 */

interface AuthSession {
  walletAddress: string;
  accessToken: string;
  expiresAt: number; // epoch ms
}

interface WalletAuthContextType {
  /** The authenticated wallet address, or null if not signed in. */
  authedAddress: string | null;
  isAuthenticated: boolean;
  /** True while a signature flow is in progress (wallet popup + server roundtrip). */
  isSigningIn: boolean;
  /** Prompt the user to sign a challenge and exchange it for a JWT. */
  signIn: () => Promise<void>;
  /** Drop the local session. Does not affect the wallet connection itself. */
  signOut: () => void;
}

const WalletAuthContext = createContext<WalletAuthContextType>({
  authedAddress: null,
  isAuthenticated: false,
  isSigningIn: false,
  signIn: async () => {},
  signOut: () => {},
});

const STORAGE_KEY = 'wallet_auth_session_v1';
// Refresh proactively if expiry is within this window (treat as "expired").
const EXPIRY_GRACE_MS = 60_000;

function readPersistedSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (!session?.accessToken || !session?.walletAddress) return null;
    if (Date.now() + EXPIRY_GRACE_MS >= session.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

function persistSession(session: AuthSession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage full / disabled — auth state is lost on refresh but the
    // immediate signIn still works for this session.
  }
}

function buildChallenge(walletAddress: string): { message: string; nonce: string } {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000); // 10 minute window
  // Domain must match AUTH_ALLOWED_DOMAINS on the edge function. We strip the
  // port for `localhost` so dev across 5173/8080 still matches one entry, but
  // production deploys keep their full host.
  const origin = typeof window !== 'undefined' ? window.location.host : 'unknown';
  const uri = typeof window !== 'undefined' ? window.location.origin : '';

  const message =
    `sBTC Escrow wants you to sign in with your Stacks account:\n` +
    `${walletAddress}\n` +
    `\n` +
    `I accept the Terms of Service.\n` +
    `\n` +
    `URI: ${uri}\n` +
    `Domain: ${origin}\n` +
    `Network: ${STACKS_NETWORK}\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${now.toISOString()}\n` +
    `Expiration Time: ${expires.toISOString()}`;
  return { message, nonce };
}

async function applySupabaseSession(accessToken: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  // Setting an empty refresh_token disables Supabase's auto-refresh — fine
  // because we re-sign on expiry rather than relying on token refresh.
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: '',
  });
  if (error) {
    // Don't throw — the JWT might still work for direct fetch even if
    // setSession failed. Surface for debugging.
    console.warn('[wallet-auth] supabase.auth.setSession warning:', error.message);
  }
}

async function clearSupabaseSession(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut({ scope: 'local' });
}

export function WalletAuthProvider({ children }: { children: React.ReactNode }) {
  const { address } = useWallet();
  const [session, setSession] = useState<AuthSession | null>(() => readPersistedSession());
  const [isSigningIn, setIsSigningIn] = useState(false);
  const appliedRef = useRef<string | null>(null);

  // Apply persisted session to the Supabase client on mount + whenever the
  // session changes. Idempotent — guarded by appliedRef so a stable session
  // doesn't repeatedly call setSession.
  useEffect(() => {
    if (!session) {
      if (appliedRef.current) {
        clearSupabaseSession();
        appliedRef.current = null;
      }
      return;
    }
    if (appliedRef.current === session.accessToken) return;
    appliedRef.current = session.accessToken;
    applySupabaseSession(session.accessToken);
  }, [session]);

  // If the connected wallet changes (user switches accounts), invalidate the
  // session — the previous JWT was for a different address.
  useEffect(() => {
    if (session && address && session.walletAddress !== address) {
      setSession(null);
      persistSession(null);
    }
  }, [address, session]);

  // Auto-expire when the token TTL passes.
  useEffect(() => {
    if (!session) return;
    const msUntilExpiry = session.expiresAt - Date.now() - EXPIRY_GRACE_MS;
    if (msUntilExpiry <= 0) {
      setSession(null);
      persistSession(null);
      return;
    }
    const t = setTimeout(() => {
      setSession(null);
      persistSession(null);
      toast.info('Session expired', {
        description: 'Sign in again to continue posting messages and signaling delivery.',
      });
    }, msUntilExpiry);
    return () => clearTimeout(t);
  }, [session]);

  const signIn = useCallback(async () => {
    if (!address) {
      toast.error('Connect your wallet first');
      return;
    }
    if (!isSupabaseConfigured) {
      toast.error('Auth unavailable', { description: 'Supabase not configured.' });
      return;
    }
    setIsSigningIn(true);
    try {
      const { message } = buildChallenge(address);

      // 1. Ask the wallet to sign the structured challenge.
      const signed = await request('stx_signMessage', { message });
      const signature = (signed as { signature?: string })?.signature;
      const publicKey = (signed as { publicKey?: string })?.publicKey;
      if (!signature || !publicKey) {
        throw new Error('Wallet did not return a signature.');
      }

      // 2. Exchange signature for a Supabase JWT via the edge function.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL not configured');
      const res = await fetch(`${supabaseUrl}/functions/v1/wallet-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, message, signature, publicKey }),
      });
      const body = (await res.json().catch(() => ({}))) as
        | { access_token: string; expires_in: number }
        | { error: string };

      if (!res.ok || !('access_token' in body)) {
        const errorCode = 'error' in body ? body.error : `http_${res.status}`;
        throw new Error(`Auth failed: ${errorCode}`);
      }

      const newSession: AuthSession = {
        walletAddress: address,
        accessToken: body.access_token,
        expiresAt: Date.now() + body.expires_in * 1000,
      };
      setSession(newSession);
      persistSession(newSession);
      toast.success('Signed in', {
        description: 'You can now post messages and confirm deliveries.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('reject') || msg.includes('cancel') || msg.includes('denied') || msg.includes('dismiss')) {
        toast.error('Sign-in cancelled', {
          description: 'You declined the wallet prompt.',
        });
      } else {
        toast.error('Sign-in failed', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [address]);

  const signOut = useCallback(() => {
    setSession(null);
    persistSession(null);
  }, []);

  const value: WalletAuthContextType = {
    authedAddress: session?.walletAddress ?? null,
    isAuthenticated: !!session,
    isSigningIn,
    signIn,
    signOut,
  };

  return (
    <WalletAuthContext.Provider value={value}>
      {children}
    </WalletAuthContext.Provider>
  );
}

export const useWalletAuth = () => useContext(WalletAuthContext);
