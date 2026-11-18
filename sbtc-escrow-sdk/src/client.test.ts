import { describe, it, expect } from 'vitest';
import { EscrowClient, supportsV3Features, supportsV4Rules } from './client';

const V4 = 'SP3B5FYTCXN7CWSYT123YSEB7V2K2XE31JNB7X9NV.escrow-mainnet-v4';
const V9 = 'ST3B5FYTCXN7CWSYT123YSEB7V2K2XE31JPMMRM9Y.escrow-v9';
const OLD_MAINNET = 'SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA';

describe('EscrowClient contract defaults', () => {
  it('targets v4 on mainnet and escrow-v9 on testnet', () => {
    expect(new EscrowClient({ network: 'mainnet' }).getContractId()).toBe(V4);
    expect(new EscrowClient({ network: 'testnet' }).getContractId()).toBe(V9);
  });

  it('resolves a legacy mainnet contract name to the deployer it lives at', () => {
    for (const name of ['escrow-mainnet-v3', 'escrow-mainnet-v2', 'escrow-mainnet']) {
      expect(new EscrowClient({ network: 'mainnet', contractName: name }).getContractId()).toBe(`${OLD_MAINNET}.${name}`);
    }
  });

  it('keeps an explicit contract address', () => {
    const c = new EscrowClient({ network: 'mainnet', contractAddress: 'SPXYZ', contractName: 'my-escrow' });
    expect(c.getContractId()).toBe('SPXYZ.my-escrow');
  });

  it('treats v4 and escrow-v9 as v3+ (beneficiary, timed pause)', () => {
    expect(supportsV3Features(V4)).toBe(true);
    expect(supportsV3Features(V9)).toBe(true);
    expect(supportsV3Features(`${OLD_MAINNET}.escrow-mainnet-v3`)).toBe(true);
    expect(supportsV3Features(`${OLD_MAINNET}.escrow-mainnet-v2`)).toBe(false);
  });

  it('knows which contracts apply the v4 rules', () => {
    expect(supportsV4Rules(V4)).toBe(true);
    expect(supportsV4Rules(V9)).toBe(true);
    expect(supportsV4Rules(`${OLD_MAINNET}.escrow-mainnet-v3`)).toBe(false);
  });

  it('returns null from getEffectiveDeadlines on a pre-v4 contract without a network call', async () => {
    const v3 = new EscrowClient({ network: 'mainnet', contractName: 'escrow-mainnet-v3' });
    await expect(v3.getEffectiveDeadlines(27)).resolves.toBeNull();
  });
});
