import { toast } from 'sonner';
import { openContractCall } from '@stacks/connect';
import { uintCV, standardPrincipalCV } from '@stacks/transactions';
import { CONTRACT_ADDRESS, CONTRACT_NAME, STACKS_NETWORK } from './stacks-config';

function adminCall(
  functionName: string,
  functionArgs: ReturnType<typeof uintCV>[],
  successMsg: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      network: STACKS_NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName,
      functionArgs,
      onFinish: (data) => {
        toast.success(successMsg, { description: 'Transaction submitted.' });
        resolve(data.txId);
      },
      onCancel: () => {
        toast.error('Transaction cancelled');
        reject(new Error('User cancelled'));
      },
    });
  });
}

export function pauseContract(): Promise<string> {
  return adminCall('pause-contract', [], 'Contract paused');
}

export function unpauseContract(): Promise<string> {
  return adminCall('unpause-contract', [], 'Contract unpaused');
}

export function setPlatformFee(bps: number): Promise<string> {
  return adminCall('set-platform-fee', [uintCV(bps)], `Fee updated to ${bps} BPS (${(bps / 100).toFixed(2)}%)`);
}

export function setFeeRecipient(address: string): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      network: STACKS_NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'set-fee-recipient',
      functionArgs: [standardPrincipalCV(address)],
      onFinish: (data) => {
        toast.success('Fee recipient updated', { description: 'Transaction submitted.' });
        resolve(data.txId);
      },
      onCancel: () => {
        toast.error('Transaction cancelled');
        reject(new Error('User cancelled'));
      },
    });
  });
}

export function setDisputeTimeout(blocks: number): Promise<string> {
  return adminCall('set-dispute-timeout', [uintCV(blocks)], `Dispute timeout updated to ${blocks} blocks`);
}

export function initiateOwnershipTransfer(newOwner: string): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      network: STACKS_NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'initiate-ownership-transfer',
      functionArgs: [standardPrincipalCV(newOwner)],
      onFinish: (data) => {
        toast.success('Ownership transfer initiated', { description: 'Awaiting acceptance.' });
        resolve(data.txId);
      },
      onCancel: () => {
        toast.error('Transaction cancelled');
        reject(new Error('User cancelled'));
      },
    });
  });
}

export function resolveDisputeForBuyer(escrowId: number): Promise<string> {
  return adminCall('resolve-dispute-for-buyer', [uintCV(escrowId)], 'Dispute resolved — funds returned to buyer');
}

export function resolveDisputeForSeller(escrowId: number): Promise<string> {
  return adminCall('resolve-dispute-for-seller', [uintCV(escrowId)], 'Dispute resolved — funds released to seller');
}
