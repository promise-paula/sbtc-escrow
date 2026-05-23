import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type MessageRole = 'buyer' | 'seller';

export interface EscrowMessage {
  id: number;
  contractId: string;
  escrowId: number;
  senderAddress: string;
  senderRole: MessageRole;
  message: string;
  createdAt: string; // ISO
}

interface MessageRow {
  id: number;
  contract_id: string;
  escrow_id: number;
  sender_address: string;
  sender_role: MessageRole;
  message: string;
  created_at: string;
}

function mapRow(row: MessageRow): EscrowMessage {
  return {
    id: row.id,
    contractId: row.contract_id,
    escrowId: row.escrow_id,
    senderAddress: row.sender_address,
    senderRole: row.sender_role,
    message: row.message,
    createdAt: row.created_at,
  };
}

/**
 * Read the full message thread for an escrow, oldest first.
 *
 * Scoped to (contractId, escrowId) so future contract migrations keep their
 * conversations cleanly separated.
 */
export function useMessages(contractId: string, escrowId: number) {
  return useQuery({
    queryKey: ['messages', contractId, escrowId],
    queryFn: async (): Promise<EscrowMessage[]> => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from('escrow_messages')
        .select('id, contract_id, escrow_id, sender_address, sender_role, message, created_at')
        .eq('contract_id', contractId)
        .eq('escrow_id', escrowId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    enabled: isSupabaseConfigured && escrowId > 0 && !!contractId,
  });
}

interface SendMessageArgs {
  contractId: string;
  escrowId: number;
  senderAddress: string;
  senderRole: MessageRole;
  message: string;
}

/**
 * Post a message into an escrow thread.
 *
 * The frontend enforces `senderRole` based on the connected wallet's relation
 * to the escrow (buyer vs seller). Without wallet-authenticated RLS, this is
 * advisory — anyone with the anon key can technically post as any role. Once
 * SIWE auth lands, an RLS policy should enforce this on the database side.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contractId,
      escrowId,
      senderAddress,
      senderRole,
      message,
    }: SendMessageArgs) => {
      if (!isSupabaseConfigured) throw new Error('Supabase not configured');
      const trimmed = message.trim();
      if (!trimmed) throw new Error('Message cannot be empty');
      if (trimmed.length > 2000) throw new Error('Message too long (2000 char max)');
      const { error } = await supabase.from('escrow_messages').insert({
        contract_id: contractId,
        escrow_id: escrowId,
        sender_address: senderAddress,
        sender_role: senderRole,
        message: trimmed,
      });
      if (error) throw error;
    },
    onSuccess: (_, { contractId, escrowId }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', contractId, escrowId] });
    },
  });
}
