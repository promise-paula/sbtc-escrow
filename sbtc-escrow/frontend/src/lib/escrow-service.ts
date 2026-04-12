import { toast } from 'sonner';
import { openContractCall } from '@stacks/connect';
import {
  uintCV,
  stringUtf8CV,
  standardPrincipalCV,
  Pc,
} from '@stacks/transactions';
import { CONTRACT_ADDRESS, CONTRACT_NAME, STACKS_NETWORK } from './stacks-config';

export async function createEscrow(params: {
  seller: string;
  amount: number;
  description: string;
  duration: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      network: STACKS_NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'create-escrow',
      functionArgs: [
        standardPrincipalCV(params.seller),
        uintCV(params.amount),
        stringUtf8CV(params.description),
        uintCV(params.duration),
      ],
      postConditions: [
        Pc.principal(params.seller).willSendLte(params.amount).ustx(),
      ],
      onFinish: (data) => {
        toast.success('Escrow created', { description: 'Transaction submitted.' });
        resolve(data.txId);
      },
      onCancel: () => {
        toast.error('Transaction cancelled');
        reject(new Error('User cancelled'));
      },
    });
  });
}

export async function releaseEscrow(escrowId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      network: STACKS_NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'release-escrow',
      functionArgs: [uintCV(escrowId)],
      onFinish: (data) => {
        toast.success('Payment released', { description: 'Transaction submitted.' });
        resolve(data.txId);
      },
      onCancel: () => {
        toast.error('Transaction cancelled');
        reject(new Error('User cancelled'));
      },
    });
  });
}

export async function refundEscrow(escrowId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      network: STACKS_NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'refund-escrow',
      functionArgs: [uintCV(escrowId)],
      onFinish: (data) => {
        toast.success('Escrow refunded', { description: 'Transaction submitted.' });
        resolve(data.txId);
      },
      onCancel: () => {
        toast.error('Transaction cancelled');
        reject(new Error('User cancelled'));
      },
    });
  });
}

export async function disputeEscrow(escrowId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      network: STACKS_NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'dispute-escrow',
      functionArgs: [uintCV(escrowId)],
      onFinish: (data) => {
        toast.success('Dispute filed', { description: 'Transaction submitted.' });
        resolve(data.txId);
      },
      onCancel: () => {
        toast.error('Transaction cancelled');
        reject(new Error('User cancelled'));
      },
    });
  });
}

export async function extendEscrow(escrowId: number, additionalBlocks: number): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      network: STACKS_NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'extend-escrow',
      functionArgs: [uintCV(escrowId), uintCV(additionalBlocks)],
      onFinish: (data) => {
        toast.success('Escrow extended', { description: 'Transaction submitted.' });
        resolve(data.txId);
      },
      onCancel: () => {
        toast.error('Transaction cancelled');
        reject(new Error('User cancelled'));
      },
    });
  });
}

export async function resolveExpiredDispute(escrowId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      network: STACKS_NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'resolve-expired-dispute',
      functionArgs: [uintCV(escrowId)],
      onFinish: (data) => {
        toast.success('Disputed funds recovered', { description: 'Transaction submitted.' });
        resolve(data.txId);
      },
      onCancel: () => {
        toast.error('Transaction cancelled');
        reject(new Error('User cancelled'));
      },
    });
  });
}
