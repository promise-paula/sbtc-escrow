import { toast } from 'sonner';

// Stub functions for contract writes — these will be replaced with actual Stacks wallet signing

export async function createEscrow(params: {
  seller: string;
  amount: number;
  description: string;
  duration: number;
}): Promise<string> {
  toast.info('Transaction submitted', { description: 'Waiting for confirmation...' });
  await new Promise(r => setTimeout(r, 2000));
  toast.success('Escrow created successfully');
  return '0xmock_tx_hash_create';
}

export async function releaseEscrow(escrowId: number): Promise<string> {
  toast.info('Transaction submitted', { description: 'Releasing payment...' });
  await new Promise(r => setTimeout(r, 2000));
  toast.success('Payment released successfully');
  return '0xmock_tx_hash_release';
}

export async function refundEscrow(escrowId: number): Promise<string> {
  toast.info('Transaction submitted', { description: 'Processing refund...' });
  await new Promise(r => setTimeout(r, 2000));
  toast.success('Escrow refunded successfully');
  return '0xmock_tx_hash_refund';
}

export async function disputeEscrow(escrowId: number): Promise<string> {
  toast.info('Transaction submitted', { description: 'Filing dispute...' });
  await new Promise(r => setTimeout(r, 2000));
  toast.success('Dispute filed successfully');
  return '0xmock_tx_hash_dispute';
}

export async function extendEscrow(escrowId: number, additionalBlocks: number): Promise<string> {
  toast.info('Transaction submitted', { description: 'Extending deadline...' });
  await new Promise(r => setTimeout(r, 2000));
  toast.success('Escrow deadline extended');
  return '0xmock_tx_hash_extend';
}

export async function resolveExpiredDispute(escrowId: number): Promise<string> {
  toast.info('Transaction submitted', { description: 'Recovering funds from timed-out dispute...' });
  await new Promise(r => setTimeout(r, 2000));
  toast.success('Funds recovered successfully');
  return '0xmock_tx_hash_resolve_expired';
}
