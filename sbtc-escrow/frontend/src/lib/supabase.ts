import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// Lazy-initialised: avoids null cast and crashes when env vars are missing.
let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

/** @deprecated Use getSupabase() with isSupabaseConfigured guard instead. */
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : new Proxy({} as SupabaseClient, {
      get(_, prop) {
        if (typeof prop === 'string') {
          throw new Error(`Supabase not configured: tried to access .${prop}(). Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`);
        }
        return undefined;
      },
    });
