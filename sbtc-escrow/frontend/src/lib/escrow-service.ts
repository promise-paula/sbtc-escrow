import { toast } from 'sonner';
import { request } from '@stacks/connect';
import { Cl, Pc } from '@stacks/transactions';
import { CONTRACT_PRINCIPAL, STACKS_NETWORK, SBTC_CONTRACT } from './stacks-config';
import { TokenType } from './types';

/** Fee = amount * platformFeeBps / 10_000. Default platformFeeBps = 50 (0.5%). */
function estimateFee(amount: number, feeBps = 50): number {
  return Math.floor((amount * feeBps) / 10_000);
}

/** Build post-conditions for a contract-initiated outbound transfer. */
function contractSendPc(amount: number, tokenType: TokenType) {
  if (tokenType === TokenType.SBTC) {
    return Pc.principal(CONTRACT_PRINCIPAL).willSendEq(amount).ft(SBTC_CONTRACT, 'sbtc-token');
  }
  return Pc.principal(CONTRACT_PRINCIPAL).willSendEq(amount).ustx();
}

/** Build post-conditions for a user-initiated inbound transfer. */
function userSendPc(sender: string, amount: number, tokenType: TokenType) {
  if (tokenType === TokenType.SBTC) {
    return Pc.principal(sender).willSendLte(amount).ft(SBTC_CONTRACT, 'sbtc-token');
  }
  return Pc.principal(sender).willSendLte(amount).ustx();
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
  toast.success('Escrow created', { description: 'Transaction submitted.' });
  return response.txid;
}

export async function releaseEscrow(escrowId: number, amount: number, feeAmount: number, tokenType: TokenType): Promise<string> {
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'release',
    functionArgs: [Cl.uint(escrowId)],
    postConditions: [
      contractSendPc(amount, tokenType),
      ...(feeAmount > 0 ? [contractSendPc(feeAmount, tokenType)] : []),
    ],
    network: STACKS_NETWORK,
  });
  toast.success('Payment released', { description: 'Transaction submitted.' });
  return response.txid;
}

export async function refundEscrow(escrowId: number, amount: number, feeAmount: number, tokenType: TokenType): Promise<string> {
  const totalRefund = amount + feeAmount;
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'refund',
    functionArgs: [Cl.uint(escrowId)],
    postConditions: [
      contractSendPc(totalRefund, tokenType),
    ],
    network: STACKS_NETWORK,
  });
  toast.success('Escrow refunded', { description: 'Transaction submitted.' });
  return response.txid;
}

export async function disputeEscrow(escrowId: number): Promise<string> {
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'dispute',
    functionArgs: [Cl.uint(escrowId)],
    network: STACKS_NETWORK,
  });
  toast.success('Dispute filed', { description: 'Transaction submitted.' });
  return response.txid;
}

export async function extendEscrow(escrowId: number, additionalBlocks: number): Promise<string> {
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'extend-escrow',
    functionArgs: [Cl.uint(escrowId), Cl.uint(additionalBlocks)],
    network: STACKS_NETWORK,
  });
  toast.success('Escrow extended', { description: 'Transaction submitted.' });
  return response.txid;
}

export async function resolveExpiredDispute(escrowId: number, amount: number, feeAmount: number, tokenType: TokenType): Promise<string> {
  const totalRefund = amount + feeAmount;
  const response = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'resolve-expired-dispute',
    functionArgs: [Cl.uint(escrowId)],
    postConditions: [
      contractSendPc(totalRefund, tokenType),
    ],
    network: STACKS_NETWORK,
  });
  toast.success('Disputed funds recovered', { description: 'Transaction submitted.' });
  return response.txid;
}
