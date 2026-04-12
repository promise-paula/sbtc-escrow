import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';
import { useEscrows, useUserStats } from '@/hooks/use-escrow';
import { useBlockHeight } from '@/hooks/use-block-height';
import { EscrowStatus, STATUS_LABELS } from '@/lib/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { EmptyState } from '@/components/shared/EmptyState';
import { DashboardSkeleton } from '@/components/shared/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PlusCircle, ArrowRight, Inbox, Lock, Clock, CheckCircle, ShoppingCart, Store, List, Activity } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { formatSTX, blocksToTime, truncateAddress } from '@/lib/utils';
import { motion } from 'framer-motion';
import { cardVariants, listItemVariants } from '@/lib/motion';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const STATUS_COLORS: Record<EscrowStatus, string> = {
  [EscrowStatus.Pending]: 'hsl(38, 92%, 50%)',
  [EscrowStatus.Released]: 'hsl(160, 84%, 39%)',
  [EscrowStatus.Refunded]: 'hsl(239, 84%, 67%)',
  [EscrowStatus.Disputed]: 'hsl(0, 84%, 60%)',
};

const STATUS_DOT_CLASSES: Record<EscrowStatus, string> = {
  [EscrowStatus.Pending]: 'bg-status-pending',
  [EscrowStatus.Released]: 'bg-status-released',
  [EscrowStatus.Refunded]: 'bg-status-refunded',
  [EscrowStatus.Disputed]: 'bg-status-disputed',
};

const QUICK_ACTIONS = [
  { label: 'Create Escrow', icon: PlusCircle, route: '/create' },
  { label: 'My Escrows', icon: List, route: '/escrows' },
  { label: 'Activity Feed', icon: Activity, route: '/activity' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const { data: escrows, isLoading: escrowsLoading, isError: escrowsError } = useEscrows(address);
  const { data: stats, isLoading: statsLoading } = useUserStats(address);
  const { data: currentBlock = 0 } = useBlockHeight();

  if (escrowsLoading || statsLoading) return <DashboardSkeleton />;

  const recentEscrows = (escrows || [])
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  const statusCounts = (escrows || []).reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const pieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[Number(status) as EscrowStatus],
    value: count,
    status: Number(status) as EscrowStatus,
  }));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <Button size="sm" onClick={() => navigate('/create')} className="gap-1.5">
          <PlusCircle className="h-3.5 w-3.5" /> Create Escrow
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <Card className="border-l-2 border-l-accent-warm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Locked</span>
              </div>
              <p className="text-2xl font-mono font-semibold text-accent-warm">
                {stats ? formatSTX(stats.totalLockedStx) : '0'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                STX{stats && stats.totalLockedSbtc > 0 ? ` + ${(stats.totalLockedSbtc / 1e8).toFixed(4)} sBTC` : ''}
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
              <p className="text-2xl font-mono font-semibold text-foreground">
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
              <p className="text-2xl font-mono font-semibold text-foreground">
                {stats?.completedEscrows ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">released + refunded</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Status Distribution - full width */}
      <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-foreground mb-3">Status Distribution</p>
            {pieData.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="h-[120px] w-[120px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={32}
                        outerRadius={52}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={STATUS_COLORS[entry.status]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {pieData.map((entry) => (
                    <span key={entry.name} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[entry.status]}`} />
                      {entry.name} <span className="font-mono text-foreground">{entry.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">No data yet</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_ACTIONS.map((action, i) => (
          <motion.div key={action.route} custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <Card
              className="cursor-pointer border-border hover:bg-muted/50 transition-colors"
              onClick={() => navigate(action.route)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <action.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{action.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Error state */}
      {escrowsError && <ErrorBanner message="Failed to load escrows. Showing cached data." />}

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-foreground">Recent Activity</h2>
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
                const blockAge = currentBlock - e.createdAt;
                const role = e.buyer === address ? 'to' : 'from';
                return (
                  <motion.div
                    key={e.id}
                    custom={i}
                    variants={listItemVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/escrow/${e.id}`)}
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT_CLASSES[e.status]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        Escrow <span className="font-mono">#{e.id}</span> {role}{' '}
                        <span className="font-mono text-muted-foreground">{truncateAddress(counterparty)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{blocksToTime(blockAge)} ago</p>
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
