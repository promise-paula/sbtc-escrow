import { toast } from 'sonner';
import { request } from '@stacks/connect';
import { Cl, type ClarityValue } from '@stacks/transactions';
import { CONTRACT_PRINCIPAL, STACKS_NETWORK } from './stacks-config';
import { TokenType } from './types';
import { contractSendPc } from './post-conditions';
import { categorizeTxError } from './tx-errors';

const PENDING_HINT = 'Confirms on Stacks in 1–2 minutes.';

async function adminCall(
  functionName: string,
  functionArgs: ClarityValue[],
  successMsg: string,
  errorAction: string,
  postConditions?: any[],
): Promise<string> {
  try {
    const response = await request('stx_callContract', {
      contract: CONTRACT_PRINCIPAL,
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

export function pauseContract(): Promise<string> {
  return adminCall('pause-contract', [], 'Contract paused', 'pause the contract');
}

export function unpauseContract(): Promise<string> {
  return adminCall('unpause-contract', [], 'Contract unpaused', 'unpause the contract');
}

export function setPlatformFee(bps: number): Promise<string> {
  return adminCall(
    'set-platform-fee',
    [Cl.uint(bps)],
    `Fee updated to ${bps} BPS (${(bps / 100).toFixed(2)}%)`,
    'update the fee',
  );
}

export function setFeeRecipient(address: string): Promise<string> {
  return adminCall(
    'set-fee-recipient',
    [Cl.standardPrincipal(address)],
    'Fee recipient updated',
    'update the fee recipient',
  );
}

export function setDisputeTimeout(blocks: number): Promise<string> {
  return adminCall(
    'set-dispute-timeout',
    [Cl.uint(blocks)],
    `Dispute timeout updated to ${blocks} blocks`,
    'update the dispute timeout',
  );
}

export function transferOwnership(newOwner: string): Promise<string> {
  return adminCall(
    'transfer-ownership',
    [Cl.standardPrincipal(newOwner)],
    'Ownership transfer initiated',
    'initiate the ownership transfer',
  );
}

export function acceptOwnership(): Promise<string> {
  return adminCall('accept-ownership', [], 'Ownership transfer accepted', 'accept ownership');
}

export function resolveDisputeForBuyer(escrowId: number, amount: number, feeAmount: number, tokenType: TokenType): Promise<string> {
  const totalRefund = amount + feeAmount;
  return adminCall(
    'resolve-dispute-for-buyer',
    [Cl.uint(escrowId)],
    'Dispute resolved — funds returned to buyer',
    'resolve the dispute',
    [contractSendPc(totalRefund, tokenType)],
  );
}

export function resolveDisputeForSeller(escrowId: number, amount: number, feeAmount: number, tokenType: TokenType): Promise<string> {
  const totalOutflow = amount + feeAmount;
  return adminCall(
    'resolve-dispute-for-seller',
    [Cl.uint(escrowId)],
    'Dispute resolved — funds released to seller',
    'resolve the dispute',
    [contractSendPc(totalOutflow, tokenType)],
  );
}
