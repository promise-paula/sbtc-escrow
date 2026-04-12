import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CURRENT_BLOCK_HEIGHT, mockEvents } from '@/lib/mock-data';
import { useWallet } from '@/contexts/WalletContext';
import { useEscrow } from '@/hooks/use-escrow';
import { usePlatformConfig } from '@/hooks/use-admin';
import { EscrowStatus } from '@/lib/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { DisputeTimeoutProgress } from '@/components/shared/DisputeTimeoutProgress';
import { ExtendEscrowPanel } from '@/components/shared/ExtendEscrowPanel';
import { EscrowDetailSkeleton } from '@/components/shared/PageSkeletons';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { releaseEscrow, refundEscrow, disputeEscrow, resolveExpiredDispute } from '@/lib/escrow-service';
import { blocksToTime } from '@/lib/utils';
import { motion } from 'framer-motion';
import { cardVariants, listItemVariants, pageVariants } from '@/lib/motion';
import {
  ArrowLeft, AlertTriangle, CheckCircle2, XCircle, Shield,
  Users, Info, Clock, Zap, PlusCircle, Timer, Share2, Link, Download
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { generateEscrowReceipt } from '@/lib/generate-receipt';
import { toast } from 'sonner';

const EVENT_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  created: { label: 'Created', color: 'bg-primary', icon: PlusCircle },
  released: { label: 'Released', color: 'bg-status-released', icon: CheckCircle2 },
  refunded: { label: 'Refunded', color: 'bg-status-refunded', icon: XCircle },
  disputed: { label: 'Disputed', color: 'bg-status-disputed', icon: AlertTriangle },
  extended: { label: 'Extended', color: 'bg-primary', icon: Timer },
};

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function EscrowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { address } = useWallet();
  const { data: escrow, isLoading, isError: escrowError } = useEscrow(parseInt(id || '0'));
  const { data: config, isError: configError } = usePlatformConfig();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isLoading) return <EscrowDetailSkeleton />;

  if (!escrow) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">Escrow not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/escrows')} className="mt-4">Back to Escrows</Button>
      </div>
    );
  }

  const isPaused = config?.isPaused ?? false;
  const disputeTimeout = config?.disputeTimeout ?? 4320;
  const isBuyer = escrow.buyer === address;
  const isSeller = escrow.seller === address;
  const isParty = isBuyer || isSeller;
  const isPending = escrow.status === EscrowStatus.Pending;
  const isDisputed = escrow.status === EscrowStatus.Disputed;
  const isExpired = escrow.expiresAt <= CURRENT_BLOCK_HEIGHT;
  const blocksToExpiry = escrow.expiresAt - CURRENT_BLOCK_HEIGHT;
  const disputeTimedOut = isDisputed && escrow.disputedAt
    ? (CURRENT_BLOCK_HEIGHT - escrow.disputedAt) >= disputeTimeout
    : false;

  const hasActions = (
    (isBuyer && (isPending || isExpired) && !isDisputed) ||
    (isBuyer && isPending && !isExpired) ||
    (isPending && !isExpired) ||
    (isSeller && isPending) ||
    (isBuyer && isPending && isExpired) ||
    (isBuyer && disputeTimedOut)
  );

  const escrowEvents = mockEvents
    .filter(e => e.escrowId === escrow.id)
    .sort((a, b) => b.blockHeight - a.blockHeight);

  const handleAction = async (action: string) => {
    setLoading(true);
    try {
      switch (action) {
        case 'release': await releaseEscrow(escrow.id); break;
        case 'refund': await refundEscrow(escrow.id); break;
        case 'dispute': await disputeEscrow(escrow.id); break;
        case 'recover': await resolveExpiredDispute(escrow.id); break;
      }
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <motion.div variants={pageVariants} initial="initial" animate="animate">
        <button onClick={() => navigate('/escrows')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> My Escrows
        </button>
      </motion.div>

      {(escrowError || configError) && <ErrorBanner message="Failed to load escrow details. Showing cached data." />}

      {isPaused && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-center gap-2 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Contract is paused — actions are temporarily disabled.
        </div>
      )}

      {/* Hero Summary Card */}
      <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-semibold font-mono text-foreground">#{escrow.id}</span>
                  <StatusBadge status={escrow.status} />
                  {isExpired && isPending && (
                    <Badge variant="destructive" className="text-xs">Expired</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{escrow.description}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isBuyer && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Shield className="h-3 w-3" /> You are the Buyer
                    </Badge>
                  )}
                  {isSeller && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Shield className="h-3 w-3" /> You are the Seller
                    </Badge>
                  )}
                  {isPending && !isExpired && blocksToExpiry > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {blocksToTime(blocksToExpiry)} remaining
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                  <AmountDisplay micro={escrow.amount} className="text-lg" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      navigator.clipboard.writeText(window.location.href).then(
                        () => toast.success('Link copied to clipboard'),
                        () => toast.error('Failed to copy link')
                      );
                    }} className="gap-2">
                      <Link className="h-3.5 w-3.5" /> Copy Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => generateEscrowReceipt(escrow, escrowEvents)} className="gap-2">
                      <Download className="h-3.5 w-3.5" /> Download Receipt
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Parties Card */}
      <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Parties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={`rounded-lg border p-3 ${isBuyer ? 'border-accent-warm/40 bg-accent-warm/5' : 'border-border'}`}>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Buyer {isBuyer && <span className="text-accent-warm font-medium">(you)</span>}
                </p>
                <AddressDisplay address={escrow.buyer} showExplorer />
              </div>
              <div className={`rounded-lg border p-3 ${isSeller ? 'border-accent-warm/40 bg-accent-warm/5' : 'border-border'}`}>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Seller {isSeller && <span className="text-accent-warm font-medium">(you)</span>}
                </p>
                <AddressDisplay address={escrow.seller} showExplorer />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Details Card */}
      <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between py-2.5 first:pt-0">
                <span className="text-xs text-muted-foreground">Created</span>
                <span className="font-mono text-xs text-foreground">Block {escrow.createdAt.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-muted-foreground">Expires</span>
                <span className="font-mono text-xs text-foreground">
                  Block {escrow.expiresAt.toLocaleString()}
                  {blocksToExpiry > 0 && ` (${blocksToTime(blocksToExpiry)})`}
                  {blocksToExpiry <= 0 && ' (Expired)'}
                </span>
              </div>
              {escrow.completedAt && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-xs text-muted-foreground">Completed</span>
                  <span className="font-mono text-xs text-foreground">Block {escrow.completedAt.toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-muted-foreground">Platform Fee</span>
                <AmountDisplay micro={escrow.feeAmount} showUsd={false} />
              </div>
              {(escrow.status === EscrowStatus.Released || escrow.status === EscrowStatus.Refunded) && escrow.txHash && (
                <div className="flex items-center justify-between py-2.5 last:pb-0">
                  <span className="text-xs text-muted-foreground">TX Hash</span>
                  <a
                    href={`https://explorer.stacks.co/txid/${escrow.txHash}?chain=testnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {escrow.txHash.slice(0, 12)}…{escrow.txHash.slice(-8)}
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Timeline */}
      <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {escrowEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events recorded.</p>
            ) : (
              <div className="relative space-y-0">
                {escrowEvents.map((event, i) => {
                  const cfg = EVENT_CONFIG[event.eventType] || { label: event.eventType, color: 'bg-muted-foreground', icon: Clock };
                  const Icon = cfg.icon;
                  const isLast = i === escrowEvents.length - 1;
                  return (
                    <motion.div
                      key={event.id}
                      custom={i}
                      variants={listItemVariants}
                      initial="hidden"
                      animate="visible"
                      className="flex gap-3 relative group"
                    >
                      <div className="flex flex-col items-center">
                        <div className={`h-7 w-7 rounded-full ${cfg.color} flex items-center justify-center shrink-0 z-10`}>
                          <Icon className="h-3.5 w-3.5 text-white" />
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-border min-h-[20px]" />}
                      </div>
                      <div className={`pb-5 ${isLast ? 'pb-0' : ''}`}>
                        <p className="text-sm font-medium">{cfg.label}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">Block {event.blockHeight.toLocaleString()}</span>
                          <span>·</span>
                          <span>{relativeTime(event.timestamp)}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Actions */}
      {isParty && (isPending || isDisputed) && !isPaused && (hasActions || confirmAction) && (
        <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isDisputed && escrow.disputedAt && (
                <DisputeTimeoutProgress disputedAt={escrow.disputedAt} />
              )}

              {confirmAction && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Confirm {confirmAction}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {confirmAction === 'release' && 'This will release funds to the seller. This action cannot be undone.'}
                        {confirmAction === 'refund' && 'This will return the escrowed funds to the buyer.'}
                        {confirmAction === 'dispute' && 'This will flag the escrow for admin review. A dispute timeout will begin.'}
                        {confirmAction === 'recover' && 'The dispute timeout has expired. You can recover your funds.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)} disabled={loading}>Cancel</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleAction(confirmAction)} disabled={loading}>
                      {loading ? 'Processing…' : 'Confirm'}
                    </Button>
                  </div>
                </div>
              )}

              {!confirmAction && (
                <div className="flex flex-wrap gap-2">
                  {isBuyer && (isPending || isExpired) && !isDisputed && (
                    <Button size="sm" onClick={() => setConfirmAction('release')} className="gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Release Payment
                    </Button>
                  )}
                  {isBuyer && isPending && !isExpired && (
                    <ExtendEscrowPanel escrowId={escrow.id} currentExpiresAt={escrow.expiresAt} />
                  )}
                  {isPending && !isExpired && (
                    <Button size="sm" variant="outline" onClick={() => setConfirmAction('dispute')} className="gap-1.5 text-destructive border-destructive/30">
                      <AlertTriangle className="h-3.5 w-3.5" /> Dispute
                    </Button>
                  )}
                  {isSeller && isPending && (
                    <Button size="sm" variant="outline" onClick={() => setConfirmAction('refund')} className="gap-1.5">
                      <XCircle className="h-3.5 w-3.5" /> Refund Buyer
                    </Button>
                  )}
                  {isBuyer && isPending && isExpired && (
                    <Button size="sm" variant="outline" onClick={() => setConfirmAction('refund')} className="gap-1.5">
                      <XCircle className="h-3.5 w-3.5" /> Claim Refund
                    </Button>
                  )}
                  {isBuyer && disputeTimedOut && (
                    <Button size="sm" onClick={() => setConfirmAction('recover')} className="gap-1.5">
                      <Shield className="h-3.5 w-3.5" /> Recover Funds
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
