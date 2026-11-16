import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Answers to the optional "How did you hear about sBTC Escrow?" question.
 * Values must match the check constraint on referral_answers.source.
 * No answer is preselected and none is singled out.
 */
export const REFERRAL_SOURCES = [
  { value: 'search', label: 'Search (Google, etc.)' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'stacks_community', label: 'Stacks community (Discord, Telegram, forum)' },
  { value: 'friend', label: 'A friend or colleague' },
  { value: 'counterparty', label: 'The other person in this escrow' },
  { value: 'other', label: 'Other' },
] as const;

export type ReferralSource = typeof REFERRAL_SOURCES[number]['value'];

/** The signed-in wallet's own answer, if any. RLS only returns its own row. */
export function useReferralAnswer(address: string | null | undefined, isAuthenticated: boolean) {
  return useQuery({
    queryKey: ['referral-answer', address],
    enabled: isSupabaseConfigured && !!address && isAuthenticated,
    queryFn: async (): Promise<{ source: ReferralSource } | null> => {
      const { data, error } = await supabase
        .from('referral_answers')
        .select('source')
        .eq('wallet_address', address as string)
        .maybeSingle();
      if (error) throw error;
      return (data as { source: ReferralSource } | null) ?? null;
    },
  });
}

interface SubmitReferralAnswerArgs {
  address: string;
  source: ReferralSource;
  /** Only stored with 'other'. */
  otherText: string | null;
}

/** Saves the wallet's one answer. A second save is a no-op, not an error. */
export function useSubmitReferralAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ address, source, otherText }: SubmitReferralAnswerArgs) => {
      if (!isSupabaseConfigured) return;
      const { error } = await supabase.from('referral_answers').insert({
        wallet_address: address,
        source,
        other_text: source === 'other' ? otherText : null,
      });
      // 23505: this wallet already answered (one answer per wallet).
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: (_, { address }) => {
      queryClient.invalidateQueries({ queryKey: ['referral-answer', address] });
    },
  });
}
