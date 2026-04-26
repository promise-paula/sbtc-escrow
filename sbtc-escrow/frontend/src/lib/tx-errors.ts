/**
 * Translate raw wallet / network errors into friendly toast messages.
 * Mirrors the categorization used by CreateEscrow's inline error UI so
 * users see consistent language regardless of which action failed.
 */

export interface TxErrorMessage {
  title: string;
  description: string;
}

export function categorizeTxError(err: unknown, action: string): TxErrorMessage {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();

  if (
    low.includes('reject') ||
    low.includes('denied') ||
    low.includes('cancel') ||
    low.includes('dismissed') ||
    low.includes('closed')
  ) {
    return {
      title: 'Wallet prompt declined',
      description: 'Approve the prompt in your wallet to continue.',
    };
  }

  if (low.includes('insufficient') || low.includes('balance')) {
    return {
      title: 'Not enough in your wallet',
      description: 'Top up — you also need a small amount of STX for the network fee.',
    };
  }

  if (low.includes('network') || low.includes('fetch') || low.includes('timeout')) {
    return {
      title: 'Network unreachable',
      description: 'Check your connection and try again.',
    };
  }

  return {
    title: `Couldn't ${action}`,
    description:
      msg.length > 0 && msg.length < 140
        ? msg
        : 'Try again, or check the explorer for details.',
  };
}
