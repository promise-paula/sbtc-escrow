import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';
import { useEscrows, useUserStats } from '@/hooks/use-escrow';
import { EscrowStatus } from '@/lib/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { EmptyState } from '@/components/shared/EmptyState';
import { DashboardSkeleton } from '@/components/shared/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PlusCircle, ArrowRight, Inbox, Lock, Clock, CheckCircle, ShoppingCart, Store, List, Activity } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { formatSTX, relativeTime, truncateAddress } from '@/lib/utils';
import { motion } from 'framer-motion';
import { cardVariants, listItemVariants } from '@/lib/motion';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { STATUS_LABELS } from '@/lib/types';

const STATUS_COLORS: Record<EscrowStatus, string> = {
  [EscrowStatus.Pending]: 'oklch(75% 0.15 85)',
  [EscrowStatus.Released]: 'oklch(62% 0.17 155)',
  [EscrowStatus.Refunded]: 'oklch(55% 0.2 285)',
  [EscrowStatus.Disputed]: 'oklch(55% 0.22 27)',
};

const STATUS_DOT_CLASSES: Record<EscrowStatus, string> = {
  [EscrowStatus.Pending]: 'bg-status-pending',
  [EscrowStatus.Released]: 'bg-status-released',
  [EscrowStatus.Refunded]: 'bg-status-refunded',
  [EscrowStatus.Disputed]: 'bg-status-disputed',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const { data: escrows, isLoading: escrowsLoading, isError: escrowsError } = useEscrows(address);
  const { data: stats, isLoading: statsLoading } = useUserStats(address);

  if (escrowsLoading || statsLoading) return <DashboardSkeleton />;

  const recentEscrows = (escrows || [])
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  const statusCounts = (escrows || []).reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const pieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[Number(status) as EscrowStatus] ?? 'Unknown',
    value: count,
    fill: STATUS_COLORS[Number(status) as EscrowStatus] ?? 'oklch(50% 0 0)',
  }));

  const QUICK_ACTIONS = [
    { label: 'Create Escrow', icon: PlusCircle, path: '/create' },
    { label: 'My Escrows', icon: List, path: '/escrows' },
    { label: 'Activity', icon: Activity, path: '/activity' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <Button size="sm" onClick={() => navigate('/create')} className="gap-1.5">
          <PlusCircle className="h-3.5 w-3.5" /> Create Escrow
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <Card className="border-l-2 border-l-accent-warm shadow-glow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Locked</span>
              </div>
              {stats && (stats.totalLockedStx > 0 || stats.totalLockedSbtc > 0) ? (
                <div className="space-y-1">
                  {stats.totalLockedStx > 0 && (
                    <p className="text-2xl font-mono font-bold text-accent-warm">
                      {formatSTX(stats.totalLockedStx)} <span className="text-sm font-normal text-muted-foreground">STX</span>
                    </p>
                  )}
                  {stats.totalLockedSbtc > 0 && (
                    <p className={`font-mono font-bold text-accent-warm ${stats.totalLockedStx > 0 ? 'text-base' : 'text-2xl'}`}>
                      {(stats.totalLockedSbtc / 1e8).toFixed(4)} <span className="text-sm font-normal text-muted-foreground">sBTC</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-2xl font-mono font-bold text-muted-foreground">—</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {stats?.activeEscrows ?? 0} active escrow{(stats?.activeEscrows ?? 0) !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Active Escrows</span>
              </div>
              <p className="text-2xl font-mono font-bold text-foreground">
                {stats?.activeEscrows ?? 0}
              </p>
              <div className="flex gap-3 mt-1.5">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <ShoppingCart className="h-3 w-3" /> {stats?.asBuyer ?? 0} buyer
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Store className="h-3 w-3" /> {stats?.asSeller ?? 0} seller
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Completed</span>
              </div>
              <p className="text-2xl font-mono font-bold text-foreground">
                {stats?.completedEscrows ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">released + refunded</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Error state */}
      {escrowsError && <ErrorBanner message="Failed to load escrows. Showing cached data." />}

      {/* Status Distribution + Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Status Distribution */}
        {pieData.length > 0 && (
          <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
            <Card>
              <CardContent className="p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3">Status Distribution</h2>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-3 mt-2 justify-center">
                  {pieData.map((d) => (
                    <span key={d.name} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.fill }} />
                      {d.name} ({d.value})
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Quick Actions */}
        <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-4 space-y-2">
              <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <div
                    key={a.label}
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-muted/50 hover:shadow-glow-sm hover:border-primary/20 transition-all"
                    onClick={() => navigate(a.path)}
                  >
                    <div className="rounded-md bg-muted p-2">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{a.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
          {recentEscrows.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/escrows')} className="gap-1 text-xs text-muted-foreground">
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </div>

        {recentEscrows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No escrows yet"
            description="Create your first escrow to get started with trustless payments."
            actionLabel="Create Escrow"
            onAction={() => navigate('/create')}
          />
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {recentEscrows.map((e, i) => {
                const counterparty = e.buyer === address ? e.seller : e.buyer;
                const role = e.buyer === address ? 'to' : 'from';
                return (
                  <motion.div
                    key={e.id}
                    custom={i}
                    variants={listItemVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 hover:shadow-glow-sm transition-all"
                    onClick={() => navigate(`/escrow/${e.id}`)}
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT_CLASSES[e.status]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        Escrow <span className="font-mono">#{e.id}</span> {role}{' '}
                        <span className="font-mono text-muted-foreground">{truncateAddress(counterparty)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{e.indexedAt ? relativeTime(e.indexedAt) : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <AmountDisplay micro={e.amount} tokenType={e.tokenType} showUsd={false} />
                    </div>
                    <StatusBadge status={e.status} />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
