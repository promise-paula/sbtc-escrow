import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDisputedEscrows, usePlatformConfig, useResolvedDisputes } from '@/hooks/use-admin';
import { DEFAULT_DISPUTE_TIMEOUT, DEFAULT_MINUTES_PER_BLOCK, BURN_BLOCK_MINUTES, usesBurnBlockClock } from '@/lib/stacks-config';
import { useBlockHeight } from '@/hooks/use-block-height';
import { useBurnBlockHeight } from '@/hooks/use-burn-block-height';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { DisputeTimeoutProgress } from '@/components/shared/DisputeTimeoutProgress';
import { EmptyState } from '@/components/shared/EmptyState';
import { EscrowListSkeleton } from '@/components/shared/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveDisputeForBuyer, resolveDisputeForSeller, resolveDisputeSplit } from '@/lib/admin-service';
import { Input } from '@/components/ui/input';
import { supportsOnChainDelivery } from '@/lib/stacks-config';
import { formatAmount } from '@/lib/utils';
import { EscrowStatus } from '@/lib/types';
import { blocksToTime } from '@/lib/utils';
import { useBlockRate } from '@/hooks/use-block-rate';
import { cardVariants, listItemVariants, slideDown } from '@/lib/motion';
import { CheckCircle2, Shield, Clock, AlertTriangle, Timer, MessageSquare } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useDisputeReasons } from '@/hooks/use-dispute-reason';

export default function DisputeQueue() {
  const { data: disputed, isLoading, isError } = useDisputedEscrows();
  const { data: config } = usePlatformConfig();
  const { data: resolvedDisputes = [] } = useResolvedDisputes();
  const { data: stacksBlock = 0 } = useBlockHeight();
  const { data: burnBlock = 0 } = useBurnBlockHeight();
  const { data: blockRate } = useBlockRate();
  const stacksMinutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;
  // Per-row clock + rate selector. v3+ escrows anchor disputed_at to burn
  // blocks; legacy v2/v7 use stacks blocks. Mixing them caused the admin
  // queue to show every v3 dispute as "timed out" within seconds because
  // (stacks_tip - burn_disputed_at) ≈ 3.8M blocks, vastly exceeding the
  // dispute timeout. Each dispute is now evaluated against the clock its
  // contract uses.
  const tipFor = (contractId: string) => (usesBurnBlockClock(contractId) ? burnBlock : stacksBlock);
  const ratePerBlockFor = (contractId: string) =>
    usesBurnBlockClock(contractId) ? BURN_BLOCK_MINUTES : stacksMinutesPerBlock;
  const [confirmAction, setConfirmAction] = useState<{ contractId: string; escrowId: number; type: 'buyer' | 'seller'; amount: number; feeAmount: number; tokenType: number } | null>(null);
  // v7+ split-resolution panel state. Separate from confirmAction because
  // the split flow has its own input (buyer-bps) rather than a binary
  // confirm. buyerBps is a string for input control; parsed on submit.
  const [splitPanel, setSplitPanel] = useState<{
    contractId: string;
    escrowId: number;
    amount: number;
    feeAmount: number;
    tokenType: number;
    buyerBps: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: disputeReasonMap = {} } = useDisputeReasons((disputed || []).map(e => e.id));

  if (isLoading) return <EscrowListSkeleton />;

  const disputeTimeout = config?.disputeTimeout || DEFAULT_DISPUTE_TIMEOUT;
  const active = (disputed || []).sort((a, b) => (a.disputedAt || 0) - (b.disputedAt || 0));
  const resolved = resolvedDisputes;

  const nearTimeoutCount = active.filter(e => {
    const elapsed = tipFor(e.contractId) - (e.disputedAt || 0);
    return elapsed / disputeTimeout > 0.75;
  }).length;

  // Aggregate as wall-clock minutes since the per-row "blocks" are mixed-
  // clock (v3 disputes use burn blocks, legacy uses stacks blocks). Summing
  // raw blocks would compare different units and produce nonsense averages.
  const avgMinutesOpen = active.length > 0
    ? Math.round(
        active.reduce((sum, e) => {
          const blocks = tipFor(e.contractId) - (e.disputedAt || 0);
          return sum + blocks * ratePerBlockFor(e.contractId);
        }, 0) / active.length,
      )
    : 0;

  const handleResolve = async (
    contractId: string,
    escrowId: number,
    type: 'buyer' | 'seller',
    amount: number,
    feeAmount: number,
    tokenType: number,
  ) => {
    setLoading(true);
    try {
      if (type === 'buyer') await resolveDisputeForBuyer(contractId, escrowId, amount, feeAmount, tokenType);
      else await resolveDisputeForSeller(contractId, escrowId, amount, feeAmount, tokenType);
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const handleSplitResolve = async () => {
    if (!splitPanel) return;
    const bps = parseInt(splitPanel.buyerBps, 10);
    if (!Number.isFinite(bps) || bps < 0 || bps > 10000) return;
    setLoading(true);
    try {
      await resolveDisputeSplit(
        splitPanel.contractId,
        splitPanel.escrowId,
        bps,
        splitPanel.amount,
        splitPanel.feeAmount,
        splitPanel.tokenType,
      );
    } finally {
      setLoading(false);
      setSplitPanel(null);
    }
  };

  const summaryStats = [
    { label: 'Active Disputes', value: active.length.toString(), icon: Shield, warn: active.length > 0 },
    {
      label: 'Avg Time Open',
      // blocksToTime expects (blocks, min-per-block) — here we already have
      // minutes, so feed it 1 min/block to keep the formatting.
      value: blocksToTime(avgMinutesOpen, 1),
      icon: Clock,
      warn: false,
    },
    { label: 'Near Timeout', value: nearTimeoutCount.toString(), icon: Timer, warn: nearTimeoutCount > 0 },
  ];

  return (
    <div className="p-4 sm:p-6 pb-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Dispute Resolution</h1>

      {isError && <ErrorBanner message="Failed to load disputes. Showing cached data." />}

      {/* Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {summaryStats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} custom={i} variants={cardVariants} initial="hidden" animate="visible">
              <Card className={s.warn ? 'border-warning/50' : ''}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`rounded-lg p-2.5 ${s.warn ? 'bg-warning/10 text-foreground' : 'bg-muted text-muted-foreground'}`}>
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
                const minutesPerBlock = ratePerBlockFor(e.contractId);
                const elapsed = tipFor(e.contractId) - (e.disputedAt || 0);
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
                              <AmountDisplay micro={e.amount} tokenType={e.tokenType} />
                              {isNearTimeout && (
                                <span className="text-xs font-medium text-destructive-foreground bg-destructive px-1.5 py-0.5 rounded">URGENT</span>
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
                            {(() => {
                              const dr = disputeReasonMap[e.id];
                              if (!dr) return null;
                              return (
                                <div className="mt-1.5 rounded-md border border-warning/25 bg-warning/5 px-3 py-2 space-y-0.5">
                                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <MessageSquare className="h-3 w-3 shrink-0" />
                                    {dr.reasonLabel}
                                  </p>
                                  {dr.details && (
                                    <p className="text-xs text-muted-foreground italic pl-4">"{dr.details}"</p>
                                  )}
                                </div>
                              );
                            })()}
                            <p className="text-xs text-muted-foreground">
                              Disputed {blocksToTime(elapsed, minutesPerBlock)} ago · Block {e.disputedAt?.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <DisputeTimeoutProgress
                          disputedAt={e.disputedAt!}
                          contractId={e.contractId}
                        />

                        <AnimatePresence mode="wait">
                        {/* Split-resolution panel — v7+ only. Lets admin allocate
                            a custom percentage to each side (e.g. 60/40 for a
                            partial-delivery case). Buyer-bps is the buyer's
                            share; seller gets the remainder. Platform fee
                            comes off whatever the seller receives. */}
                        {splitPanel && splitPanel.escrowId === e.id ? (
                          <motion.div
                            variants={slideDown}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-3"
                          >
                            {(() => {
                              const bps = parseInt(splitPanel.buyerBps, 10) || 0;
                              const buyerShare = Math.floor((e.amount * bps) / 10000);
                              const sellerGross = e.amount - buyerShare;
                              const sellerNet = Math.max(0, sellerGross - e.feeAmount);
                              const valid = bps >= 0 && bps <= 10000;
                              return (
                                <>
                                  <div className="flex items-center gap-2 text-sm font-medium">
                                    <Shield className="h-3.5 w-3.5 text-foreground" />
                                    Split-resolve escrow #{e.id}
                                  </div>
                                  <div className="space-y-1.5">
                                    <p className="text-xs text-muted-foreground">
                                      Buyer's share (basis points, 0–10000 — e.g. 6000 = 60%)
                                    </p>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={10000}
                                      step={100}
                                      value={splitPanel.buyerBps}
                                      onChange={(ev) => setSplitPanel({ ...splitPanel, buyerBps: ev.target.value })}
                                      className="font-mono text-sm w-32"
                                    />
                                  </div>
                                  <div className="rounded-md border border-border bg-background p-2.5 text-xs space-y-1">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Buyer receives:</span>
                                      <span className="font-mono">{formatAmount(buyerShare, e.tokenType)} ({(bps / 100).toFixed(2)}%)</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Seller receives (after fee):</span>
                                      <span className="font-mono">{formatAmount(sellerNet, e.tokenType)} ({((10000 - bps) / 100).toFixed(2)}%)</span>
                                    </div>
                                    <div className="flex justify-between text-muted-foreground">
                                      <span>Platform fee:</span>
                                      <span className="font-mono">{formatAmount(e.feeAmount, e.tokenType)}</span>
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    This action is final and cannot be undone.
                                  </p>
                                  <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setSplitPanel(null)} disabled={loading}>
                                      Cancel
                                    </Button>
                                    <Button size="sm" onClick={handleSplitResolve} disabled={loading || !valid}>
                                      {loading ? 'Processing…' : 'Confirm Split'}
                                    </Button>
                                  </div>
                                </>
                              );
                            })()}
                          </motion.div>
                        ) : isConfirming ? (
                          <motion.div variants={slideDown} initial="initial" animate="animate" exit="exit" className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <AlertTriangle className="h-3.5 w-3.5 text-foreground" />
                                  Resolve escrow #{e.id} for{' '}
                                  <span className="font-semibold">{confirmAction.type}</span>?
                                </div>
                                {/* Spell out the outcome so the admin doesn't conflate
                                    "for buyer" with "buyer is right" — what it actually
                                    means is the funds flow path. */}
                                <p className="text-xs text-muted-foreground">
                                  {confirmAction.type === 'buyer'
                                    ? 'Funds will be refunded to the buyer. Seller receives nothing.'
                                    : 'Funds will be released to the seller (minus the platform fee). Buyer receives nothing.'}{' '}
                                  This action is final and cannot be undone.
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)} disabled={loading}>Cancel</Button>
                                <Button size="sm" onClick={() => handleResolve(e.contractId, e.id, confirmAction.type, e.amount, e.feeAmount, e.tokenType)} disabled={loading}>
                                  {loading ? 'Processing…' : 'Confirm'}
                                </Button>
                              </div>
                          </motion.div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setConfirmAction({ contractId: e.contractId, escrowId: e.id, type: 'buyer', amount: e.amount, feeAmount: e.feeAmount, tokenType: e.tokenType })} className="gap-1.5">
                              <Shield className="h-3.5 w-3.5" /> Resolve for Buyer
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmAction({ contractId: e.contractId, escrowId: e.id, type: 'seller', amount: e.amount, feeAmount: e.feeAmount, tokenType: e.tokenType })} className="gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Resolve for Seller
                            </Button>
                            {/* Split path is v7+ only — older contracts lack
                                resolve-dispute-split entirely. Hide the button
                                rather than disable to avoid implying the
                                feature is "temporarily" unavailable. */}
                            {supportsOnChainDelivery(e.contractId) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setSplitPanel({
                                    contractId: e.contractId,
                                    escrowId: e.id,
                                    amount: e.amount,
                                    feeAmount: e.feeAmount,
                                    tokenType: e.tokenType,
                                    buyerBps: '5000',
                                  })
                                }
                                className="gap-1.5"
                              >
                                <Shield className="h-3.5 w-3.5" /> Split…
                              </Button>
                            )}
                          </div>
                        )}
                        </AnimatePresence>

                        <p className="text-xs text-muted-foreground">
                          Note: After the dispute window elapses, the <strong>buyer</strong>{' '}
                          can self-recover via <span className="font-mono">resolve-expired-dispute</span>.
                          {usesBurnBlockClock(e.contractId) && (
                            <>
                              {' '}On v3+ contracts, if the escrow was marked delivered and{' '}
                              <strong>2× the timeout</strong> elapses, the{' '}
                              <strong>seller</strong> can self-rescue via{' '}
                              <span className="font-mono">resolve-expired-dispute-for-seller</span>.
                            </>
                          )}
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
              {resolved.map((e, idx) => {
                const resolvedFor = e.status === EscrowStatus.Released ? 'Seller' : 'Buyer';
                const resolvedForClass = e.status === EscrowStatus.Released ? 'text-primary' : 'text-accent-warm';
                return (
                <motion.div key={e.id} custom={idx} variants={listItemVariants} initial="hidden" animate="visible">
                  <Card className="border-l-4 border-l-muted">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">#{e.id}</span>
                          <AmountDisplay micro={e.amount} tokenType={e.tokenType} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Resolved for <span className={`font-medium ${resolvedForClass}`}>{resolvedFor}</span>
                          {' · '}Block {e.completedAt?.toLocaleString()}
                        </p>
                      </div>
                      <StatusBadge status={e.status} />
                    </CardContent>
                  </Card>
                </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
