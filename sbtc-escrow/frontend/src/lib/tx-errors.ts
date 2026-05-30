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

  // ERR_CONTRACT_PAUSED (u1002) — admin paused while the user was confirming.
  // Surfaces a clear message instead of the generic "Couldn't X" fallback.
  if (low.includes('u1002') || low.includes('contract_paused') || low.includes('contract paused')) {
    return {
      title: 'Contract is paused',
      description: 'Admin paused the contract. Try again once it resumes.',
    };
  }

  // ERR_PAUSE_COOLDOWN_ACTIVE (u4003) — v3 anti-chaining guard. Admin tried to
  // re-pause before the previous pause+cooldown window elapsed. Without this
  // case admins see a generic "Couldn't pause the contract" and have to dig
  // through Explorer to learn why.
  if (low.includes('u4003')) {
    return {
      title: 'Pause cooldown still active',
      description:
        'The contract was recently paused; you must wait for the cooldown window to elapse before pausing again.',
    };
  }

  // ERR_INVALID_PAUSE_DURATION (u4001) — duration outside contract bounds
  // (must be 1..max-pause-duration). Admin sees this if they typed a custom
  // block count that's too small or way too large.
  if (low.includes('u4001')) {
    return {
      title: 'Invalid pause duration',
      description:
        'The duration is outside the allowed range. Pick a value between 1 and the contract maximum.',
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Contract revert codes — mapped one→one with the assertions in the v3
  // contract. Each one is a real race or misuse that the user can recover
  // from with the right context, hence the specific guidance instead of
  // the generic "Couldn't X" fallback. Keep in sync with `escrow-mainnet-v3.clar`.
  // ──────────────────────────────────────────────────────────────────────

  // ERR_UNAUTHORIZED (u1001) — wallet is not buyer/seller/beneficiary/admin
  // for this action. Most commonly a non-admin trying an admin call, or a
  // beneficiary-less escrow getting a release attempt from a third party.
  if (low.includes('u1001')) {
    return {
      title: 'Not authorized',
      description: 'This wallet does not have permission for that action on this escrow.',
    };
  }

  // ERR_ESCROW_ALREADY_COMPLETED (u2002) — race: counterparty released,
  // refunded, or resolved the escrow before this tx landed.
  if (low.includes('u2002')) {
    return {
      title: 'Escrow already completed',
      description: 'Someone else acted on this escrow before your tx landed. Refresh to see the final state.',
    };
  }

  // ERR_ESCROW_EXPIRED (u2003) — buyer tried to release after expiry.
  // After expiry only refund-after-expiry is allowed.
  if (low.includes('u2003')) {
    return {
      title: 'Escrow has expired',
      description: 'The deadline passed. The buyer can refund instead of releasing.',
    };
  }

  // ERR_ESCROW_NOT_EXPIRED (u2004) — seller tried to refund or self-rescue
  // before the escrow deadline (or, for self-rescue, before 2× dispute-timeout).
  if (low.includes('u2004')) {
    return {
      title: 'Too early',
      description: 'The deadline has not been reached yet. Wait for expiry or rely on the standard release flow.',
    };
  }

  // ERR_SELF_ESCROW (u2007) — buyer === seller. Caught client-side already,
  // but maps it in case a wallet bypasses the form-level check.
  if (low.includes('u2007')) {
    return {
      title: 'Cannot pay yourself',
      description: 'The buyer and seller addresses must be different.',
    };
  }

  // ERR_DISPUTE_NOT_TIMED_OUT (u2008) — buyer tried to claim expired dispute
  // before the dispute timeout elapsed.
  if (low.includes('u2008')) {
    return {
      title: 'Dispute timeout not reached',
      description: 'You can only claim a timed-out dispute after the dispute window has fully elapsed.',
    };
  }

  // ERR_NOT_DISPUTED (u2009) — caller tried to resolve a dispute on an escrow
  // that has no active dispute.
  if (low.includes('u2009')) {
    return {
      title: 'No active dispute',
      description: 'This escrow does not have an open dispute to resolve.',
    };
  }

  // ERR_IN_REVIEW_PERIOD (u2014) — buyer attempted to refund during the
  // post-delivery review window. They must wait for the window to lapse.
  if (low.includes('u2014')) {
    return {
      title: 'Review period active',
      description: 'The seller has signaled delivery — buyer cannot refund until the review window ends.',
    };
  }

  // ERR_NOT_DELIVERED (u2016) — seller tried to self-rescue without first
  // signaling delivery. Self-rescue requires the delivered state.
  if (low.includes('u2016')) {
    return {
      title: 'Mark as delivered first',
      description: 'Self-rescue requires you to have signaled delivery on-chain before the dispute timeout.',
    };
  }

  // ERR_SELF_BENEFICIARY (u2017) — beneficiary === buyer or seller. Caught
  // client-side, but maps it for defense in depth.
  if (low.includes('u2017')) {
    return {
      title: 'Beneficiary must differ',
      description: 'The beneficiary cannot be the same address as the buyer or seller.',
    };
  }

  // ERR_INVALID_AMOUNT (u2005) / ERR_INVALID_DURATION (u2006) — amount or
  // duration outside contract-enforced bounds. Caught client-side, mapped here.
  if (low.includes('u2005')) {
    return {
      title: 'Amount out of range',
      description: 'The amount is outside the allowed bounds for this token.',
    };
  }
  if (low.includes('u2006')) {
    return {
      title: 'Duration out of range',
      description: 'The duration is outside the allowed bounds (~5 min minimum, ~365 days maximum).',
    };
  }

  // ERR_TRANSFER_FAILED (u3001) — sBTC or STX token transfer reverted.
  // Usually means the wallet's signed balance dropped below the post-condition
  // floor in a concurrent tx. Asking the user to retry is the right move.
  if (low.includes('u3001')) {
    return {
      title: 'Token transfer failed',
      description: 'The sBTC or STX transfer was rejected. Check your wallet balance and try again.',
    };
  }

  // ERR_INSUFFICIENT_BALANCE (u3002) — contract noticed a balance shortfall
  // mid-transfer. Different from the wallet-level "insufficient" string match
  // above, which catches client-side balance checks.
  if (low.includes('u3002')) {
    return {
      title: 'Insufficient balance',
      description: 'Not enough sBTC / STX to complete this transfer. Top up and retry.',
    };
  }

  // ERR_SWEEP_EXCEEDS_FREE_BALANCE (u4002) — admin tried to sweep more than
  // the un-locked (orphan) portion of the contract balance. The locked-funds
  // invariant prevented the sweep.
  if (low.includes('u4002')) {
    return {
      title: 'Nothing to sweep',
      description: 'All contract funds are locked in active escrows. Nothing to send to the fee recipient.',
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
