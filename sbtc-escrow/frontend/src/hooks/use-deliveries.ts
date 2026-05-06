import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface Delivery {
  id: number;
  escrowId: number;
  sellerAddress: string;
  buyerAddress: string;
  message: string | null;
  createdAt: string; // ISO
}

export function useDeliveries(escrowId: number) {
  return useQuery({
    queryKey: ['deliveries', escrowId],
    queryFn: async (): Promise<Delivery[]> => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from('deliveries')
        .select('id, escrow_id, seller_address, buyer_address, message, created_at')
        .eq('escrow_id', escrowId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        escrowId: row.escrow_id,
        sellerAddress: row.seller_address,
        buyerAddress: row.buyer_address,
        message: row.message,
        createdAt: row.created_at,
      }));
    },
    enabled: isSupabaseConfigured && escrowId > 0,
  });
}

interface MarkDeliveredArgs {
  escrowId: number;
  sellerAddress: string;
  buyerAddress: string;
  message?: string;
}

export function useMarkDelivered() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ escrowId, sellerAddress, buyerAddress, message }: MarkDeliveredArgs) => {
      if (!isSupabaseConfigured) throw new Error('Supabase not configured');
      const { error } = await supabase.from('deliveries').insert({
        escrow_id: escrowId,
        seller_address: sellerAddress,
        buyer_address: buyerAddress,
        message: message?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: (_, { escrowId }) => {
      queryClient.invalidateQueries({ queryKey: ['deliveries', escrowId] });
    },
  });
}
