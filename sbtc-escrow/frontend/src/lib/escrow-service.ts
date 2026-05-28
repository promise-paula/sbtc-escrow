import { toast } from 'sonner';
import { request } from '@stacks/connect';
import { Cl } from '@stacks/transactions';
import { STACKS_NETWORK, supportsV3Features } from './stacks-config';
import { TokenType } from './types';
import { contractSendPc, userSendPc } from './post-conditions';
import { categorizeTxError } from './tx-errors';
import { addPending } from './pending-escrows';

const PENDING_HINT = 'Confirms on Stacks in 1–2 minutes.';

/**
 * Action helpers dispatch to a specific contract identified by `contractId`
 * (e.g. `ST1HK6...escrow-v7`). Every helper requires it explicitly — no
 * hidden default — so legacy escrows transparently work from the same UI.
 *
 * `contractId` must come from the escrow row itself (`escrow.contractId`),
 * NOT from `CONTRACT_PRINCIPAL`. Otherwise a refund on a legacy v6 escrow
 * would be signed against the v7 contract and fail.
 *
 * `createEscrow` is the only helper that should be passed `CONTRACT_PRINCIPAL`
 * directly — new escrows can only be created on the currently active version.
 */

/** Fee = amount * platformFeeBps / 10_000. Default platformFeeBps = 50 (0.5%). */
function estimateFee(amount: number, feeBps = 50): number {
  return Math.floor((amount * feeBps) / 10_000);
}

export async function createEscrow(params: {
  contractId: string;
  buyer: string;
  seller: string;
  amount: number;
  description: string;
  duration: number;
  tokenType: TokenType;
  feeBps?: number;
  /**
   * Optional secondary authority on the escrow (v3+ contracts only).
   * If set on a v3+ contract, the beneficiary has the same release / refund /
   * dispute / extend rights as the buyer. Silently ignored on v2 / v7
   * contracts (those don't take this argument).
   */
  beneficiary?: string;
}): Promise<string> {
  const fee = estimateFee(params.amount, params.feeBps);
  const totalAmount = params.amount + fee;
  const isV3 = supportsV3Features(params.contractId);

  // v3 contracts take a 6th `beneficiary (optional principal)` argument.
  // Sending it to v2 would cause a wrong-arg-count contract-call failure.
  const baseArgs = [
    Cl.standardPrincipal(params.seller),
    Cl.uint(params.amount),
    Cl.stringUtf8(params.description),
    Cl.uint(params.duration),
    Cl.uint(params.tokenType),
  ];
  const functionArgs = isV3
    ? [
        ...baseArgs,
        params.beneficiary
          ? Cl.some(Cl.standardPrincipal(params.beneficiary))
          : Cl.none(),
      ]
    : baseArgs;

  try {
    const response = await request('stx_callContract', {
      contract: params.contractId as `${string}.${string}`,
      functionName: 'create-escrow',
      functionArgs,
      postConditions: [
        userSendPc(params.buyer, totalAmount, params.tokenType),
      ],
      network: STACKS_NETWORK,
    });

    // Optimistic placeholder — the chain takes ~1.5 min to confirm and the
    // chainhook indexer adds a bit more lag on top. Without this the new
    // escrow simply doesn't appear in /escrows for a few minutes after the
    // user signs. The placeholder is dropped automatically once the real
    // row arrives in Supabase (see use-pending-escrows).
    addPending({
      txId: response.txid,
      buyer: params.buyer,
      seller: params.seller,
      amount: params.amount,
      feeAmount: fee,
      tokenType: params.tokenType,
      description: params.description,
      durationBlocks: params.duration,
      submittedAt: new Date().toISOString(),
      txStatus: 'submitted',
    });

    toast.success('Escrow submitted', { description: PENDING_HINT });
    return response.txid;
  } catch (err) {
    const e = categorizeTxError(err, 'create the escrow');
    toast.error(e.title, { description: e.description });
    throw err;
  }
}

export async function releaseEscrow(
  contractId: string,
  escrowId: number,
  amount: number,
  feeAmount: number,
  tokenType: TokenType,
): Promise<string> {
  const totalOutflow = amount + feeAmount;
  try {
    const response = await request('stx_callContract', {
      contract: contractId as `${string}.${string}`,
      functionName: 'release',
      functionArgs: [Cl.uint(escrowId)],
      postConditions: [
        contractSendPc(contractId, totalOutflow, tokenType),
      ],
      network: STACKS_NETWORK,
    });
    toast.success('Release submitted', { description: PENDING_HINT });
    return response.txid;
  } catch (err) {
    const e = categorizeTxError(err, 'release the funds');
    toast.error(e.title, { description: e.description });
    throw err;
  }
}

export async function refundEscrow(
  contractId: string,
  escrowId: number,
  amount: number,
  feeAmount: number,
  tokenType: TokenType,
): Promise<string> {
  const totalRefund = amount + feeAmount;
  try {
    const response = await request('stx_callContract', {
      contract: contractId as `${string}.${string}`,
      functionName: 'refund',
      functionArgs: [Cl.uint(escrowId)],
      postConditions: [
        contractSendPc(contractId, totalRefund, tokenType),
      ],
      network: STACKS_NETWORK,
    });
    toast.success('Refund submitted', { description: PENDING_HINT });
    return response.txid;
  } catch (err) {
    const e = categorizeTxError(err, 'refund the escrow');
    toast.error(e.title, { description: e.description });
    throw err;
  }
}

export async function disputeEscrow(
  contractId: string,
  escrowId: number,
): Promise<string> {
  try {
    const response = await request('stx_callContract', {
      contract: contractId as `${string}.${string}`,
      functionName: 'dispute',
      functionArgs: [Cl.uint(escrowId)],
      network: STACKS_NETWORK,
    });
    toast.success('Dispute submitted', { description: PENDING_HINT });
    return response.txid;
  } catch (err) {
    const e = categorizeTxError(err, 'open the dispute');
    toast.error(e.title, { description: e.description });
    throw err;
  }
}

export async function extendEscrow(
  contractId: string,
  escrowId: number,
  additionalBlocks: number,
): Promise<string> {
  try {
    const response = await request('stx_callContract', {
      contract: contractId as `${string}.${string}`,
      functionName: 'extend-escrow',
      functionArgs: [Cl.uint(escrowId), Cl.uint(additionalBlocks)],
      network: STACKS_NETWORK,
    });
    toast.success('Deadline extension submitted', { description: PENDING_HINT });
    return response.txid;
  } catch (err) {
    const e = categorizeTxError(err, 'extend the deadline');
    toast.error(e.title, { description: e.description });
    throw err;
  }
}

export async function resolveExpiredDispute(
  contractId: string,
  escrowId: number,
  amount: number,
  feeAmount: number,
  tokenType: TokenType,
): Promise<string> {
  const totalRefund = amount + feeAmount;
  try {
    const response = await request('stx_callContract', {
      contract: contractId as `${string}.${string}`,
      functionName: 'resolve-expired-dispute',
      functionArgs: [Cl.uint(escrowId)],
      postConditions: [
        contractSendPc(contractId, totalRefund, tokenType),
      ],
      network: STACKS_NETWORK,
    });
    toast.success('Recovery submitted', { description: PENDING_HINT });
    return response.txid;
  } catch (err) {
    const e = categorizeTxError(err, 'recover your funds');
    toast.error(e.title, { description: e.description });
    throw err;
  }
}

/**
 * v3+ only: seller self-rescue. Releases full amount to seller and fee to
 * fee-recipient when a delivered escrow has been stuck in DISPUTED past
 * `2 * dispute-timeout` blocks (i.e. admin abandoned the resolution).
 *
 * Callers must gate this on `supportsV3Features(contractId)` AND on the
 * read-only `is-seller-rescue-eligible(escrow-id)` returning true.
 */
export async function resolveExpiredDisputeForSeller(
  contractId: string,
  escrowId: number,
  amount: number,
  feeAmount: number,
  tokenType: TokenType,
): Promise<string> {
  if (!supportsV3Features(contractId)) {
    throw new Error(
      `resolveExpiredDisputeForSeller requires a v3+ contract; ${contractId} does not support it.`,
    );
  }
  // The contract transfers `amount` to seller and `fee` to fee-recipient;
  // both come out of the contract's locked balance.
  const totalRelease = amount + feeAmount;
  try {
    const response = await request('stx_callContract', {
      contract: contractId as `${string}.${string}`,
      functionName: 'resolve-expired-dispute-for-seller',
      functionArgs: [Cl.uint(escrowId)],
      postConditions: [
        contractSendPc(contractId, totalRelease, tokenType),
      ],
      network: STACKS_NETWORK,
    });
    toast.success('Self-rescue submitted', { description: PENDING_HINT });
    return response.txid;
  } catch (err) {
    const e = categorizeTxError(err, 'recover your funds as seller');
    toast.error(e.title, { description: e.description });
    throw err;
  }
}

/**
 * v7+ only: seller signals on-chain that work has been delivered. Moves the
 * escrow into STATUS_DELIVERED and starts the review window during which the
 * buyer cannot unilaterally refund without raising a dispute first.
 *
 * Older contract versions don't expose `deliver`; callers should gate the
 * affordance on `escrow.contractId` being a v7+ contract.
 */
export async function deliverEscrow(
  contractId: string,
  escrowId: number,
): Promise<string> {
  try {
    const response = await request('stx_callContract', {
      contract: contractId as `${string}.${string}`,
      functionName: 'deliver',
      functionArgs: [Cl.uint(escrowId)],
      network: STACKS_NETWORK,
    });
    toast.success('Delivery signal submitted', { description: PENDING_HINT });
    return response.txid;
  } catch (err) {
    const e = categorizeTxError(err, 'signal delivery');
    toast.error(e.title, { description: e.description });
    throw err;
  }
}
