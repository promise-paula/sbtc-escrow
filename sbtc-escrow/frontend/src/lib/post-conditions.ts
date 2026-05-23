import { Pc } from '@stacks/transactions';
import { SBTC_CONTRACT } from './stacks-config';
import { TokenType } from './types';

/**
 * Build post-conditions for a contract-initiated outbound transfer.
 *
 * `contractId` is the escrow contract that will perform the send — pass the
 * escrow row's `contract_id`, NOT a global default. With multiple contract
 * versions live (legacy v6 + active v7), hard-coding the principal would
 * make the post-condition guard the wrong contract.
 */
export function contractSendPc(
  contractId: string,
  amount: number,
  tokenType: TokenType,
) {
  const contract = contractId as `${string}.${string}`;
  if (tokenType === TokenType.SBTC) {
    return Pc.principal(contract).willSendEq(amount).ft(SBTC_CONTRACT, 'sbtc-token');
  }
  return Pc.principal(contract).willSendEq(amount).ustx();
}

/** Build post-conditions for a user-initiated inbound transfer. */
export function userSendPc(sender: string, amount: number, tokenType: TokenType) {
  if (tokenType === TokenType.SBTC) {
    return Pc.principal(sender).willSendLte(amount).ft(SBTC_CONTRACT, 'sbtc-token');
  }
  return Pc.principal(sender).willSendLte(amount).ustx();
}
