import React, { useState, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useEscrowEvents } from '@/hooks/use-escrow';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { ActivitySkeleton } from '@/components/shared/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { relativeTime } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { cardVariants, listItemVariants, fadeInOut } from '@/lib/motion';
import {
  PlusCircle, CheckCircle2, XCircle, AlertTriangle, Shield, Clock, Inbox, ArrowUpRight,
  Activity, TrendingUp, Zap,
} from 'lucide-react';

const eventConfig: Record<string, { icon: typeof PlusCircle; color: string; label: string }> = {
  'escrow-created': { icon: PlusCircle, color: 'text-primary', label: 'Escrow Created' },
  'escrow-released': { icon: CheckCircle2, color: 'text-success', label: 'Payment Released' },
  'escrow-refunded': { icon: XCircle, color: 'text-status-refunded', label: 'Escrow Refunded' },
  'escrow-disputed': { icon: AlertTriangle, color: 'text-destructive', label: 'Dispute Filed' },
  'dispute-resolved-for-buyer': { icon: Shield, color: 'text-success', label: 'Dispute Resolved (Buyer)' },
  'dispute-resolved-for-seller': { icon: Shield, color: 'text-success', label: 'Dispute Resolved (Seller)' },
  'dispute-expired-resolved': { icon: Clock, color: 'text-warning', label: 'Dispute Timeout Resolved' },
  'escrow-extended': { icon: Clock, color: 'text-primary', label: 'Escrow Extended' },
};

const filterTypes = ['all', 'escrow-created', 'escrow-released', 'escrow-refunded', 'escrow-disputed', 'escrow-extended'] as const;

const filterLabels: Record<string, string> = {
  all: 'All',
  'escrow-created': 'Created',
  'escrow-released': 'Released',
  'escrow-refunded': 'Refunded',
  'escrow-disputed': 'Disputed',
  'escrow-extended': 'Extended',
};

export default function ActivityPage() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const { data: allEvents, isLoading, isError } = useEscrowEvents();
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const sortedAll = useMemo(
    () => (allEvents || []).slice().sort((a, b) => b.blockHeight - a.blockHeight),
    [allEvents],
  );

  const events = useMemo(
    () => sortedAll.filter(e => typeFilter === 'all' || e.eventType === typeFilter),
    [sortedAll, typeFilter],
  );

  // Count per filter type
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sortedAll.length };
    filterTypes.forEach(t => { if (t !== 'all') c[t] = sortedAll.filter(e => e.eventType === t).length; });
    return c;
  }, [sortedAll]);

  // Summary stats
  const totalEvents = sortedAll.length;
  const recentEvents = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return sortedAll.filter(e => new Date(e.timestamp).getTime() > cutoff).length;
  }, [sortedAll]);
  const mostActiveType = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    for (const e of sortedAll) {
      typeCounts[e.eventType] = (typeCounts[e.eventType] || 0) + 1;
    }
    const top = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
    return top ? (eventConfig[top[0]]?.label ?? top[0]) : '—';
  }, [sortedAll]);

  const summaryCards = [
    { label: 'Total Events', value: totalEvents.toLocaleString(), icon: Activity },
    { label: 'Last 24h', value: recentEvents.toLocaleString(), icon: TrendingUp },
    { label: 'Most Active', value: mostActiveType, icon: Zap },
  ];

  if (isLoading) return <ActivitySkeleton />;

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-6">
      <h1 className="text-xl font-bold text-foreground tracking-tight">Activity</h1>

      {isError && <ErrorBanner message="Failed to load activity. Showing cached data." />}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {summaryCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label} custom={i} variants={cardVariants} initial="hidden" animate="visible">
              <Card>
                <CardContent className="p-3 text-center">
                  <Icon className="h-4 w-4 text-primary mx-auto mb-1.5" />
                  <p className="text-lg font-mono font-bold text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Filter tabs */}
      <Tabs value={typeFilter} onValueChange={setTypeFilter}>
        <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
          {filterTypes.map(t => (
            <TabsTrigger
              key={t}
              value={t}
              className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-2.5 py-1"
            >
              {filterLabels[t] ?? t}
              {counts[t] > 0 && (
                <span className="ml-1 text-xs opacity-70">{counts[t]}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Timeline */}
      <AnimatePresence mode="wait">
      {events.length === 0 ? (
        <motion.div key="empty" variants={fadeInOut} initial="initial" animate="animate" exit="exit">
        <EmptyState
          icon={Inbox}
          title="No activity"
          description="Events will appear here once you create or interact with escrows."
          actionLabel="Create Escrow"
          onAction={() => navigate('/create')}
        />
        </motion.div>
      ) : (
        <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Timeline
                <span className="text-xs font-normal text-muted-foreground">· {events.length} events</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative">
                <div className="absolute left-7 top-0 bottom-0 w-px bg-border" />
                <div className="divide-y divide-border">
                  {events.map((evt, i) => {
                    const cfg = eventConfig[evt.eventType] || eventConfig['escrow-created'];
                    const Icon = cfg.icon;

                    return (
                      <motion.div
                        key={evt.id}
                        custom={i}
                        variants={listItemVariants}
                        initial="hidden"
                        animate="visible"
                        className="relative flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => navigate(`/escrow/${evt.escrowId}`)}
                      >
                        <div className="relative z-10 flex items-center justify-center h-7 w-7 rounded-full bg-card border border-border shrink-0">
                          <Icon className={`h-3 w-3 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{cfg.label}</span>
                            <span className="text-xs font-mono text-muted-foreground">
                              #{evt.escrowId} <ArrowUpRight className="h-2.5 w-2.5 inline" />
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {evt.actor ? (
                              <AddressDisplay address={evt.actor} showCopy={false} truncateChars={3} />
                            ) : (
                              <span className="text-xs text-muted-foreground">System</span>
                            )}
                            <span className="text-xs text-muted-foreground">· {relativeTime(evt.timestamp)}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
