/**
 * What happened to the delivery and to its off-chain record.
 * - `saved`: the record (note + buyer notification) was written.
 * - `none`: not signed in and no note typed, so there was nothing to save.
 * - `not-signed-in`: a note was typed, but saving needs a wallet sign-in.
 * - `failed`: signed in, but the off-chain save failed.
 */
export type DeliverOutcome =
  | { kind: 'delivered'; note: 'saved' | 'none' | 'not-signed-in' | 'failed' }
  | { kind: 'needs-sign-in' };

interface RunDeliverOptions {
  /** v7+ contracts expose deliver(); older ones only have the off-chain record. */
  onChainDelivery: boolean;
  isAuthenticated: boolean;
  message: string;
  /** Sends the on-chain deliver() call. Throws if the wallet or tx fails. */
  sendOnChain: () => Promise<void>;
  /** Writes the off-chain deliveries row. Needs a wallet sign-in (RLS). */
  saveRecord: () => Promise<void>;
}

/**
 * Mark an escrow delivered. On v7+ the on-chain call is the delivery; the
 * off-chain record only carries the note, so its failure must never be
 * reported as a failed delivery (a retry would be rejected on-chain and cost
 * a fee). On legacy contracts the record is the only signal, so it needs a
 * sign-in up front and its errors propagate.
 */
export async function runDeliver(opts: RunDeliverOptions): Promise<DeliverOutcome> {
  const { onChainDelivery, isAuthenticated, message, sendOnChain, saveRecord } = opts;

  if (!onChainDelivery) {
    if (!isAuthenticated) return { kind: 'needs-sign-in' };
    await saveRecord();
    return { kind: 'delivered', note: 'saved' };
  }

  await sendOnChain();

  if (!isAuthenticated) {
    return { kind: 'delivered', note: message.trim() ? 'not-signed-in' : 'none' };
  }
  try {
    await saveRecord();
    return { kind: 'delivered', note: 'saved' };
  } catch {
    return { kind: 'delivered', note: 'failed' };
  }
}
