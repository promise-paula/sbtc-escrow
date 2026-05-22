import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { CONTRACT_PRINCIPAL } from '@/lib/stacks-config';

export const DISPUTE_REASON_CATEGORIES = [
  { value: 'not_delivered',       label: 'Item / service not delivered' },
  { value: 'not_as_described',    label: 'Not as described' },
  { value: 'seller_unresponsive', label: 'Seller unresponsive' },
  { value: 'partial_delivery',    label: 'Partial delivery only' },
  { value: 'quality_issue',       label: 'Quality / defect issue' },
  { value: 'other',               label: 'Other' },
] as const;

export type DisputeReasonCategory = typeof DISPUTE_REASON_CATEGORIES[number]['value'];

export interface DisputeReason {
  id: number;
  escrowId: number;
  reasonCategory: DisputeReasonCategory;
  reasonLabel: string;
  details: string | null;
  submittedBy: string;
  createdAt: string;
}

export function useDisputeReason(escrowId: number) {
  return useQuery({
    queryKey: ['dispute-reason', CONTRACT_PRINCIPAL, escrowId],
    queryFn: async (): Promise<DisputeReason | null> => {
      if (!isSupabaseConfigured) return null;
      const { data, error } = await supabase
        .from('dispute_reasons')
        .select('id, escrow_id, reason_category, details, submitted_by, created_at')
        .eq('contract_id', CONTRACT_PRINCIPAL)
        .eq('escrow_id', escrowId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const label = DISPUTE_REASON_CATEGORIES.find(c => c.value === data.reason_category)?.label ?? data.reason_category;
      return {
        id: data.id,
        escrowId: data.escrow_id,
        reasonCategory: data.reason_category as DisputeReasonCategory,
        reasonLabel: label,
        details: data.details,
        submittedBy: data.submitted_by,
        createdAt: data.created_at,
      };
    },
    enabled: isSupabaseConfigured && escrowId > 0,
  });
}

/** Fetch reasons for multiple escrows at once (used by admin queue). */
export function useDisputeReasons(escrowIds: number[]) {
  return useQuery({
    queryKey: ['dispute-reasons', CONTRACT_PRINCIPAL, ...escrowIds.sort()],
    queryFn: async (): Promise<Record<number, DisputeReason>> => {
      if (!isSupabaseConfigured || escrowIds.length === 0) return {};
      const { data, error } = await supabase
        .from('dispute_reasons')
        .select('id, escrow_id, reason_category, details, submitted_by, created_at')
        .eq('contract_id', CONTRACT_PRINCIPAL)
        .in('escrow_id', escrowIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const map: Record<number, DisputeReason> = {};
      for (const row of data ?? []) {
        if (map[row.escrow_id]) continue; // keep newest only
        const label = DISPUTE_REASON_CATEGORIES.find(c => c.value === row.reason_category)?.label ?? row.reason_category;
        map[row.escrow_id] = {
          id: row.id,
          escrowId: row.escrow_id,
          reasonCategory: row.reason_category as DisputeReasonCategory,
          reasonLabel: label,
          details: row.details,
          submittedBy: row.submitted_by,
          createdAt: row.created_at,
        };
      }
      return map;
    },
    enabled: isSupabaseConfigured && escrowIds.length > 0,
  });
}

interface SubmitDisputeReasonArgs {
  escrowId: number;
  reasonCategory: DisputeReasonCategory;
  details?: string;
  submittedBy: string;
}

export function useSubmitDisputeReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ escrowId, reasonCategory, details, submittedBy }: SubmitDisputeReasonArgs) => {
      if (!isSupabaseConfigured) return; // graceful no-op when Supabase not set up
      const { error } = await supabase.from('dispute_reasons').insert({
        contract_id: CONTRACT_PRINCIPAL,
        escrow_id: escrowId,
        reason_category: reasonCategory,
        details: details?.trim() || null,
        submitted_by: submittedBy,
      });
      if (error) throw error;
    },
    onSuccess: (_, { escrowId }) => {
      queryClient.invalidateQueries({ queryKey: ['dispute-reason', CONTRACT_PRINCIPAL, escrowId] });
    },
  });
}
