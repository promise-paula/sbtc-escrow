import { toast } from 'sonner';
import { request } from '@stacks/connect';
import { Cl } from '@stacks/transactions';
import { CONTRACT_PRINCIPAL, STACKS_NETWORK } from './stacks-config';
import { TokenType } from './types';
import { contractSendPc, userSendPc } from './post-conditions';
import { categorizeTxError } from './tx-errors';

const PENDING_HINT = 'Confirms on Stacks in 1–2 minutes.';

/** Fee = amount * platformFeeBps / 10_000. Default platformFeeBps = 50 (0.5%). */
function estimateFee(amount: number, feeBps = 50): number {
  return Math.floor((amount * feeBps) / 10_000);
}

export async function createEscrow(params: {
  buyer: string;
  seller: string;
  amount: number;
  description: string;
  duration: number;
  tokenType: TokenType;
  feeBps?: number;
}): Promise<string> {
  const fee = estimateFee(params.amount, params.feeBps);
  const totalAmount = params.amount + fee;
  try {
    const response = await request('stx_callContract', {
      contract: CONTRACT_PRINCIPAL,
      functionName: 'create-escrow',
      functionArgs: [
        Cl.standardPrincipal(params.seller),
        Cl.uint(params.amount),
        Cl.stringUtf8(params.description),
        Cl.uint(params.duration),
        Cl.uint(params.tokenType),
      ],
      postConditions: [
        userSendPc(params.buyer, totalAmount, params.tokenType),
      ],
      network: STACKS_NETWORK,
    });
    toast.success('Escrow submitted', { description: PENDING_HINT });
    return response.txid;
  } catch (err) {
    const e = categorizeTxError(err, 'create the escrow');
    toast.error(e.title, { description: e.description });
    throw err;
  }
}

export async function releaseEscrow(escrowId: number, amount: number, feeAmount: number, tokenType: TokenType): Promise<string> {
  const totalOutflow = amount + feeAmount;
  try {
    const response = await request('stx_callContract', {
      contract: CONTRACT_PRINCIPAL,
      functionName: 'release',
      functionArgs: [Cl.uint(escrowId)],
      postConditions: [
        contractSendPc(totalOutflow, tokenType),
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

export async function refundEscrow(escrowId: number, amount: number, feeAmount: number, tokenType: TokenType): Promise<string> {
  const totalRefund = amount + feeAmount;
  try {
    const response = await request('stx_callContract', {
      contract: CONTRACT_PRINCIPAL,
      functionName: 'refund',
      functionArgs: [Cl.uint(escrowId)],
      postConditions: [
        contractSendPc(totalRefund, tokenType),
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

export async function disputeEscrow(escrowId: number): Promise<string> {
  try {
    const response = await request('stx_callContract', {
      contract: CONTRACT_PRINCIPAL,
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

export async function extendEscrow(escrowId: number, additionalBlocks: number): Promise<string> {
  try {
    const response = await request('stx_callContract', {
      contract: CONTRACT_PRINCIPAL,
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

export async function resolveExpiredDispute(escrowId: number, amount: number, feeAmount: number, tokenType: TokenType): Promise<string> {
  const totalRefund = amount + feeAmount;
  try {
    const response = await request('stx_callContract', {
      contract: CONTRACT_PRINCIPAL,
      functionName: 'resolve-expired-dispute',
      functionArgs: [Cl.uint(escrowId)],
      postConditions: [
        contractSendPc(totalRefund, tokenType),
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
