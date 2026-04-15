import React from 'react';
import { motion } from 'framer-motion';
import { usePlatformStats, usePlatformConfig } from '@/hooks/use-admin';
import { formatSTX, formatSBTC, blocksToTime } from '@/lib/utils';
import { useBlockRate } from '@/hooks/use-block-rate';
import { DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';
import { cardVariants } from '@/lib/motion';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { ContractStatusIndicator } from '@/components/shared/ContractStatusIndicator';
import { DashboardSkeleton } from '@/components/shared/PageSkeletons';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Sliders, ArrowRightLeft, DollarSign, Coins, CheckCircle2, ShieldAlert, ShieldCheck, RotateCcw, TrendingUp } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: platformStats, isLoading: statsLoading, isError: statsError } = usePlatformStats();
  const { data: config, isLoading: configLoading, isError: configError } = usePlatformConfig();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;

  if (statsLoading || configLoading) return <DashboardSkeleton />;

  const ps = platformStats!;
  const cfg = config!;

  const stats = [
    { label: 'Total Escrows', value: ps.totalEscrows.toLocaleString(), icon: ArrowRightLeft },
    { label: 'Volume (STX)', value: `${formatSTX(ps.totalVolumeStx)} STX`, icon: Coins },
    ...(ps.totalVolumeSbtc > 0 ? [{ label: 'Volume (sBTC)', value: `${formatSBTC(ps.totalVolumeSbtc)} sBTC`, icon: Coins }] : []),
    { label: 'Fees (STX)', value: `${formatSTX(ps.totalFeesStx)} STX`, icon: DollarSign },
    ...(ps.totalFeesSbtc > 0 ? [{ label: 'Fees (sBTC)', value: `${formatSBTC(ps.totalFeesSbtc)} sBTC`, icon: DollarSign }] : []),
    { label: 'Released', value: ps.totalReleased.toLocaleString(), icon: CheckCircle2 },
    { label: 'Refunded', value: ps.totalRefunded.toLocaleString(), icon: RotateCcw },
    { label: 'Active Disputes', value: ps.activeDisputes.toLocaleString(), icon: ShieldAlert, warn: ps.activeDisputes > 0 },
    { label: 'Resolved Disputes', value: ps.resolvedDisputes.toLocaleString(), icon: ShieldCheck },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-6">
      <h1 className="text-xl font-bold text-foreground tracking-tight">Admin Dashboard</h1>

      {(statsError || configError) && <ErrorBanner message="Failed to load platform data. Showing cached data." />}

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
                    <div className={`rounded-lg p-2.5 ${s.warn ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className="font-mono text-lg font-bold mt-0.5">{s.value}</p>
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
          {[
            { label: 'Total Revenue (STX)', value: `${formatSTX(ps.totalFeesStx)} STX`, icon: TrendingUp },
            ...(ps.totalFeesSbtc > 0 ? [{ label: 'Total Revenue (sBTC)', value: `${formatSBTC(ps.totalFeesSbtc)} sBTC`, icon: TrendingUp }] : []),
            { label: 'Avg Fee / Escrow (STX)', value: ps.totalEscrows > 0 ? `${formatSTX(Math.round(ps.totalFeesStx / ps.totalEscrows))} STX` : '—', icon: DollarSign },
            { label: 'Release Rate', value: ps.totalEscrows > 0 ? `${((ps.totalReleased / ps.totalEscrows) * 100).toFixed(1)}%` : '—', icon: CheckCircle2 },
            { label: 'Refund Rate', value: ps.totalEscrows > 0 ? `${((ps.totalRefunded / ps.totalEscrows) * 100).toFixed(1)}%` : '—', icon: RotateCcw },
          ].map((r, i) => {
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
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <motion.div custom={10} variants={cardVariants} initial="hidden" animate="visible">
            <Card
              className="cursor-pointer transition-all hover:shadow-glow-sm hover:border-primary/20"
              onClick={() => navigate('/admin/disputes')}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-lg p-2 ${ps.activeDisputes > 0 ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Dispute Queue</p>
                  <p className="text-xs text-muted-foreground">{ps.activeDisputes} active dispute{ps.activeDisputes !== 1 ? 's' : ''} awaiting resolution</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div custom={11} variants={cardVariants} initial="hidden" animate="visible">
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
                  <p className="text-xs text-muted-foreground">Manage fees, timeouts, and emergency settings</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
