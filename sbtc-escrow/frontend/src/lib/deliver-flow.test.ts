import { describe, it, expect, vi } from 'vitest';
import { runDeliver } from './deliver-flow';

function setup(over: Partial<Parameters<typeof runDeliver>[0]> = {}) {
  const sendOnChain = vi.fn().mockResolvedValue(undefined);
  const saveRecord = vi.fn().mockResolvedValue(undefined);
  const opts = { onChainDelivery: true, isAuthenticated: true, message: '', sendOnChain, saveRecord, ...over };
  return { opts, sendOnChain: opts.sendOnChain as typeof sendOnChain, saveRecord: opts.saveRecord as typeof saveRecord };
}

describe('runDeliver on contracts with on-chain delivery (v7+)', () => {
  it('signals on-chain, then saves the note when signed in', async () => {
    const { opts, sendOnChain, saveRecord } = setup({ message: 'Sent to your email' });
    await expect(runDeliver(opts)).resolves.toEqual({ kind: 'delivered', note: 'saved' });
    expect(sendOnChain).toHaveBeenCalledBefore(saveRecord);
  });

  it('does not attempt the off-chain save when not signed in', async () => {
    const { opts, saveRecord } = setup({ isAuthenticated: false, message: 'Sent to your email' });
    await expect(runDeliver(opts)).resolves.toEqual({ kind: 'delivered', note: 'not-signed-in' });
    expect(saveRecord).not.toHaveBeenCalled();
  });

  it('reports no note when not signed in and nothing was typed', async () => {
    const { opts } = setup({ isAuthenticated: false, message: '   ' });
    await expect(runDeliver(opts)).resolves.toEqual({ kind: 'delivered', note: 'none' });
  });

  it('still reports the delivery when the off-chain save fails', async () => {
    const { opts } = setup({ message: 'x', saveRecord: vi.fn().mockRejectedValue(new Error('401')) });
    await expect(runDeliver(opts)).resolves.toEqual({ kind: 'delivered', note: 'failed' });
  });

  it('throws when the on-chain signal fails, without saving anything', async () => {
    const { opts, saveRecord } = setup({ sendOnChain: vi.fn().mockRejectedValue(new Error('User rejected')) });
    await expect(runDeliver(opts)).rejects.toThrow('User rejected');
    expect(saveRecord).not.toHaveBeenCalled();
  });
});

describe('runDeliver on legacy contracts (off-chain marker only)', () => {
  it('asks for sign-in first, since the record is the only delivery signal', async () => {
    const { opts, sendOnChain, saveRecord } = setup({ onChainDelivery: false, isAuthenticated: false });
    await expect(runDeliver(opts)).resolves.toEqual({ kind: 'needs-sign-in' });
    expect(sendOnChain).not.toHaveBeenCalled();
    expect(saveRecord).not.toHaveBeenCalled();
  });

  it('saves the record when signed in, and lets a failure surface', async () => {
    const { opts, sendOnChain } = setup({ onChainDelivery: false });
    await expect(runDeliver(opts)).resolves.toEqual({ kind: 'delivered', note: 'saved' });
    expect(sendOnChain).not.toHaveBeenCalled();
    const failing = setup({ onChainDelivery: false, saveRecord: vi.fn().mockRejectedValue(new Error('401')) });
    await expect(runDeliver(failing.opts)).rejects.toThrow('401');
  });
});
