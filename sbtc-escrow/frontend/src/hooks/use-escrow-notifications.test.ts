import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

type Handler = (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => void;
const handlers: { table: string; event: string; fn: Handler }[] = [];

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    channel: () => {
      const ch = {
        on: (_type: string, cfg: { table: string; event: string }, fn: Handler) => {
          handlers.push({ table: cfg.table, event: cfg.event, fn });
          return ch;
        },
        subscribe: () => ch,
        unsubscribe: () => undefined,
      };
      return ch;
    },
    removeChannel: () => undefined,
  },
}));

const BUYER = 'ST38AEGHHPTZC78V67A70B6QK6FTKJ8XKHJZ9P634';
const SELLER = 'ST1Q7W4CND6FCXKXVTE58KTGXJHSV8FJ0RQ026KY0';
const V9 = 'ST3B5FYTCXN7CWSYT123YSEB7V2K2XE31JPMMRM9Y.escrow-v9';
let address = BUYER;

vi.mock('@/contexts/WalletContext', () => ({ useWallet: () => ({ address }) }));
vi.mock('@/hooks/use-settings', () => ({
  useSettings: () => ({ settings: { notifyConfirmations: true, notifyDisputes: true, notifyDeliveries: true } }),
}));
const fireNotification = vi.fn();
vi.mock('@/lib/notifications', () => ({ fireNotification: (...a: unknown[]) => fireNotification(...a) }));

import { useEscrowNotifications } from './use-escrow-notifications';

const emit = (table: string, event: string, row: Record<string, unknown>, old: Record<string, unknown> = {}) =>
  handlers.filter((h) => h.table === table && h.event === event).forEach((h) => h.fn({ new: row, old }));

const escrowRow = (status: number) => ({ id: 6, contract_id: V9, buyer: BUYER, seller: SELLER, beneficiary: null, status });

describe('useEscrowNotifications delivery alerts', () => {
  beforeEach(() => {
    handlers.length = 0;
    fireNotification.mockClear();
  });

  it('notifies the buyer when the escrow becomes Delivered on-chain', () => {
    address = BUYER;
    renderHook(() => useEscrowNotifications());
    emit('escrows', 'UPDATE', escrowRow(4), { status: 0 });
    expect(fireNotification).toHaveBeenCalledTimes(1);
    expect(fireNotification.mock.calls[0][0]).toBe('Work marked as delivered');
  });

  it("notifies once when the seller's note arrives before the status change", () => {
    address = BUYER;
    renderHook(() => useEscrowNotifications());
    emit('deliveries', 'INSERT', { escrow_id: 6, contract_id: V9, message: 'Sent to your email' });
    emit('escrows', 'UPDATE', escrowRow(4), { status: 0 });
    expect(fireNotification).toHaveBeenCalledTimes(1);
    expect(fireNotification.mock.calls[0][1].body).toContain('Sent to your email');
  });

  it('does not notify the seller about their own delivery', () => {
    address = SELLER;
    renderHook(() => useEscrowNotifications());
    emit('escrows', 'UPDATE', escrowRow(4), { status: 0 });
    expect(fireNotification).not.toHaveBeenCalled();
  });
});
