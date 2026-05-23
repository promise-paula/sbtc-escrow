import { toast } from 'sonner';
import { request } from '@stacks/connect';
import { Cl, type ClarityValue } from '@stacks/transactions';
import { STACKS_NETWORK } from './stacks-config';
import { TokenType } from './types';
import { contractSendPc } from './post-conditions';
import { categorizeTxError } from './tx-errors';

const PENDING_HINT = 'Confirms on Stacks in 1–2 minutes.';

/**
 * Admin actions also dispatch per-contract. Each Stacks contract version owns
 * its own admin state (owner, fee config, pause status, dispute timeout), so
 * admin calls must target the contract whose state they intend to mutate.
 *
 * - Platform-config mutations (pause/unpause, set-fee, etc.) → pass the
 *   contract you want to configure. The active contract is the normal case,
 *   but legacy admin operations (e.g. unpausing a v6 contract to let a stuck
 *   buyer refund) require this flexibility.
 * - Per-escrow dispute resolutions → pass `escrow.contractId` so the call
 *   reaches the contract that holds the disputed funds.
 */

async function adminCall(
  contractId: string,
  functionName: string,
  functionArgs: ClarityValue[],
  successMsg: string,
  errorAction: string,
  postConditions?: any[],
): Promise<string> {
  try {
    const response = await request('stx_callContract', {
      contract: contractId as `${string}.${string}`,
      functionName,
      functionArgs,
      ...(postConditions ? { postConditions } : {}),
      network: STACKS_NETWORK,
    });
    toast.success(successMsg, { description: PENDING_HINT });
    return response.txid;
  } catch (err) {
    const e = categorizeTxError(err, errorAction);
    toast.error(e.title, { description: e.description });
    throw err;
  }
}

export function pauseContract(contractId: string): Promise<string> {
  return adminCall(contractId, 'pause-contract', [], 'Contract paused', 'pause the contract');
}

export function unpauseContract(contractId: string): Promise<string> {
  return adminCall(contractId, 'unpause-contract', [], 'Contract unpaused', 'unpause the contract');
}

export function setPlatformFee(contractId: string, bps: number): Promise<string> {
  return adminCall(
    contractId,
    'set-platform-fee',
    [Cl.uint(bps)],
    `Fee updated to ${bps} BPS (${(bps / 100).toFixed(2)}%)`,
    'update the fee',
  );
}

export function setFeeRecipient(contractId: string, address: string): Promise<string> {
  return adminCall(
    contractId,
    'set-fee-recipient',
    [Cl.standardPrincipal(address)],
    'Fee recipient updated',
    'update the fee recipient',
  );
}

export function setDisputeTimeout(contractId: string, blocks: number): Promise<string> {
  return adminCall(
    contractId,
    'set-dispute-timeout',
    [Cl.uint(blocks)],
    `Dispute timeout updated to ${blocks} blocks`,
    'update the dispute timeout',
  );
}

export function transferOwnership(contractId: string, newOwner: string): Promise<string> {
  return adminCall(
    contractId,
    'transfer-ownership',
    [Cl.standardPrincipal(newOwner)],
    'Ownership transfer initiated',
    'initiate the ownership transfer',
  );
}

export function acceptOwnership(contractId: string): Promise<string> {
  return adminCall(contractId, 'accept-ownership', [], 'Ownership transfer accepted', 'accept ownership');
}

export function resolveDisputeForBuyer(
  contractId: string,
  escrowId: number,
  amount: number,
  feeAmount: number,
  tokenType: TokenType,
): Promise<string> {
  const totalRefund = amount + feeAmount;
  return adminCall(
    contractId,
    'resolve-dispute-for-buyer',
    [Cl.uint(escrowId)],
    'Dispute resolved — funds returned to buyer',
    'resolve the dispute',
    [contractSendPc(contractId, totalRefund, tokenType)],
  );
}

export function resolveDisputeForSeller(
  contractId: string,
  escrowId: number,
  amount: number,
  feeAmount: number,
  tokenType: TokenType,
): Promise<string> {
  const totalOutflow = amount + feeAmount;
  return adminCall(
    contractId,
    'resolve-dispute-for-seller',
    [Cl.uint(escrowId)],
    'Dispute resolved — funds released to seller',
    'resolve the dispute',
    [contractSendPc(contractId, totalOutflow, tokenType)],
  );
}

/**
 * v7+ only: resolve a disputed escrow with a partial split.
 * `buyerBps` is the buyer's share of the principal in basis points (0–10000).
 * Seller receives the remainder. Fee is split pro-rata.
 */
export function resolveDisputeSplit(
  contractId: string,
  escrowId: number,
  buyerBps: number,
  amount: number,
  feeAmount: number,
  tokenType: TokenType,
): Promise<string> {
  // Worst-case outflow from the contract equals the full escrow value (the
  // split rebalances who receives it, not whether it leaves).
  const totalOutflow = amount + feeAmount;
  return adminCall(
    contractId,
    'resolve-dispute-split',
    [Cl.uint(escrowId), Cl.uint(buyerBps)],
    `Dispute resolved — split ${buyerBps / 100}% buyer / ${(10000 - buyerBps) / 100}% seller`,
    'resolve the dispute split',
    [contractSendPc(contractId, totalOutflow, tokenType)],
  );
}
