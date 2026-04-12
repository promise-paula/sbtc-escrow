import { toast } from 'sonner';

export async function pauseContract(): Promise<string> {
  toast.info('Pausing contract...');
  await new Promise(r => setTimeout(r, 1500));
  toast.success('Contract paused');
  return '0xmock_pause';
}

export async function unpauseContract(): Promise<string> {
  toast.info('Unpausing contract...');
  await new Promise(r => setTimeout(r, 1500));
  toast.success('Contract unpaused');
  return '0xmock_unpause';
}

export async function setPlatformFee(bps: number): Promise<string> {
  toast.info('Updating fee...');
  await new Promise(r => setTimeout(r, 1500));
  toast.success(`Fee updated to ${bps} BPS (${(bps / 100).toFixed(2)}%)`);
  return '0xmock_set_fee';
}

export async function setFeeRecipient(address: string): Promise<string> {
  toast.info('Updating fee recipient...');
  await new Promise(r => setTimeout(r, 1500));
  toast.success('Fee recipient updated');
  return '0xmock_set_recipient';
}

export async function setDisputeTimeout(blocks: number): Promise<string> {
  toast.info('Updating dispute timeout...');
  await new Promise(r => setTimeout(r, 1500));
  toast.success(`Dispute timeout updated to ${blocks} blocks`);
  return '0xmock_set_timeout';
}

export async function initiateOwnershipTransfer(newOwner: string): Promise<string> {
  toast.info('Initiating ownership transfer...');
  await new Promise(r => setTimeout(r, 1500));
  toast.success('Ownership transfer initiated — awaiting acceptance');
  return '0xmock_transfer_init';
}

export async function resolveDisputeForBuyer(escrowId: number): Promise<string> {
  toast.info('Resolving dispute for buyer...');
  await new Promise(r => setTimeout(r, 1500));
  toast.success('Dispute resolved — funds returned to buyer');
  return '0xmock_resolve_buyer';
}

export async function resolveDisputeForSeller(escrowId: number): Promise<string> {
  toast.info('Resolving dispute for seller...');
  await new Promise(r => setTimeout(r, 1500));
  toast.success('Dispute resolved — funds released to seller');
  return '0xmock_resolve_seller';
}
