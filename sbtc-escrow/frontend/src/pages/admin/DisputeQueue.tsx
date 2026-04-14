import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDisputedEscrows, usePlatformConfig, useResolvedDisputes } from '@/hooks/use-admin';
import { DEFAULT_DISPUTE_TIMEOUT, DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';
import { useBlockHeight } from '@/hooks/use-block-height';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { DisputeTimeoutProgress } from '@/components/shared/DisputeTimeoutProgress';
import { EmptyState } from '@/components/shared/EmptyState';
import { EscrowListSkeleton } from '@/components/shared/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveDisputeForBuyer, resolveDisputeForSeller } from '@/lib/admin-service';
import { blocksToTime } from '@/lib/utils';
import { useBlockRate } from '@/hooks/use-block-rate';
import { cardVariants, listItemVariants, slideDown } from '@/lib/motion';
import { CheckCircle2, Shield, Clock, AlertTriangle, Timer } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { StatusBadge } from '@/components/shared/StatusBadge';

export default function DisputeQueue() {
  const { data: disputed, isLoading, isError } = useDisputedEscrows();
  const { data: config } = usePlatformConfig();
  const { data: resolvedDisputes = [] } = useResolvedDisputes();
  const { data: currentBlock = 0 } = useBlockHeight();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;
  const [confirmAction, setConfirmAction] = useState<{ escrowId: number; type: 'buyer' | 'seller'; amount: number; feeAmount: number; tokenType: number } | null>(null);
  const [loading, setLoading] = useState(false);

  if (isLoading) return <EscrowListSkeleton />;

  const disputeTimeout = config?.disputeTimeout || DEFAULT_DISPUTE_TIMEOUT;
  const active = (disputed || []).sort((a, b) => (a.disputedAt || 0) - (b.disputedAt || 0));
  const resolved = resolvedDisputes;

  const nearTimeoutCount = active.filter(e => {
    const elapsed = currentBlock - (e.disputedAt || 0);
    return elapsed / disputeTimeout > 0.75;
  }).length;

  const avgTimeOpen = active.length > 0
    ? Math.round(active.reduce((sum, e) => sum + (currentBlock - (e.disputedAt || 0)), 0) / active.length)
    : 0;

  const handleResolve = async (escrowId: number, type: 'buyer' | 'seller', amount: number, feeAmount: number, tokenType: number) => {
    setLoading(true);
    try {
      if (type === 'buyer') await resolveDisputeForBuyer(escrowId, amount, feeAmount, tokenType);
      else await resolveDisputeForSeller(escrowId, amount, feeAmount, tokenType);
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const summaryStats = [
    { label: 'Active Disputes', value: active.length.toString(), icon: Shield, warn: active.length > 0 },
    { label: 'Avg Time Open', value: blocksToTime(avgTimeOpen, minutesPerBlock), icon: Clock, warn: false },
    { label: 'Near Timeout', value: nearTimeoutCount.toString(), icon: Timer, warn: nearTimeoutCount > 0 },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-6">
      <h1 className="text-xl font-bold text-foreground tracking-tight">Dispute Resolution</h1>

      {isError && <ErrorBanner message="Failed to load disputes. Showing cached data." />}

      {/* Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {summaryStats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} custom={i} variants={cardVariants} initial="hidden" animate="visible">
              <Card className={s.warn ? 'border-warning/50' : ''}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`rounded-lg p-2.5 ${s.warn ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="font-mono text-sm font-semibold">{s.value}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="resolved">Resolved ({resolved.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {active.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No active disputes" description="All disputes have been resolved." />
          ) : (
            <div className="space-y-3">
              {active.map((e, idx) => {
                const elapsed = currentBlock - (e.disputedAt || 0);
                const urgencyRatio = elapsed / disputeTimeout;
                const isNearTimeout = urgencyRatio > 0.75;
                const isConfirming = confirmAction?.escrowId === e.id;

                return (
                  <motion.div key={e.id} custom={idx} variants={listItemVariants} initial="hidden" animate="visible">
                    <Card className={`border-l-4 ${isNearTimeout ? 'border-l-destructive' : 'border-l-warning'}`}>
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">#{e.id}</span>
                              <AmountDisplay micro={e.amount} tokenType={e.tokenType} showUsd={false} />
                              {isNearTimeout && (
                                <span className="text-xs font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">URGENT</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{e.description}</p>
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>Buyer: <AddressDisplay address={e.buyer} showCopy={false} truncateChars={3} /></span>
                              <span>Seller: <AddressDisplay address={e.seller} showCopy={false} truncateChars={3} /></span>
                            </div>
                            {e.disputedBy && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className={`font-medium ${e.disputedBy === e.buyer ? 'text-accent-warm' : 'text-primary'}`}>
                                  Disputed by {e.disputedBy === e.buyer ? 'Buyer' : 'Seller'}:
                                </span>
                                <AddressDisplay address={e.disputedBy} showCopy={false} truncateChars={3} />
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Disputed {blocksToTime(elapsed, minutesPerBlock)} ago · Block {e.disputedAt?.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <DisputeTimeoutProgress disputedAt={e.disputedAt!} />

                        <AnimatePresence mode="wait">
                        {isConfirming ? (
                          <motion.div variants={slideDown} initial="initial" animate="animate" exit="exit" className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                                Resolve escrow #{e.id} for <span className="font-semibold">{confirmAction.type}</span>?
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)} disabled={loading}>Cancel</Button>
                                <Button size="sm" onClick={() => handleResolve(e.id, confirmAction.type, e.amount, e.feeAmount, e.tokenType)} disabled={loading}>
                                  {loading ? 'Processing…' : 'Confirm'}
                                </Button>
                              </div>
                          </motion.div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setConfirmAction({ escrowId: e.id, type: 'buyer', amount: e.amount, feeAmount: e.feeAmount, tokenType: e.tokenType })} className="gap-1.5">
                              <Shield className="h-3.5 w-3.5" /> Resolve for Buyer
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmAction({ escrowId: e.id, type: 'seller', amount: e.amount, feeAmount: e.feeAmount, tokenType: e.tokenType })} className="gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Resolve for Seller
                            </Button>
                          </div>
                        )}
                        </AnimatePresence>

                        <p className="text-xs text-muted-foreground">
                          Note: After timeout, buyer can self-recover via resolve-expired-dispute.
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="resolved" className="mt-4">
          {resolved.length === 0 ? (
            <EmptyState icon={Shield} title="No resolved disputes" description="Resolved disputes will appear here." />
          ) : (
            <div className="space-y-3">
              {resolved.map((e, idx) => (
                <motion.div key={e.id} custom={idx} variants={listItemVariants} initial="hidden" animate="visible">
                  <Card className="border-l-4 border-l-muted">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">#{e.id}</span>
                          <AmountDisplay micro={e.amount} tokenType={e.tokenType} showUsd={false} />
                        </div>
                        <p className="text-xs text-muted-foreground">Completed block {e.completedAt?.toLocaleString()}</p>
                      </div>
                      <StatusBadge status={e.status} />
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
