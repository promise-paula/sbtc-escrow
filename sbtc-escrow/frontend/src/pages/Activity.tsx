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
import { motion } from 'framer-motion';
import { cardVariants, listItemVariants } from '@/lib/motion';
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

  // Summary stats
  const totalEvents = sortedAll.length;
  const recentEvents = sortedAll.filter(
    e => (Date.now() - new Date(e.timestamp).getTime()) <= 24 * 60 * 60_000, // last 24h
  ).length;
  const mostActiveType = useMemo(() => {
    const counts: Record<string, number> = {};
    sortedAll.forEach(e => { counts[e.eventType] = (counts[e.eventType] || 0) + 1; });
    let max = ''; let maxC = 0;
    Object.entries(counts).forEach(([k, v]) => { if (v > maxC) { max = k; maxC = v; } });
    return max || 'escrow-created';
  }, [sortedAll]);

  // Count per filter type
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sortedAll.length };
    filterTypes.forEach(t => { if (t !== 'all') c[t] = sortedAll.filter(e => e.eventType === t).length; });
    return c;
  }, [sortedAll]);

  if (isLoading) return <ActivitySkeleton />;

  const summaryCards = [
    { icon: Activity, label: 'Total Events', value: totalEvents.toString() },
    { icon: Zap, label: 'Last 24h', value: recentEvents.toString() },
    { icon: TrendingUp, label: 'Most Active', value: (eventConfig[mostActiveType]?.label || 'Created').replace('Escrow ', '') },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-5">
      <h1 className="text-lg font-semibold text-foreground">Activity</h1>

      {isError && <ErrorBanner message="Failed to load activity. Showing cached data." />}

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {summaryCards.map((s, i) => (
          <motion.div key={s.label} custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <Card>
              <CardContent className="p-3 flex items-center gap-2.5">
                <div className="rounded-md bg-muted p-1.5">
                  <s.icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground font-mono truncate">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
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
                <span className="ml-1 text-[10px] opacity-70">{counts[t]}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Timeline */}
      {events.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No activity"
          description="Events will appear here once you create or interact with escrows."
          actionLabel="Create Escrow"
          onAction={() => navigate('/create')}
        />
      ) : (
        <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader className="pb-2">
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
                            <AddressDisplay address={evt.actor} showCopy={false} truncateChars={3} />
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
    </div>
  );
}
