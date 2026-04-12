import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export function useEscrowRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escrows' }, () => {
        queryClient.invalidateQueries({ queryKey: ['escrows'] });
        queryClient.invalidateQueries({ queryKey: ['escrow'] });
        queryClient.invalidateQueries({ queryKey: ['disputed-escrows'] });
        queryClient.invalidateQueries({ queryKey: ['user-stats'] });
        queryClient.invalidateQueries({ queryKey: ['resolved-disputes'] });
        queryClient.invalidateQueries({ queryKey: ['monthly-analytics'] });
        queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escrow_events' }, () => {
        queryClient.invalidateQueries({ queryKey: ['events'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_config' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
        queryClient.invalidateQueries({ queryKey: ['platform-config'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
