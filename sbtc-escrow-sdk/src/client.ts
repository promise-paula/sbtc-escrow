/**
 * sBTC Escrow SDK — Client
 *
 * TypeScript client for the sBTC Escrow smart contracts on Stacks.
 * Defaults to `escrow-v8` on testnet and `escrow-mainnet-v3` on mainnet
 * (both v3 feature set). Supports both STX (native) and sBTC (SIP-010)
 * escrows. Legacy contracts (`escrow-v7`, `escrow-mainnet-v2`, etc.)
 * are still callable by passing `contractName` explicitly.
 */

import {
  makeContractCall,
  broadcastTransaction,
  fetchCallReadOnlyFunction,
  cvToJSON,
  uintCV,
  principalCV,
  stringUtf8CV,
  noneCV,
  someCV,
  PostConditionMode,
  ClarityValue,
  Pc,
  getAddressFromPrivateKey,
} from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET, StacksNetwork } from '@stacks/network';

import {
  EscrowClientConfig,
  Escrow,
  EscrowConfig,
  EscrowStatus,
  TokenType,
  UserStats,
  PlatformStats,
  CreateEscrowOptions,
  SignedTxOptions,
  BroadcastResult,
  NetworkType,
} from './types';

/**
 * Default contract addresses. v3+ deployments are now live on both networks
 * (`escrow-v8` on testnet, `escrow-mainnet-v3` on mainnet) — the SDK
 * targets them by default since v3 is a strict feature superset of v2/v7.
 *
 * To call a legacy contract (read or actions on existing v2/v7 escrows),
 * pass `contractName` explicitly:
 *
 * ```ts
 * new EscrowClient({ network: 'mainnet', contractName: 'escrow-mainnet-v2' });
 * ```
 */
const DEFAULT_CONTRACTS = {
  testnet: {
    address: 'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N',
    name: 'escrow-v8',
  },
  mainnet: {
    address: 'SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA',
    name: 'escrow-mainnet-v3',
  },
};

/**
 * Contracts that implement the v3 feature set: burn-block clock,
 * `beneficiary` parameter on create, `resolve-expired-dispute-for-seller`,
 * `sweep-orphans`, per-escrow fee-recipient snapshot, time-bound `pause`
 * with anti-chaining cooldown.
 *
 * The SDK uses this registry to gate v3-only call paths (so a caller can't
 * accidentally send a beneficiary to a v2 contract, where the extra arg
 * would cause a runtime contract-call failure).
 */
const V3_PLUS_CONTRACTS: ReadonlySet<string> = new Set([
  'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v8',           // testnet
  'SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet-v3',   // mainnet
]);

/** True iff the contract id targets a v3+ deployment. */
export function supportsV3Features(contractId: string): boolean {
  return V3_PLUS_CONTRACTS.has(contractId);
}

/** Default sBTC SIP-010 contract principals */
const DEFAULT_SBTC_CONTRACTS = {
  testnet: 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token',
  mainnet: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
};

/**
 * sBTC Escrow Client
 *
 * Provides typed methods for interacting with the sBTC Escrow smart contracts
 * on Stacks. Defaults to `escrow-v8` (testnet) / `escrow-mainnet-v3` (mainnet);
 * pass `contractName` explicitly to target legacy contracts. Supports both
 * STX (native) and sBTC (SIP-010 fungible token) escrows.
 *
 * @example
 * ```typescript
 * import { EscrowClient, TokenType } from 'sbtc-escrow-sdk';
 *
 * const client = new EscrowClient({ network: 'testnet' });
 *
 * // Read escrow data
 * const escrow = await client.getEscrow(1);
 *
 * // Create an STX escrow
 * const result = await client.createEscrow(
 *   { seller: 'ST...', amount: 1_000_000, description: 'Payment', durationBlocks: 144, tokenType: TokenType.STX },
 *   { senderKey: 'your-private-key' }
 * );
 *
 * // Create an sBTC escrow
 * const result2 = await client.createEscrow(
 *   { seller: 'ST...', amount: 100_000, description: 'BTC Payment', durationBlocks: 144, tokenType: TokenType.SBTC },
 *   { senderKey: 'your-private-key' }
 * );
 * ```
 */
export class EscrowClient {
  private contractAddress: string;
  private contractName: string;
  private sbtcContract: string;
  private network: StacksNetwork;
  private networkType: NetworkType;

  constructor(config: EscrowClientConfig) {
    this.networkType = config.network;
    this.network = config.network === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
    if (config.apiUrl) {
      // Honor a custom Hiro API URL (e.g. a self-hosted node or a proxy).
      this.network.client = { ...this.network.client, baseUrl: config.apiUrl };
    }
    this.contractAddress = config.contractAddress ?? DEFAULT_CONTRACTS[config.network].address;
    this.contractName = config.contractName ?? DEFAULT_CONTRACTS[config.network].name;
    this.sbtcContract = config.sbtcContract ?? DEFAULT_SBTC_CONTRACTS[config.network];

    if (!this.contractAddress) {
      throw new Error(`No contract address configured for ${config.network}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // READ-ONLY METHODS
  // ═══════════════════════════════════════════════════════════════

  /** Get contract configuration */
  async getConfig(): Promise<EscrowConfig> {
    const result = await this.callReadOnly('get-config', []);
    const data = cvToJSON(result).value;

    return {
      owner: data.owner.value,
      feeRecipient: data['fee-recipient'].value,
      platformFeeBps: parseInt(data['platform-fee-bps'].value),
      isPaused: data['is-paused'].value,
      minAmountStx: parseInt(data['min-amount-stx'].value),
      maxAmountStx: parseInt(data['max-amount-stx'].value),
      minAmountSbtc: parseInt(data['min-amount-sbtc'].value),
      maxAmountSbtc: parseInt(data['max-amount-sbtc'].value),
      maxDuration: parseInt(data['max-duration'].value),
      disputeTimeout: parseInt(data['dispute-timeout'].value),
      // v7+ only: older deployments omit this field.
      reviewPeriod: data['review-period']?.value
        ? parseInt(data['review-period'].value)
        : undefined,
    };
  }

  /** Get platform statistics (per-token volumes) */
  async getPlatformStats(): Promise<PlatformStats> {
    const result = await this.callReadOnly('get-platform-stats', []);
    const data = cvToJSON(result).value;

    return {
      totalEscrows: parseInt(data['total-escrows'].value),
      totalVolumeStx: parseInt(data['total-volume-stx'].value),
      totalVolumeSbtc: parseInt(data['total-volume-sbtc'].value),
      totalFeesCollectedStx: parseInt(data['total-fees-collected-stx'].value),
      totalFeesCollectedSbtc: parseInt(data['total-fees-collected-sbtc'].value),
      totalReleased: parseInt(data['total-released'].value),
      totalRefunded: parseInt(data['total-refunded'].value),
      activeDisputes: parseInt(data['active-disputes'].value),
    };
  }

  /**
   * Get escrow by ID
   * @returns Escrow data or null if not found
   */
  async getEscrow(escrowId: number): Promise<Escrow | null> {
    const result = await this.callReadOnly('get-escrow', [uintCV(escrowId)]);
    const json = cvToJSON(result);

    if (json.value === null) return null;

    const data = json.value.value ?? json.value;
    return {
      id: escrowId,
      buyer: data.buyer.value,
      seller: data.seller.value,
      amount: parseInt(data.amount.value),
      feeAmount: parseInt(data['fee-amount'].value),
      tokenType: parseInt(data['token-type'].value) as TokenType,
      description: data.description.value,
      status: parseInt(data.status.value) as EscrowStatus,
      createdAt: parseInt(data['created-at'].value),
      expiresAt: parseInt(data['expires-at'].value),
      completedAt: data['completed-at'].value ? parseInt(data['completed-at'].value) : null,
      disputedAt: data['disputed-at'].value ? parseInt(data['disputed-at'].value) : null,
      // v7+ only: older deployments don't have this field at all.
      deliveredAt: data['delivered-at']?.value
        ? parseInt(data['delivered-at'].value)
        : null,
    };
  }

  /** Get total escrow count */
  async getEscrowCount(): Promise<number> {
    const result = await this.callReadOnly('get-escrow-count', []);
    return parseInt(cvToJSON(result).value);
  }

  /** Check if escrow exists */
  async escrowExists(escrowId: number): Promise<boolean> {
    const result = await this.callReadOnly('escrow-exists', [uintCV(escrowId)]);
    return cvToJSON(result).value;
  }

  /** Get escrow status code */
  async getStatus(escrowId: number): Promise<EscrowStatus> {
    const result = await this.callReadOnly('get-status', [uintCV(escrowId)]);
    const json = cvToJSON(result);
    return parseInt(json.value.value ?? json.value) as EscrowStatus;
  }

  /** Get user role in an escrow ('buyer' | 'seller' | 'none') */
  async getUserRole(escrowId: number, userAddress: string): Promise<string> {
    const result = await this.callReadOnly('get-user-role', [
      uintCV(escrowId),
      principalCV(userAddress),
    ]);
    const json = cvToJSON(result);
    return json.value.value ?? json.value;
  }

  /** Get user statistics (per-token) */
  async getUserStats(userAddress: string): Promise<UserStats> {
    const result = await this.callReadOnly('get-user-stats', [principalCV(userAddress)]);
    const data = cvToJSON(result).value;

    return {
      escrowsCreated: parseInt(data['escrows-created'].value),
      escrowsReceived: parseInt(data['escrows-received'].value),
      totalSentStx: parseInt(data['total-sent-stx'].value),
      totalSentSbtc: parseInt(data['total-sent-sbtc'].value),
      totalReceivedStx: parseInt(data['total-received-stx'].value),
      totalReceivedSbtc: parseInt(data['total-received-sbtc'].value),
    };
  }

  /** Calculate fee for an escrow amount (in microSTX or sats) */
  async calculateEscrowFee(amount: number): Promise<number> {
    const result = await this.callReadOnly('calculate-escrow-fee', [uintCV(amount)]);
    return parseInt(cvToJSON(result).value);
  }

  /** Check if an escrow is expired */
  async isExpired(escrowId: number): Promise<boolean> {
    const result = await this.callReadOnly('is-expired', [uintCV(escrowId)]);
    return cvToJSON(result).value;
  }

  /** Check if contract is paused */
  async isPaused(): Promise<boolean> {
    const result = await this.callReadOnly('is-paused', []);
    return cvToJSON(result).value;
  }

  /** Check if a dispute has timed out (buyer can self-resolve) */
  async isDisputeTimedOut(escrowId: number): Promise<boolean> {
    const result = await this.callReadOnly('is-dispute-timed-out', [uintCV(escrowId)]);
    return cvToJSON(result).value;
  }

  /**
   * Check if an escrow is currently inside its post-delivery review window.
   *
   * Returns `true` only when the seller has called `deliver()` and the
   * configured `REVIEW_PERIOD` has not yet fully elapsed since `delivered-at`.
   * While true, the buyer cannot unilaterally refund.
   *
   * Requires escrow-v7+; returns `false` against older deployments.
   */
  async isInReviewPeriod(escrowId: number): Promise<boolean> {
    const result = await this.callReadOnly('is-in-review-period', [uintCV(escrowId)]);
    return cvToJSON(result).value;
  }

  // ═══════════════════════════════════════════════════════════════
  // WRITE METHODS (require signing)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a new escrow (STX or sBTC)
   *
   * The buyer deposits `amount + fee` into the contract.
   */
  async createEscrow(
    options: CreateEscrowOptions,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    const fee = await this.calculateEscrowFee(options.amount);
    const totalAmount = options.amount + fee;
    const senderAddress = this.getSenderAddress(txOptions.senderKey);

    const postConditions =
      options.tokenType === TokenType.SBTC
        ? [this.buildSbtcUserPc(senderAddress, totalAmount)]
        : [Pc.principal(senderAddress).willSendEq(totalAmount).ustx()];

    // v3 contracts take an optional beneficiary as the 6th arg. Sending it
    // to v2 would cause a runtime contract-call failure (wrong arg count),
    // so we either dispatch v3 or v2 explicitly here.
    const isV3 = supportsV3Features(`${this.contractAddress}.${this.contractName}`);

    if (options.beneficiary && !isV3) {
      throw new Error(
        `createEscrow: beneficiary parameter requires a v3+ contract; ` +
          `${this.contractAddress}.${this.contractName} does not support it. ` +
          `Either omit beneficiary or target escrow-mainnet-v3 / future v3+.`,
      );
    }

    const baseArgs = [
      principalCV(options.seller),
      uintCV(options.amount),
      stringUtf8CV(options.description),
      uintCV(options.durationBlocks),
      uintCV(options.tokenType),
    ];

    const functionArgs = isV3
      ? [
          ...baseArgs,
          options.beneficiary
            ? someCV(principalCV(options.beneficiary))
            : noneCV(),
        ]
      : baseArgs;

    const tx = await makeContractCall({
      contractAddress: this.contractAddress,
      contractName: this.contractName,
      functionName: 'create-escrow',
      functionArgs,
      senderKey: txOptions.senderKey,
      network: this.network,
      postConditionMode: PostConditionMode.Deny,
      postConditions,
      fee: txOptions.fee,
      nonce: txOptions.nonce,
    });

    return this.broadcast(tx);
  }

  /**
   * Release escrow funds to seller (buyer only).
   *
   * Callable from PENDING. On v7+, also callable from DELIVERED.
   */
  async release(escrowId: number, txOptions: SignedTxOptions): Promise<BroadcastResult> {
    return this.callWrite('release', [uintCV(escrowId)], txOptions, PostConditionMode.Allow);
  }

  /**
   * Refund escrow to buyer.
   *
   * - v6 / escrow-mainnet: seller anytime, or **anyone** after `expires-at`.
   * - v7+: seller anytime; buyer only after `expires-at` AND any post-delivery
   *   review window has fully elapsed. Random callers can no longer refund.
   */
  async refund(escrowId: number, txOptions: SignedTxOptions): Promise<BroadcastResult> {
    return this.callWrite('refund', [uintCV(escrowId)], txOptions, PostConditionMode.Allow);
  }

  /**
   * Dispute an escrow (buyer or seller).
   *
   * Callable from PENDING. On v7+, also callable from DELIVERED — this is the
   * seller's recourse during the review window if the buyer is stalling.
   */
  async dispute(escrowId: number, txOptions: SignedTxOptions): Promise<BroadcastResult> {
    return this.callWrite('dispute', [uintCV(escrowId)], txOptions, PostConditionMode.Deny);
  }

  /**
   * Signal delivery on-chain (seller only, from PENDING).
   *
   * Moves the escrow into DELIVERED and starts the review window. While the
   * window is active the buyer cannot unilaterally refund — only release or
   * dispute. Use this once the off-chain work has been delivered.
   *
   * Requires escrow-v7+. Will fail against older deployments.
   */
  async deliver(escrowId: number, txOptions: SignedTxOptions): Promise<BroadcastResult> {
    return this.callWrite('deliver', [uintCV(escrowId)], txOptions, PostConditionMode.Deny);
  }

  /** Extend escrow expiry (buyer only, pending only, before expiry) */
  async extendEscrow(
    escrowId: number,
    additionalBlocks: number,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    return this.callWrite(
      'extend-escrow',
      [uintCV(escrowId), uintCV(additionalBlocks)],
      txOptions,
      PostConditionMode.Deny,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // DISPUTE RESOLUTION
  // ═══════════════════════════════════════════════════════════════

  /** Resolve disputed escrow in favor of buyer — admin only */
  async resolveDisputeForBuyer(
    escrowId: number,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    return this.callWrite(
      'resolve-dispute-for-buyer',
      [uintCV(escrowId)],
      txOptions,
      PostConditionMode.Allow,
    );
  }

  /** Resolve disputed escrow in favor of seller — admin only */
  async resolveDisputeForSeller(
    escrowId: number,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    return this.callWrite(
      'resolve-dispute-for-seller',
      [uintCV(escrowId)],
      txOptions,
      PostConditionMode.Allow,
    );
  }

  /**
   * Resolve a disputed escrow with a partial split — admin only.
   *
   * `buyerBps` is the buyer's share of the principal in basis points (0–10000).
   * The seller receives the remainder. The original fee is split pro-rata:
   * the buyer is refunded the fee on the portion they got back; the platform
   * keeps the fee on the portion that went to the seller.
   *
   * At the extremes (`buyerBps = 0` or `10000`) this is equivalent to
   * `resolveDisputeForSeller` or `resolveDisputeForBuyer` respectively;
   * prefer the dedicated functions there for cleaner event semantics.
   *
   * Requires escrow-v7+.
   */
  async resolveDisputeSplit(
    escrowId: number,
    buyerBps: number,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    if (!Number.isInteger(buyerBps) || buyerBps < 0 || buyerBps > 10000) {
      throw new Error(`buyerBps must be an integer between 0 and 10000, got ${buyerBps}`);
    }
    return this.callWrite(
      'resolve-dispute-split',
      [uintCV(escrowId), uintCV(buyerBps)],
      txOptions,
      PostConditionMode.Allow,
    );
  }

  /** Resolve expired dispute — buyer self-service fallback after timeout */
  async resolveExpiredDispute(
    escrowId: number,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    return this.callWrite(
      'resolve-expired-dispute',
      [uintCV(escrowId)],
      txOptions,
      PostConditionMode.Allow,
    );
  }

  /**
   * Seller self-rescue (v3+ only).
   *
   * Callable only when ALL of:
   *   - status is DISPUTED
   *   - escrow was DELIVERED before the dispute
   *   - `2 * dispute-timeout` burn blocks have elapsed since `disputed-at`
   *   - caller is the seller
   *
   * Use `isSellerRescueEligible(escrowId)` to check eligibility before
   * spending gas. Throws if called against a non-v3 contract.
   */
  async resolveExpiredDisputeForSeller(
    escrowId: number,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    this.assertV3('resolveExpiredDisputeForSeller');
    return this.callWrite(
      'resolve-expired-dispute-for-seller',
      [uintCV(escrowId)],
      txOptions,
      PostConditionMode.Allow,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Pause contract — emergency stop (admin only).
   *
   * On v3+ contracts, `durationBlocks` is required (burn blocks). The pause
   * auto-lifts after that many blocks. A cooldown of equal length follows
   * before the next pause is permitted. On v2/v7 contracts, `durationBlocks`
   * is ignored — pause stays in effect until `unpauseContract`.
   */
  async pauseContract(
    txOptions: SignedTxOptions,
    durationBlocks?: number,
  ): Promise<BroadcastResult> {
    const isV3 = supportsV3Features(`${this.contractAddress}.${this.contractName}`);

    if (isV3 && (durationBlocks === undefined || durationBlocks <= 0)) {
      throw new Error(
        'pauseContract: durationBlocks is required on v3+ contracts and must be > 0.',
      );
    }

    return this.callWrite(
      'pause-contract',
      isV3 ? [uintCV(durationBlocks as number)] : [],
      txOptions,
      PostConditionMode.Deny,
    );
  }

  /** Unpause contract (admin only) */
  async unpauseContract(txOptions: SignedTxOptions): Promise<BroadcastResult> {
    return this.callWrite('unpause-contract', [], txOptions, PostConditionMode.Deny);
  }

  /**
   * Sweep orphaned funds (v3+ only, admin only).
   *
   * Withdraws funds the contract holds that are NOT locked in any active
   * escrow — i.e., direct donations sent to the contract principal by
   * mistake. The on-chain `total-locked-{stx,sbtc}` accounting guarantees
   * this can NEVER touch escrow principal: the contract reverts if
   * `amount > balance - locked`.
   *
   * Throws if called against a non-v3 contract.
   */
  async sweepOrphans(
    tokenType: TokenType,
    amount: number,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    this.assertV3('sweepOrphans');
    return this.callWrite(
      'sweep-orphans',
      [uintCV(tokenType), uintCV(amount)],
      txOptions,
      PostConditionMode.Allow,
    );
  }

  /** Update platform fee in basis points (admin only, max 500 = 5%) */
  async setPlatformFee(feeBps: number, txOptions: SignedTxOptions): Promise<BroadcastResult> {
    return this.callWrite(
      'set-platform-fee',
      [uintCV(feeBps)],
      txOptions,
      PostConditionMode.Deny,
    );
  }

  /** Update fee recipient address (admin only) */
  async setFeeRecipient(
    recipient: string,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    return this.callWrite(
      'set-fee-recipient',
      [principalCV(recipient)],
      txOptions,
      PostConditionMode.Deny,
    );
  }

  /** Update dispute timeout in blocks (admin only, 1–57600) */
  async setDisputeTimeout(
    timeout: number,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    return this.callWrite(
      'set-dispute-timeout',
      [uintCV(timeout)],
      txOptions,
      PostConditionMode.Deny,
    );
  }

  /** Initiate 2-step ownership transfer (admin only) */
  async transferOwnership(
    newOwner: string,
    txOptions: SignedTxOptions,
  ): Promise<BroadcastResult> {
    return this.callWrite(
      'transfer-ownership',
      [principalCV(newOwner)],
      txOptions,
      PostConditionMode.Deny,
    );
  }

  /** Accept ownership transfer (called by pending new owner) */
  async acceptOwnership(txOptions: SignedTxOptions): Promise<BroadcastResult> {
    return this.callWrite('accept-ownership', [], txOptions, PostConditionMode.Deny);
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════

  /** Get full contract identifier (address.name) */
  getContractId(): string {
    return `${this.contractAddress}.${this.contractName}`;
  }

  /** Get the network type */
  getNetworkType(): NetworkType {
    return this.networkType;
  }

  /** Get the sBTC contract principal */
  getSbtcContract(): string {
    return this.sbtcContract;
  }

  /** Get explorer URL for a transaction */
  getExplorerTxUrl(txid: string): string {
    const suffix = this.networkType === 'testnet' ? '?chain=testnet' : '';
    return `https://explorer.hiro.so/txid/${txid}${suffix}`;
  }

  /** Get explorer URL for the contract */
  getExplorerContractUrl(): string {
    const suffix = this.networkType === 'testnet' ? '?chain=testnet' : '';
    return `https://explorer.hiro.so/txid/${this.getContractId()}${suffix}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════

  private async callReadOnly(
    functionName: string,
    functionArgs: ClarityValue[],
  ): Promise<ClarityValue> {
    return fetchCallReadOnlyFunction({
      contractAddress: this.contractAddress,
      contractName: this.contractName,
      functionName,
      functionArgs,
      network: this.network,
      senderAddress: this.contractAddress,
    });
  }

  private async callWrite(
    functionName: string,
    functionArgs: ClarityValue[],
    txOptions: SignedTxOptions,
    postConditionMode: PostConditionMode,
  ): Promise<BroadcastResult> {
    const tx = await makeContractCall({
      contractAddress: this.contractAddress,
      contractName: this.contractName,
      functionName,
      functionArgs,
      senderKey: txOptions.senderKey,
      network: this.network,
      postConditionMode,
      fee: txOptions.fee,
      nonce: txOptions.nonce,
    });

    return this.broadcast(tx);
  }

  private async broadcast(tx: any): Promise<BroadcastResult> {
    try {
      const result = await broadcastTransaction({ transaction: tx, network: this.network });

      if ('error' in result) {
        return {
          txid: '',
          success: false,
          error: result.error,
          rawResult: result,
        };
      }

      return {
        txid: result.txid,
        success: true,
        rawResult: result,
      };
    } catch (error) {
      return {
        txid: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getSenderAddress(privateKey: string): string {
    return getAddressFromPrivateKey(privateKey, this.networkType);
  }

  private buildSbtcUserPc(sender: string, amount: number) {
    const [address, name] = this.sbtcContract.split('.');
    return Pc.principal(sender).willSendLte(amount).ft(`${address}.${name}` as `${string}.${string}`, 'sbtc-token');
  }

  /**
   * Throws if the configured contract isn't a v3+ deployment. Used at the
   * top of methods that call v3-only functions to fail fast with a clear
   * error rather than letting the broadcast hit a missing-function revert.
   */
  private assertV3(methodName: string): void {
    if (!supportsV3Features(`${this.contractAddress}.${this.contractName}`)) {
      throw new Error(
        `${methodName}: requires a v3+ contract; ` +
          `${this.contractAddress}.${this.contractName} does not support it.`,
      );
    }
  }

  /**
   * Read-only check: is the given escrow eligible for seller self-rescue?
   *
   * Returns `true` only on v3+ contracts where:
   *   - status is DISPUTED
   *   - delivered-at is set (escrow was DELIVERED before dispute)
   *   - current burn block > disputed-at + 2 * dispute-timeout
   *
   * On v2/v7 contracts, always returns `false` (no such function exists).
   */
  async isSellerRescueEligible(escrowId: number): Promise<boolean> {
    if (!supportsV3Features(`${this.contractAddress}.${this.contractName}`)) {
      return false;
    }
    const result = await fetchCallReadOnlyFunction({
      contractAddress: this.contractAddress,
      contractName: this.contractName,
      functionName: 'is-seller-rescue-eligible',
      functionArgs: [uintCV(escrowId)],
      network: this.network,
      senderAddress: this.contractAddress,
    });
    return cvToJSON(result).value === true;
  }
}
