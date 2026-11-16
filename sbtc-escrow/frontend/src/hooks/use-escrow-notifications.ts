import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useWallet } from '@/contexts/WalletContext';
import { useSettings } from '@/hooks/use-settings';
import { fireNotification } from '@/lib/notifications';
import { EscrowStatus } from '@/lib/types';

interface EscrowRow {
  id: number;
  contract_id?: string;
  buyer: string;
  seller: string;
  // v3+ optional co-buyer with full release/refund/dispute rights — must be
  // notified on state changes too, otherwise the only way they'd find out
  // a dispute opened on "their" escrow is by manually refreshing.
  beneficiary: string | null;
  status: number;
}

/**
 * Subscribe to Supabase Realtime and fire browser notifications when escrows
 * involving the connected wallet change state. No-op unless the user has
 * granted notification permission and toggled the relevant preference.
 */
export function useEscrowNotifications() {
  const { address } = useWallet();
  const { settings } = useSettings();
  const lastSeenStatus = useRef<Map<number, number>>(new Map());
  // Escrows the buyer was already told about. A delivery can arrive twice:
  // the seller's off-chain note (only when they're signed in) and the
  // indexed on-chain status change. Notify once, whichever comes first.
  const deliveryNotified = useRef<Set<string>>(new Set());

  useEffect(() => {
    const notifyDelivery = (contractId: string | undefined, escrowId: number, message: string | null) => {
      const key = `${contractId ?? ''}:${escrowId}`;
      if (deliveryNotified.current.has(key)) return;
      deliveryNotified.current.add(key);
      fireNotification('Work marked as delivered', {
        body: message
          ? `Escrow #${escrowId}: "${message}"`
          : `Escrow #${escrowId} — seller says work is done. Review and release when ready.`,
        tag: `delivery-${key}`,
        url: `/escrow/${escrowId}`,
      });
    };

    if (!address || !isSupabaseConfigured) return;

    const channel = supabase
      .channel('escrow-user-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'escrows' },
        (payload) => {
          const row = payload.new as EscrowRow;
          if (row.seller !== address) return;
          if (!settings.notifyConfirmations) return;
          fireNotification('New escrow received', {
            body: `Escrow #${row.id} — you're the seller`,
            tag: `escrow-${row.id}-new`,
            url: `/escrow/${row.id}`,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'escrows' },
        (payload) => {
          const row = payload.new as EscrowRow;
          const old = payload.old as Partial<EscrowRow>;

          // Filter to escrows involving this user (buyer, seller, OR
          // beneficiary — the beneficiary has buyer-equivalent rights and
          // needs the same notifications).
          if (row.buyer !== address && row.seller !== address && row.beneficiary !== address) return;

          // Detect status transition (use ref to dedupe across reconnects)
          const prevStatus = lastSeenStatus.current.get(row.id) ?? old.status;
          if (prevStatus === undefined || prevStatus === row.status) return;
          lastSeenStatus.current.set(row.id, row.status);

          // On-chain delivery (v7+), indexed from the chain. Works even when
          // the seller never signed in, so no off-chain note was written.
          if (row.status === EscrowStatus.Delivered) {
            if (row.seller === address || !settings.notifyDeliveries) return;
            notifyDelivery(row.contract_id, row.id, null);
            return;
          }

          const isDispute = row.status === EscrowStatus.Disputed;
          const isCompletion =
            row.status === EscrowStatus.Released ||
            row.status === EscrowStatus.Refunded;

          if (isDispute && !settings.notifyDisputes) return;
          if (isCompletion && !settings.notifyConfirmations) return;

          const role =
            row.buyer === address ? 'buyer'
            : row.seller === address ? 'seller'
            : 'beneficiary';
          let title = '';
          if (row.status === EscrowStatus.Released) title = 'Escrow released';
          else if (row.status === EscrowStatus.Refunded) title = 'Escrow refunded';
          else if (row.status === EscrowStatus.Disputed) title = 'Escrow disputed';
          else return;

          fireNotification(title, {
            body: `Escrow #${row.id} — you're the ${role}`,
            tag: `escrow-${row.id}-${row.status}`,
            url: `/escrow/${row.id}`,
          });
        }
      )
      .subscribe();

    // Second channel: delivery signals (server-side filtered to this buyer)
    const deliveryChannel = supabase
      .channel('delivery-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deliveries',
          filter: `buyer_address=eq.${address}`,
        },
        (payload) => {
          if (!settings.notifyDeliveries) return;
          const row = payload.new as { escrow_id: number; contract_id?: string; message: string | null };
          notifyDelivery(row.contract_id, row.escrow_id, row.message);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
      deliveryChannel.unsubscribe();
      supabase.removeChannel(deliveryChannel);
    };
  }, [address, settings.notifyConfirmations, settings.notifyDisputes, settings.notifyDeliveries]);
}
