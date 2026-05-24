import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Wallet-auth JWT lookup. Reads on every request rather than caching, so
 * sign-in / sign-out / expiry take effect immediately without recreating
 * the Supabase client.
 *
 * KEEP THIS KEY IN SYNC with `STORAGE_KEY` in `contexts/WalletAuthContext.tsx`.
 */
const WALLET_AUTH_STORAGE_KEY = 'wallet_auth_session_v1';

function readWalletAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WALLET_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as { accessToken?: string; expiresAt?: number };
    if (!session.accessToken || !session.expiresAt) return null;
    // Treat near-expiry as expired (1-minute grace) so we don't send a token
    // PostgREST is about to reject.
    if (Date.now() + 60_000 >= session.expiresAt) return null;
    return session.accessToken;
  } catch {
    return null;
  }
}

/**
 * Build a Supabase client that overrides the default `Authorization` header
 * with the user's wallet-auth JWT whenever one is in localStorage. Without
 * a JWT, the client falls back to the anon key (default supabase-js
 * behavior). The `apikey` header always carries the anon key so the
 * Supabase gateway can identify the project regardless of auth state.
 *
 * We do NOT use `supabase.auth.setSession()` because supabase-js v2.x
 * silently rejects sessions without a refresh_token, and we don't issue
 * refresh tokens (short-lived JWTs, re-sign on expiry).
 */
function buildClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Disable Supabase's own auth machinery — we manage tokens via
      // localStorage + the fetch wrapper below.
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (input, init) => {
        const token = readWalletAuthToken();
        if (!token) return fetch(input, init);
        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  if (!_supabase) _supabase = buildClient();
  return _supabase;
}

/** @deprecated Use getSupabase() with isSupabaseConfigured guard instead. */
export const supabase: SupabaseClient = isSupabaseConfigured
  ? buildClient()
  : new Proxy({} as SupabaseClient, {
      get(_, prop) {
        if (typeof prop === 'string') {
          throw new Error(`Supabase not configured: tried to access .${prop}(). Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`);
        }
        return undefined;
      },
    });
