import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Polls the `indexer-health` edge function to detect when the on-chain →
 * Supabase indexer is lagging or unhealthy. Used by the global banner so
 * users understand why their just-submitted escrow isn't appearing yet,
 * rather than assuming the app is broken.
 *
 * Polling cadence: every 2 minutes. The check itself is cheap and the
 * "healthy" state changes infrequently, so faster polling adds no value.
 */
export interface IndexerHealth {
  healthy: boolean;
  blockLag: number | null;
  note: string;
  chainhookEnabled: boolean | null;
  checkedAt: string | null;
}

const REFETCH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export function useIndexerHealth() {
  return useQuery<IndexerHealth>({
    queryKey: ['indexer-health'],
    queryFn: async () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (!supabaseUrl || !anonKey) {
        // Without config we can't reach the function — assume healthy so we
        // don't show a banner that no user can act on.
        return { healthy: true, blockLag: null, note: 'unknown', chainhookEnabled: null, checkedAt: null };
      }
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/indexer-health`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        });
        if (!res.ok) {
          // 5xx from the health check — surface as unhealthy so the banner
          // can warn the user something's off, even if we can't say what.
          return { healthy: false, blockLag: null, note: 'Health check unreachable', chainhookEnabled: null, checkedAt: null };
        }
        const body = (await res.json()) as {
          healthy: boolean;
          chainhook?: { enabled?: boolean };
          lag?: { blocks: number | null; note: string };
          checked_at?: string;
        };
        return {
          healthy: !!body.healthy,
          blockLag: body.lag?.blocks ?? null,
          note: body.lag?.note ?? '',
          chainhookEnabled: body.chainhook?.enabled ?? null,
          checkedAt: body.checked_at ?? null,
        };
      } catch {
        return { healthy: false, blockLag: null, note: 'Health check unreachable', chainhookEnabled: null, checkedAt: null };
      }
    },
    enabled: isSupabaseConfigured,
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: REFETCH_INTERVAL_MS / 2,
    // Don't surface transient errors to the UI — the underlying poll
    // already returns a "best-effort unhealthy" object on failure.
    retry: false,
  });
}
