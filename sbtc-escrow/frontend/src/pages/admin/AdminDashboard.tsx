import React from 'react';
import { motion } from 'framer-motion';
import { usePlatformStats, usePlatformConfig, useDisputedEscrows } from '@/hooks/use-admin';
import { useIndexerHealth } from '@/hooks/use-indexer-health';
import { useBurnBlockHeight } from '@/hooks/use-burn-block-height';
import { formatSTX, formatSBTC, blocksToTime } from '@/lib/utils';
import { useBlockRate } from '@/hooks/use-block-rate';
import { useUsdEstimate } from '@/hooks/use-usd-estimate';
import { TokenType } from '@/lib/types';
import { CONTRACT_PRINCIPAL, DEFAULT_MINUTES_PER_BLOCK, BURN_BLOCK_MINUTES, usesBurnBlockClock } from '@/lib/stacks-config';
import { cardVariants } from '@/lib/motion';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { ContractStatusIndicator } from '@/components/shared/ContractStatusIndicator';
import { DashboardSkeleton } from '@/components/shared/PageSkeletons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Sliders, ArrowRightLeft, DollarSign, Coins, CheckCircle2, ShieldAlert, ShieldCheck, RotateCcw, TrendingUp, Pause, Activity, ArrowRight, Clock } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: platformStats, isLoading: statsLoading, isError: statsError } = usePlatformStats();
  const { data: config, isLoading: configLoading, isError: configError } = usePlatformConfig();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;
  // Alerts-first signals: pull live data for what needs admin attention.
  const { data: disputes } = useDisputedEscrows();
  const { data: indexer } = useIndexerHealth();
  const { data: currentBurnBlock = 0 } = useBurnBlockHeight();

  // USD estimate hooks must be called unconditionally before any early return.
  // Pass 0 as a safe fallback while data loads — the values aren't rendered
  // anyway until the early-return below has fallen through.
  const volumeStxUsd = useUsdEstimate(platformStats?.totalVolumeStx ?? 0, TokenType.STX);
  const volumeSbtcUsd = useUsdEstimate(platformStats?.totalVolumeSbtc ?? 0, TokenType.SBTC);
  const feesStxUsd = useUsdEstimate(platformStats?.totalFeesStx ?? 0, TokenType.STX);
  const feesSbtcUsd = useUsdEstimate(platformStats?.totalFeesSbtc ?? 0, TokenType.SBTC);
  const avgFeeStxUsd = useUsdEstimate(
    platformStats && platformStats.totalEscrows > 0
      ? Math.round(platformStats.totalFeesStx / platformStats.totalEscrows)
      : 0,
    TokenType.STX,
  );

  if (statsLoading || configLoading) return <DashboardSkeleton />;

  const ps = platformStats!;
  const cfg = config!;

  const stats = [
    { label: 'Total Escrows', value: ps.totalEscrows.toLocaleString(), icon: ArrowRightLeft },
    { label: 'Volume (STX)', value: `${formatSTX(ps.totalVolumeStx)} STX`, sub: volumeStxUsd, icon: Coins },
    ...(ps.totalVolumeSbtc > 0 ? [{ label: 'Volume (sBTC)', value: `${formatSBTC(ps.totalVolumeSbtc)} sBTC`, sub: volumeSbtcUsd, icon: Coins }] : []),
    { label: 'Fees (STX)', value: `${formatSTX(ps.totalFeesStx)} STX`, sub: feesStxUsd, icon: DollarSign },
    ...(ps.totalFeesSbtc > 0 ? [{ label: 'Fees (sBTC)', value: `${formatSBTC(ps.totalFeesSbtc)} sBTC`, sub: feesSbtcUsd, icon: DollarSign }] : []),
    { label: 'Released', value: ps.totalReleased.toLocaleString(), icon: CheckCircle2 },
    { label: 'Refunded', value: ps.totalRefunded.toLocaleString(), icon: RotateCcw },
    { label: 'Active Disputes', value: ps.activeDisputes.toLocaleString(), icon: ShieldAlert, warn: ps.activeDisputes > 0 },
    { label: 'Resolved Disputes', value: ps.resolvedDisputes.toLocaleString(), icon: ShieldCheck },
  ] as Array<{ label: string; value: string; icon: typeof ArrowRightLeft; sub?: string | null; warn?: boolean }>;

  // ── Compute "needs attention" alerts ─────────────────────────────────
  // Each block returns null if the corresponding state isn't actionable.
  // The Needs-Attention container then only renders if at least one alert
  // is live, so an idle admin sees clean Quick Actions + stats below.

  // Disputes — the most common admin action. Show count + most urgent age.
  const activeDisputeCount = ps.activeDisputes;
  // Pause status — boolean signal only. The auto-unpause target block isn't
  // exposed via get-config, so we can't show a precise countdown here; the
  // cooldown-until block IS exposed and gives a soft upper bound (cooldown
  // ends at pause-until + duration), so when pause is active and cooldown
  // is set we can give a rough "clears no later than" hint.
  const isPaused = cfg.isPaused;
  const cooldownUntil = (cfg.pauseCooldownUntil ?? 0);
  const cooldownActive = !isPaused && cooldownUntil > currentBurnBlock;
  const cooldownBlocksRemaining = cooldownActive ? cooldownUntil - currentBurnBlock : 0;
  // Indexer lag — alert when not healthy OR clearly behind. The
  // chainhook-webhook normally lands within a block; >5 blocks behind
  // means deliveries are queueing.
  const indexerUnhealthy = indexer && (!indexer.healthy || (indexer.blockLag ?? 0) > 5);
  // v3+ contracts measure in burn blocks (~10 min mainnet, ~4 min testnet).
  // Use the right rate so "~X min" doesn't lie.
  const blockMinutes = usesBurnBlockClock(CONTRACT_PRINCIPAL) ? BURN_BLOCK_MINUTES : minutesPerBlock;
  const hasAlerts = activeDisputeCount > 0 || isPaused || cooldownActive || indexerUnhealthy;

  return (
    <div className="p-4 sm:p-6 pb-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Admin Dashboard</h1>

      {(statsError || configError) && <ErrorBanner message="Failed to load platform data. Showing cached data." />}

      {/* ── Needs Attention ────────────────────────────────────── */}
      {/* Only renders when something is actionable. Replaces the previous
          pattern of burying disputes link under 9 stat cards + 5 revenue
          cards. The admin is an operator first; stats live below. */}
      {hasAlerts && (
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
              Needs attention
            </h2>
            <div className="space-y-2">
              {activeDisputeCount > 0 && (
                <Card className="border-l-4 border-l-destructive">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg p-2 bg-destructive/10">
                      <ShieldAlert className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {activeDisputeCount} active dispute{activeDisputeCount !== 1 ? 's' : ''} awaiting resolution
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {disputes && disputes.length > 0
                          ? `Oldest disputed at burn block ${Math.min(...disputes.map(d => d.disputedAt ?? Infinity)).toLocaleString()}`
                          : 'Open the queue to triage.'}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => navigate('/admin/disputes')} className="gap-1.5 shrink-0">
                      Resolve <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {isPaused && (
                <Card className="border-l-4 border-l-warning">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg p-2 bg-warning/10">
                      <Pause className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Contract is paused</p>
                      <p className="text-xs text-muted-foreground">
                        New escrow creation is blocked. Cooldown ends no later than burn block{' '}
                        <span className="font-mono">{cooldownUntil.toLocaleString()}</span>. Manage to unpause early or check the auto-lift target.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate('/admin/controls')} className="gap-1.5 shrink-0">
                      Manage <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {cooldownActive && (
                <Card className="border-l-4 border-l-warning/60">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg p-2 bg-warning/10">
                      <Clock className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Pause cooldown active</p>
                      <p className="text-xs text-muted-foreground">
                        Cannot pause again until burn block {cooldownUntil.toLocaleString()} — about{' '}
                        {cooldownBlocksRemaining} block{cooldownBlocksRemaining === 1 ? '' : 's'}{' '}
                        (~{Math.ceil(cooldownBlocksRemaining * blockMinutes)} min) from now.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {indexerUnhealthy && (
                <Card className="border-l-4 border-l-destructive">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg p-2 bg-destructive/10">
                      <Activity className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Indexer is behind</p>
                      <p className="text-xs text-muted-foreground">
                        {indexer?.note || 'Chainhook deliveries may be queueing.'}
                        {indexer?.blockLag != null && ` Currently ${indexer.blockLag} blocks behind chain tip.`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Quick Actions — promoted above the fold whether or not anything
          needs attention, so the admin can always two-click into the
          dispute queue or contract controls. */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
            <Card
              className="cursor-pointer transition-all hover:shadow-glow-sm hover:border-primary/20"
              onClick={() => navigate('/admin/disputes')}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-lg p-2 ${activeDisputeCount > 0 ? 'bg-warning/10 text-foreground' : 'bg-muted text-muted-foreground'}`}>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Dispute Queue</p>
                  <p className="text-xs text-muted-foreground">{activeDisputeCount} active dispute{activeDisputeCount !== 1 ? 's' : ''} · {ps.resolvedDisputes.toLocaleString()} resolved total</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
            <Card
              className="cursor-pointer transition-all hover:shadow-glow-sm hover:border-primary/20"
              onClick={() => navigate('/admin/controls')}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-lg p-2 bg-muted text-muted-foreground">
                  <Sliders className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Contract Controls</p>
                  <p className="text-xs text-muted-foreground">Pause, fees, dispute timeout, sweep orphans, ownership</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Health Banner */}
      <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
        <Card className={`border-l-4 ${cfg.isPaused ? 'border-l-destructive' : 'border-l-success'}`}>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <ContractStatusIndicator isPaused={cfg.isPaused} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fee Rate</p>
                <span className="text-sm font-medium">{cfg.platformFeeBps / 100}%</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Dispute Timeout</p>
                <span className="text-sm font-medium">{cfg.disputeTimeout.toLocaleString()} blocks</span>
                <span className="text-xs text-muted-foreground ml-1">(~{blocksToTime(cfg.disputeTimeout)})</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Owner</p>
                <AddressDisplay address={cfg.owner} showCopy={false} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stat Cards */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Platform Statistics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div key={s.label} custom={i + 1} variants={cardVariants} initial="hidden" animate="visible">
                <Card className={s.warn ? 'border-warning/50' : ''}>
                  <CardContent className="p-5 flex items-start gap-3">
                    <div className={`rounded-lg p-2.5 ${s.warn ? 'bg-warning/10 text-foreground' : 'bg-muted text-muted-foreground'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className="font-mono text-lg font-bold mt-0.5">{s.value}</p>
                      {s.sub && <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Revenue Summary */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Revenue Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            { label: 'Total Revenue (STX)', value: `${formatSTX(ps.totalFeesStx)} STX`, sub: feesStxUsd, icon: TrendingUp },
            ...(ps.totalFeesSbtc > 0 ? [{ label: 'Total Revenue (sBTC)', value: `${formatSBTC(ps.totalFeesSbtc)} sBTC`, sub: feesSbtcUsd, icon: TrendingUp }] : []),
            { label: 'Avg Fee / Escrow (STX)', value: ps.totalEscrows > 0 ? `${formatSTX(Math.round(ps.totalFeesStx / ps.totalEscrows))} STX` : '—', sub: avgFeeStxUsd, icon: DollarSign },
            { label: 'Release Rate', value: ps.totalEscrows > 0 ? `${((ps.totalReleased / ps.totalEscrows) * 100).toFixed(1)}%` : '—', icon: CheckCircle2 },
            { label: 'Refund Rate', value: ps.totalEscrows > 0 ? `${((ps.totalRefunded / ps.totalEscrows) * 100).toFixed(1)}%` : '—', icon: RotateCcw },
          ] as Array<{ label: string; value: string; icon: typeof TrendingUp; sub?: string | null }>).map((r, i) => {
            const Icon = r.icon;
            return (
              <motion.div key={r.label} custom={i + 6} variants={cardVariants} initial="hidden" animate="visible">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{r.label}</span>
                    </div>
                    <p className="font-mono text-lg font-bold">{r.value}</p>
                    {r.sub && <p className="text-xs text-muted-foreground mt-0.5">{r.sub}</p>}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
