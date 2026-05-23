import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { CONTRACT_PRINCIPAL } from '@/lib/stacks-config';

export function useEscrowRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Scope realtime to the active contract so historical v6 changes don't
    // trigger refetches of v7 queries (and vice versa).
    const contractFilter = `contract_id=eq.${CONTRACT_PRINCIPAL}`;

    const channel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'escrows', filter: contractFilter },
        () => {
          queryClient.invalidateQueries({ queryKey: ['escrows'] });
          queryClient.invalidateQueries({ queryKey: ['escrow'] });
          queryClient.invalidateQueries({ queryKey: ['disputed-escrows'] });
          queryClient.invalidateQueries({ queryKey: ['user-stats'] });
          queryClient.invalidateQueries({ queryKey: ['resolved-disputes'] });
          queryClient.invalidateQueries({ queryKey: ['monthly-analytics'] });
          queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'escrow_events', filter: contractFilter },
        () => {
          queryClient.invalidateQueries({ queryKey: ['events'] });
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_config' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
        queryClient.invalidateQueries({ queryKey: ['platform-config'] });
      })
      .on(
        'postgres_changes',
        // Chat messages — invalidate without a contract_id filter so future
        // contract migrations don't accidentally silence the thread when a
        // user is viewing a legacy escrow's conversation.
        { event: 'INSERT', schema: 'public', table: 'escrow_messages' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages'] });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
