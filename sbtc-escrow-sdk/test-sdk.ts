/**
 * Quick test to verify the SDK works against the testnet escrow-v6 contract.
 */
import { EscrowClient, EscrowStatus, TokenType } from './src/index';

async function main() {
  console.log('📦 Testing sBTC Escrow SDK against testnet (escrow-v6)...\n');

  // Initialize client
  const client = new EscrowClient({ network: 'testnet' });
  console.log(`Contract: ${client.getContractId()}`);
  console.log(`sBTC:     ${client.getSbtcContract()}`);

  // Test read-only functions
  console.log('\n📖 Testing read-only functions...');

  // Get config (per-token amount bounds)
  const config = await client.getConfig();
  console.log(`✅ getConfig: Fee = ${config.platformFeeBps} BPS (${config.platformFeeBps / 100}%)`);
  console.log(`   STX bounds: ${config.minAmountStx / 1e6}–${config.maxAmountStx / 1e6} STX`);
  console.log(`   sBTC bounds: ${config.minAmountSbtc / 1e8}–${config.maxAmountSbtc / 1e8} BTC`);
  console.log(`   Dispute timeout: ${config.disputeTimeout} blocks`);

  // Get platform stats (per-token volumes)
  const stats = await client.getPlatformStats();
  console.log(`✅ getPlatformStats: ${stats.totalEscrows} escrows`);
  console.log(`   STX volume: ${stats.totalVolumeStx / 1e6} STX, fees: ${stats.totalFeesCollectedStx / 1e6} STX`);
  console.log(`   sBTC volume: ${stats.totalVolumeSbtc / 1e8} BTC, fees: ${stats.totalFeesCollectedSbtc / 1e8} BTC`);
  console.log(`   Active disputes: ${stats.activeDisputes}`);

  // Calculate fee
  const fee = await client.calculateEscrowFee(1_000_000);
  console.log(`✅ calculateEscrowFee: Fee for 1 STX = ${fee / 1_000_000} STX`);

  // Get escrow count
  const count = await client.getEscrowCount();
  console.log(`✅ getEscrowCount: ${count} escrows`);

  // Check paused
  const paused = await client.isPaused();
  console.log(`✅ isPaused: ${paused}`);

  // Get escrow if any exist
  if (count > 0) {
    const escrow = await client.getEscrow(1);
    if (escrow) {
      const tokenLabel = escrow.tokenType === TokenType.SBTC ? 'sBTC' : 'STX';
      const divisor = escrow.tokenType === TokenType.SBTC ? 1e8 : 1e6;
      console.log(`✅ getEscrow(1): ${escrow.amount / divisor} ${tokenLabel}, Status = ${EscrowStatus[escrow.status]}`);

      // Test getStatus
      const status = await client.getStatus(1);
      console.log(`✅ getStatus(1): ${EscrowStatus[status]}`);

      // Test getUserRole
      const role = await client.getUserRole(1, escrow.buyer);
      console.log(`✅ getUserRole(1, buyer): ${role}`);

      // Test isExpired
      const expired = await client.isExpired(1);
      console.log(`✅ isExpired(1): ${expired}`);

      // Test isDisputeTimedOut
      const timedOut = await client.isDisputeTimedOut(1);
      console.log(`✅ isDisputeTimedOut(1): ${timedOut}`);
    }
  }

  // Get user stats (per-token totals)
  const userStats = await client.getUserStats(config.owner);
  console.log(`✅ getUserStats: Created = ${userStats.escrowsCreated}, Received = ${userStats.escrowsReceived}`);
  console.log(`   STX sent/received: ${userStats.totalSentStx / 1e6} / ${userStats.totalReceivedStx / 1e6}`);
  console.log(`   sBTC sent/received: ${userStats.totalSentSbtc / 1e8} / ${userStats.totalReceivedSbtc / 1e8}`);

  console.log('\n🎉 All SDK smoke tests passed!');
  console.log('\nExplorer URL:', client.getExplorerContractUrl());
}

main().catch(console.error);
