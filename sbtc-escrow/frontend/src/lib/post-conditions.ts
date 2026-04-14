import { Pc } from '@stacks/transactions';
import { CONTRACT_PRINCIPAL, SBTC_CONTRACT } from './stacks-config';
import { TokenType } from './types';

/** Build post-conditions for a contract-initiated outbound transfer. */
export function contractSendPc(amount: number, tokenType: TokenType) {
  if (tokenType === TokenType.SBTC) {
    return Pc.principal(CONTRACT_PRINCIPAL).willSendEq(amount).ft(SBTC_CONTRACT, 'sbtc-token');
  }
  return Pc.principal(CONTRACT_PRINCIPAL).willSendEq(amount).ustx();
}

/** Build post-conditions for a user-initiated inbound transfer. */
export function userSendPc(sender: string, amount: number, tokenType: TokenType) {
  if (tokenType === TokenType.SBTC) {
    return Pc.principal(sender).willSendLte(amount).ft(SBTC_CONTRACT, 'sbtc-token');
  }
  return Pc.principal(sender).willSendLte(amount).ustx();
}
