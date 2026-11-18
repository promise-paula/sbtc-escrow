/**
 * Plain-language text for the error codes the wallet-auth function returns.
 * Shown as the "Sign-in failed" toast description. Must not contain
 * reject / cancel / denied / dismiss: WalletAuthContext reads those words as
 * "the user declined the wallet prompt".
 */
export function signInErrorText(code: string, address: string): string {
  const short = address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
  switch (code) {
    case 'address_mismatch':
    case 'address_in_message_mismatch':
      return `Your wallet signed with a different account than the one connected (${short}). Select that account in your wallet, or disconnect and connect again, then retry. If you have more than one wallet extension, the other one may have answered.`;
    case 'challenge_expired':
      return 'The sign-in request expired. Please try again.';
    case 'challenge_issued_in_future':
      return "Your device's clock looks wrong. Set it to update automatically, then try again.";
    case 'nonce_already_used':
      return 'That sign-in request was already used. Please try again.';
    case 'invalid_signature':
      return "The signature couldn't be verified. Please try again.";
    case 'domain_not_allowed':
      return "Sign-in isn't enabled on this site address. Use sbtcescrow.com.";
    default:
      return `Please try again. (code: ${code})`;
  }
}
