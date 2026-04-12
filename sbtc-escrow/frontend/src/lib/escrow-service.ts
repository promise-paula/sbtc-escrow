import { toast } from 'sonner';
import { request } from '@stacks/connect';
import { Cl, Pc } from '@stacks/transactions';
import { CONTRACT_PRINCIPAL, STACKS_NETWORK } from './stacks-config';

export async function createEscrow(params: {
  seller: string;
  amount: number;
  description: string;
  duration: number;
}): Promise<string> {
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'create-escrow',
    functionArgs: [
      Cl.standardPrincipal(params.seller),
      Cl.uint(params.amount),
      Cl.stringUtf8(params.description),
      Cl.uint(params.duration),
    ],
    postConditions: [
      Pc.principal(params.seller).willSendLte(params.amount).ustx(),
    ],
    network: STACKS_NETWORK,
  });
  toast.success('Escrow created', { description: 'Transaction submitted.' });
  return response.txId;
}

export async function releaseEscrow(escrowId: number): Promise<string> {
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'release-escrow',
    functionArgs: [Cl.uint(escrowId)],
    network: STACKS_NETWORK,
  });
  toast.success('Payment released', { description: 'Transaction submitted.' });
  return response.txId;
}

export async function refundEscrow(escrowId: number): Promise<string> {
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'refund-escrow',
    functionArgs: [Cl.uint(escrowId)],
    network: STACKS_NETWORK,
  });
  toast.success('Escrow refunded', { description: 'Transaction submitted.' });
  return response.txId;
}

export async function disputeEscrow(escrowId: number): Promise<string> {
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'dispute-escrow',
    functionArgs: [Cl.uint(escrowId)],
    network: STACKS_NETWORK,
  });
  toast.success('Dispute filed', { description: 'Transaction submitted.' });
  return response.txId;
}

export async function extendEscrow(escrowId: number, additionalBlocks: number): Promise<string> {
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'extend-escrow',
    functionArgs: [Cl.uint(escrowId), Cl.uint(additionalBlocks)],
    network: STACKS_NETWORK,
  });
  toast.success('Escrow extended', { description: 'Transaction submitted.' });
  return response.txId;
}

export async function resolveExpiredDispute(escrowId: number): Promise<string> {
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'resolve-expired-dispute',
    functionArgs: [Cl.uint(escrowId)],
    network: STACKS_NETWORK,
  });
  toast.success('Disputed funds recovered', { description: 'Transaction submitted.' });
  return response.txId;
}
