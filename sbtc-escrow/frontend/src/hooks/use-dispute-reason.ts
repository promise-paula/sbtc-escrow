import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { CONTRACT_PRINCIPAL } from '@/lib/stacks-config';

/**
 * Dispute reason taxonomy. Reasons are tagged with the role(s) that can
 * pick them — buyers and sellers see different lists in the picker because
 * the same dispute action means very different things on either side.
 * A seller disputing for "Not as described" makes no sense, just as a
 * buyer disputing for "Buyer unresponsive" doesn't.
 *
 * The full list stays the source of truth (used for label lookups on
 * historical rows where the role might be ambiguous later, and for admins
 * reviewing the dispute queue). `getDisputeReasonsForRole()` returns the
 * filtered view appropriate for a given disputer role.
 */
export const DISPUTE_REASON_CATEGORIES = [
  // Buyer-side reasons — the buyer feels they didn't get what they paid for.
  { value: 'not_delivered',        label: 'Item / service not delivered',         roles: ['buyer'] as const },
  { value: 'not_as_described',     label: 'Not as described',                     roles: ['buyer'] as const },
  { value: 'seller_unresponsive',  label: 'Seller unresponsive',                  roles: ['buyer'] as const },
  { value: 'partial_delivery',     label: 'Partial delivery only',                roles: ['buyer'] as const },
  { value: 'quality_issue',        label: 'Quality / defect issue',               roles: ['buyer'] as const },
  // Seller-side reasons — the seller delivered but is being stiffed, or the
  // buyer is misusing the dispute system.
  { value: 'buyer_unresponsive',   label: "Buyer unresponsive / won't release",   roles: ['seller'] as const },
  { value: 'delivered_unreleased', label: 'Work delivered, payment not released', roles: ['seller'] as const },
  { value: 'bad_faith_dispute',    label: 'Buyer disputing in bad faith',         roles: ['seller'] as const },
  // Universal — for cases that don't fit any preset category.
  { value: 'other',                label: 'Other',                                roles: ['buyer', 'seller'] as const },
] as const;

export type DisputeReasonCategory = typeof DISPUTE_REASON_CATEGORIES[number]['value'];
export type DisputerRole = 'buyer' | 'seller';

/**
 * Return only the dispute reasons appropriate for the given role. Used by
 * the dispute picker UI on EscrowDetail.
 */
export function getDisputeReasonsForRole(role: DisputerRole) {
  return DISPUTE_REASON_CATEGORIES.filter((c) =>
    (c.roles as readonly string[]).includes(role),
  );
}

export interface DisputeReason {
  id: number;
  escrowId: number;
  reasonCategory: DisputeReasonCategory;
  reasonLabel: string;
  details: string | null;
  submittedBy: string;
  createdAt: string;
}

export function useDisputeReason(escrowId: number, contractId?: string) {
  const scopedContract = contractId ?? CONTRACT_PRINCIPAL;
  return useQuery({
    queryKey: ['dispute-reason', scopedContract, escrowId],
    queryFn: async (): Promise<DisputeReason | null> => {
      if (!isSupabaseConfigured) return null;
      const { data, error } = await supabase
        .from('dispute_reasons')
        .select('id, escrow_id, reason_category, details, submitted_by, created_at')
        .eq('contract_id', scopedContract)
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
