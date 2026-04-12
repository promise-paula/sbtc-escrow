import { toast } from 'sonner';
import { request } from '@stacks/connect';
import { Cl, type ClarityValue } from '@stacks/transactions';
import { CONTRACT_PRINCIPAL, STACKS_NETWORK } from './stacks-config';

async function adminCall(
  functionName: string,
  functionArgs: ClarityValue[],
  successMsg: string,
): Promise<string> {
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName,
    functionArgs,
    network: STACKS_NETWORK,
  });
  toast.success(successMsg, { description: 'Transaction submitted.' });
  return response.txId;
}

export function pauseContract(): Promise<string> {
  return adminCall('pause-contract', [], 'Contract paused');
}

export function unpauseContract(): Promise<string> {
  return adminCall('unpause-contract', [], 'Contract unpaused');
}

export function setPlatformFee(bps: number): Promise<string> {
  return adminCall('set-platform-fee', [Cl.uint(bps)], `Fee updated to ${bps} BPS (${(bps / 100).toFixed(2)}%)`);
}

export function setFeeRecipient(address: string): Promise<string> {
  return adminCall('set-fee-recipient', [Cl.standardPrincipal(address)], 'Fee recipient updated');
}

export function setDisputeTimeout(blocks: number): Promise<string> {
  return adminCall('set-dispute-timeout', [Cl.uint(blocks)], `Dispute timeout updated to ${blocks} blocks`);
}

export function initiateOwnershipTransfer(newOwner: string): Promise<string> {
  return adminCall('initiate-ownership-transfer', [Cl.standardPrincipal(newOwner)], 'Ownership transfer initiated');
}

export function resolveDisputeForBuyer(escrowId: number): Promise<string> {
  return adminCall('resolve-dispute-for-buyer', [Cl.uint(escrowId)], 'Dispute resolved — funds returned to buyer');
}

export function resolveDisputeForSeller(escrowId: number): Promise<string> {
  return adminCall('resolve-dispute-for-seller', [Cl.uint(escrowId)], 'Dispute resolved — funds released to seller');
}
