import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';
import { useEscrow, useEscrowEvents } from '@/hooks/use-escrow';
import { useBlockHeight } from '@/hooks/use-block-height';
import { usePlatformConfig } from '@/hooks/use-admin';
import { DEFAULT_DISPUTE_TIMEOUT, DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';
import { EscrowStatus } from '@/lib/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { DisputeTimeoutProgress } from '@/components/shared/DisputeTimeoutProgress';
import { ExtendEscrowPanel } from '@/components/shared/ExtendEscrowPanel';
import { EscrowDetailSkeleton } from '@/components/shared/PageSkeletons';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { RestrictedEscrowView } from '@/components/shared/RestrictedEscrowView';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { releaseEscrow, refundEscrow, disputeEscrow, resolveExpiredDispute } from '@/lib/escrow-service';
import { blocksToTime, relativeTime, getExplorerUrl, truncateAddress } from '@/lib/utils';
import { useBlockRate } from '@/hooks/use-block-rate';
import { useAddressBook } from '@/hooks/use-address-book';
import { useSettings } from '@/hooks/use-settings';
import { getNotificationPermission, requestNotificationPermission } from '@/lib/notifications';
import { motion, AnimatePresence } from 'framer-motion';
import { cardVariants, listItemVariants, pageVariants, slideDown } from '@/lib/motion';
import {
  ArrowLeft, AlertTriangle, CheckCircle2, XCircle, Shield,
  Users, Info, Clock, Zap, PlusCircle, Timer, Share2, Link, Download,
  BookUser, Plus, ExternalLink, Bell, MessageSquare, Send
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { generateEscrowReceipt } from '@/lib/generate-receipt';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { PackageCheck } from 'lucide-react';
import { useDeliveries, useMarkDelivered } from '@/hooks/use-deliveries';
import { useMessages, useSendMessage } from '@/hooks/use-messages';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  useDisputeReason,
  useSubmitDisputeReason,
  DISPUTE_REASON_CATEGORIES,
  type DisputeReasonCategory,
} from '@/hooks/use-dispute-reason';

const EVENT_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  'escrow-created': { label: 'Created', color: 'bg-primary', icon: PlusCircle },
  'escrow-released': { label: 'Released', color: 'bg-status-released', icon: CheckCircle2 },
  'escrow-refunded': { label: 'Refunded', color: 'bg-status-refunded', icon: XCircle },
  'escrow-disputed': { label: 'Disputed', color: 'bg-status-disputed', icon: AlertTriangle },
  'escrow-extended': { label: 'Extended', color: 'bg-primary', icon: Timer },
  'dispute-resolved-for-buyer': { label: 'Dispute Resolved (Buyer)', color: 'bg-status-refunded', icon: Shield },
  'dispute-resolved-for-seller': { label: 'Dispute Resolved (Seller)', color: 'bg-status-released', icon: Shield },
  'dispute-expired-resolved': { label: 'Dispute Timeout Resolved', color: 'bg-status-refunded', icon: Clock },
};

export default function EscrowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { address, isAdmin } = useWallet();
  const escrowId = id && /^\d+$/.test(id) ? parseInt(id, 10) : NaN;
  const { data: escrow, isLoading, isError: escrowError } = useEscrow(isNaN(escrowId) ? 0 : escrowId);
  const { data: config, isError: configError } = usePlatformConfig();
  const { data: escrowEvents = [] } = useEscrowEvents(isNaN(escrowId) ? 0 : escrowId);
  const { data: currentBlock = 0 } = useBlockHeight();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const { findByAddress, add: addContact } = useAddressBook();
  const { settings, update: updateSettings } = useSettings();
  const [notifPerm, setNotifPerm] = useState(() => getNotificationPermission());
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [savingFor, setSavingFor] = useState<'buyer' | 'seller' | null>(null);
  const [contactName, setContactName] = useState('');
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const { data: deliveries = [] } = useDeliveries(isNaN(escrowId) ? 0 : escrowId);
  const markDelivered = useMarkDelivered();
  const submitDisputeReason = useSubmitDisputeReason();
  const { data: existingDisputeReason } = useDisputeReason(isNaN(escrowId) ? 0 : escrowId);
  const [disputeReason, setDisputeReason] = useState<DisputeReasonCategory | ''>('');
  const [disputeDetails, setDisputeDetails] = useState('');
  // Message thread between buyer and seller (independent of the on-chain
  // delivery signal; this is the conversational layer).
  const { data: messages = [] } = useMessages(
    escrow?.contractId ?? '',
    isNaN(escrowId) ? 0 : escrowId,
  );
  const sendMessage = useSendMessage();
  const [draftMessage, setDraftMessage] = useState('');

  // Live countdown: convert blocks-remaining to seconds, tick every second
  const blocksToExpiry = (escrow?.expiresAt ?? 0) - currentBlock;
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const calcSeconds = useCallback(() => {
    return Math.max(0, Math.round(blocksToExpiry * minutesPerBlock * 60));
  }, [blocksToExpiry, minutesPerBlock]);

  useEffect(() => {
    setRemainingSeconds(calcSeconds());
  }, [calcSeconds]);

  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCountdown = (totalSec: number): string => {
    if (totalSec <= 0) return 'Expired';
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  if (isLoading) return <EscrowDetailSkeleton />;

  if (isNaN(escrowId)) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <EmptyState
          icon={AlertTriangle}
          title="Invalid escrow ID"
          description="The URL does not contain a valid escrow ID."
          actionLabel="Back to Escrows"
          onAction={() => navigate('/escrows')}
        />
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <EmptyState
          icon={Info}
          title="Escrow not found"
          description="This escrow doesn’t exist or hasn’t been indexed yet."
          actionLabel="Back to Escrows"
          onAction={() => navigate('/escrows')}
        />
      </div>
    );
  }

  const isPaused = config?.isPaused ?? false;
  const disputeTimeout = config?.disputeTimeout ?? DEFAULT_DISPUTE_TIMEOUT;
  const isBuyer = escrow.buyer === address;
  const isSeller = escrow.seller === address;
  const isParty = isBuyer || isSeller;

  // Non-parties (and non-admins) get a restricted public-info view. The
  // contract data is on-chain so anyone could read it via the explorer, but
  // we don't surface off-chain context (description, dispute reasons,
  // delivery messages) or action buttons to drive-by URL probing.
  if (!isParty && !isAdmin) {
    return <RestrictedEscrowView escrow={escrow} />;
  }

  const isPending = escrow.status === EscrowStatus.Pending;
  const isDisputed = escrow.status === EscrowStatus.Disputed;
  const isExpired = escrow.expiresAt <= currentBlock;
  const disputeTimedOut = isDisputed && escrow.disputedAt
    ? (currentBlock - escrow.disputedAt) >= disputeTimeout
    : false;

  const hasActions = (
    (isBuyer && (isPending || isExpired) && !isDisputed) ||
    (isBuyer && isPending && !isExpired) ||
    (isPending && !isExpired) ||
    (isSeller && isPending) ||
    (isBuyer && isPending && isExpired) ||
    (isBuyer && disputeTimedOut) ||
    (isSeller && isPending && isExpired)
  );

  const sortedEvents = [...escrowEvents].sort((a, b) => b.blockHeight - a.blockHeight);
  const isSettled = escrow.status === EscrowStatus.Released || escrow.status === EscrowStatus.Refunded;

  const buyerContact = findByAddress(escrow.buyer);
  const sellerContact = findByAddress(escrow.seller);

  const blockToHumanTime = (block: number): string => {
    const diff = block - currentBlock;
    if (diff > 0) return `in ${blocksToTime(diff, minutesPerBlock)}`;
    if (diff < 0) return `${blocksToTime(-diff, minutesPerBlock)} ago`;
    return 'now';
  };

  const handleSaveContact = (role: 'buyer' | 'seller') => {
    const name = contactName.trim();
    if (!name) return;
    const addr = role === 'buyer' ? escrow.buyer : escrow.seller;
    addContact(name, addr);
    setSavingFor(null);
    setContactName('');
    toast.success('Contact saved');
  };

  const handleAction = async (action: string) => {
    setLoading(true);
    try {
      switch (action) {
        case 'release': await releaseEscrow(escrow.id, escrow.amount, escrow.feeAmount, escrow.tokenType); break;
        case 'refund': await refundEscrow(escrow.id, escrow.amount, escrow.feeAmount, escrow.tokenType); break;
        case 'dispute':
          await disputeEscrow(escrow.id);
          // Save reason off-chain — best-effort, don't block the UX on failure
          if (address && disputeReason) {
            submitDisputeReason.mutate(
              { escrowId: escrow.id, reasonCategory: disputeReason, details: disputeDetails, submittedBy: address },
              { onError: () => toast.warning('Dispute submitted, but reason could not be saved. Contact support if needed.') }
            );
          }
          setDisputeReason('');
          setDisputeDetails('');
          break;
        case 'recover': await resolveExpiredDispute(escrow.id, escrow.amount, escrow.feeAmount, escrow.tokenType); break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('reject') || msg.includes('denied') || msg.includes('cancel') || msg.includes('dismiss')) {
        toast.error('Transaction cancelled', { description: 'You declined the wallet prompt.' });
      } else if (msg.includes('insufficient') || msg.includes('balance')) {
        toast.error('Insufficient balance', { description: 'Not enough funds to complete this action.' });
      } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
        toast.error('Network error', { description: 'Could not reach the Stacks network. Try again.' });
      } else {
        toast.error('Action failed', { description: 'The transaction could not be submitted. Please try again.' });
      }
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const handleDownloadReceipt = async () => {
    setReceiptLoading(true);
    try {
      await generateEscrowReceipt(escrow, escrowEvents, { currentBlock, minutesPerBlock });
      toast.success('Receipt downloaded');
    } catch {
      toast.error('Failed to generate receipt. Please try again.');
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleMarkDelivered = async () => {
    try {
      await markDelivered.mutateAsync({
        escrowId: escrow.id,
        sellerAddress: escrow.seller,
        buyerAddress: escrow.buyer,
        message: deliveryMessage,
      });
      setDeliveryMessage('');
      toast.success('Marked as delivered', {
        description: 'The buyer has been notified and can now review and release payment.',
      });
    } catch {
      toast.error('Failed to send delivery signal', {
        description: 'Please try again.',
      });
    }
  };

  const handleSendMessage = async () => {
    const trimmed = draftMessage.trim();
    if (!trimmed || !address || !isParty) return;
    try {
      await sendMessage.mutateAsync({
        contractId: escrow.contractId,
        escrowId: escrow.id,
        senderAddress: address,
        senderRole: isBuyer ? 'buyer' : 'seller',
        message: trimmed,
      });
      setDraftMessage('');
    } catch (err) {
      toast.error('Failed to send message', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  };

  const handleEnableDeliveryNotifs = async () => {
    const result = await requestNotificationPermission();
    setNotifPerm(result);
    if (result === 'granted') {
      updateSettings('notifyDeliveries', true);
      toast.success('Delivery notifications enabled');
    } else {
      toast.error('Notifications blocked', { description: 'Enable notifications for this site in your browser settings.' });
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-8">
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
        <Card className="shadow-glow-sm relative">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="absolute top-3 right-3 h-10 w-10 shrink-0" aria-label="Share escrow">
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
              <DropdownMenuItem onClick={handleDownloadReceipt} className="gap-2" disabled={receiptLoading}>
                <Download className="h-3.5 w-3.5" /> {isSettled ? 'Download Receipt' : 'Download Summary'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <CardContent className="p-5 sm:p-6 pr-14 sm:pr-16 space-y-4">
            {/* Row 1: ID + Amount (primary info) */}
            <div className="flex items-start justify-between gap-4">
              <span className="text-2xl font-bold font-mono text-foreground tracking-tight">#{escrow.id}</span>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                <AmountDisplay micro={escrow.amount} tokenType={escrow.tokenType} className="text-lg" />
              </div>
            </div>

            {/* Row 2: Status + badges */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={escrow.status} />
              {(() => {
                const txBlock =
                  escrow.status === EscrowStatus.Released || escrow.status === EscrowStatus.Refunded
                    ? escrow.completedAt
                    : escrow.status === EscrowStatus.Disputed
                      ? escrow.disputedAt
                      : escrow.createdAt;
                if (!txBlock) return null;
                return (
                  <span className="text-xs text-muted-foreground">{blockToHumanTime(txBlock)}</span>
                );
              })()}
              {isExpired && isPending && (
                <Badge variant="destructive" className="text-xs">Expired</Badge>
              )}
              {isBuyer && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Shield className="h-3 w-3" /> You: Buyer
                </Badge>
              )}
              {isSeller && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Shield className="h-3 w-3" /> You: Seller
                </Badge>
              )}
              {isPending && !isExpired && blocksToExpiry > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatCountdown(remainingSeconds)} remaining
                </span>
              )}
            </div>

            {/* Row 3: Description */}
            {escrow.description && (
              <p className="text-sm text-muted-foreground">{escrow.description}</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Parties Card */}
      <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Parties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={`rounded-lg border p-3 ${isBuyer ? 'border-accent-warm/40 bg-accent-warm/5' : 'border-border'}`}>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Buyer {isBuyer && <span className="text-primary font-medium">(you)</span>}
                </p>
                {buyerContact && (
                  <p className="text-sm font-medium text-foreground mb-1">{buyerContact.name}</p>
                )}
                <AddressDisplay address={escrow.buyer} showExplorer />
                {!isBuyer && !buyerContact && (
                  <SaveContactInline
                    role="buyer"
                    address={escrow.buyer}
                    isOpen={savingFor === 'buyer'}
                    onOpen={() => { setSavingFor('buyer'); setContactName(''); }}
                    onCancel={() => setSavingFor(null)}
                    onSave={() => handleSaveContact('buyer')}
                    name={contactName}
                    onNameChange={setContactName}
                  />
                )}
              </div>
              <div className={`rounded-lg border p-3 ${isSeller ? 'border-accent-warm/40 bg-accent-warm/5' : 'border-border'}`}>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Seller {isSeller && <span className="text-primary font-medium">(you)</span>}
                </p>
                {sellerContact && (
                  <p className="text-sm font-medium text-foreground mb-1">{sellerContact.name}</p>
                )}
                <AddressDisplay address={escrow.seller} showExplorer />
                {!isSeller && !sellerContact && (
                  <SaveContactInline
                    role="seller"
                    address={escrow.seller}
                    isOpen={savingFor === 'seller'}
                    onOpen={() => { setSavingFor('seller'); setContactName(''); }}
                    onCancel={() => setSavingFor(null)}
                    onSave={() => handleSaveContact('seller')}
                    name={contactName}
                    onNameChange={setContactName}
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Details Card */}
      <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <span className="text-xs text-muted-foreground shrink-0">Created</span>
                <span className="font-mono text-xs text-foreground text-right">
                  Block {escrow.createdAt.toLocaleString()}
                  <span className="text-muted-foreground"> · {blockToHumanTime(escrow.createdAt)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-xs text-muted-foreground shrink-0">Expires</span>
                <span className="font-mono text-xs text-foreground text-right">
                  Block {escrow.expiresAt.toLocaleString()}
                  <span className="text-muted-foreground"> · {blockToHumanTime(escrow.expiresAt)}</span>
                  {blocksToExpiry <= 0 && <span className="text-destructive"> (Expired)</span>}
                </span>
              </div>
              {escrow.completedAt && (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-xs text-muted-foreground shrink-0">Completed</span>
                  <span className="font-mono text-xs text-foreground text-right">
                    Block {escrow.completedAt.toLocaleString()}
                    <span className="text-muted-foreground"> · {blockToHumanTime(escrow.completedAt)}</span>
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-muted-foreground">Platform Fee</span>
                <AmountDisplay micro={escrow.feeAmount} tokenType={escrow.tokenType} showUsd={false} />
              </div>
              {(escrow.status === EscrowStatus.Released || escrow.status === EscrowStatus.Refunded) && escrow.txHash && (
                <div className="flex items-center justify-between gap-3 py-2.5 last:pb-0">
                  <span className="text-xs text-muted-foreground shrink-0">Transaction</span>
                  <a
                    href={getExplorerUrl('tx', escrow.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1.5"
                    aria-label="View transaction on Stacks Explorer"
                  >
                    {escrow.txHash.slice(0, 12)}…{escrow.txHash.slice(-8)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Delivery Card — visible to seller (mark as done) and buyer (view signals or enable notifs) */}
      {isSupabaseConfigured && isPending && (isSeller || isBuyer) && (isSeller || deliveries.length > 0 || notifPerm === 'default') && (
        <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
          <Card className="border-l-4 border-l-primary/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-muted-foreground" />
                Delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deliveries.length > 0 && (
                <div className="space-y-2">
                  {deliveries.map((d) => (
                    <div key={d.id} className="rounded-md bg-muted/40 px-3 py-2 text-sm space-y-0.5">
                      <p className="text-xs font-medium text-foreground">
                        Seller marked as delivered
                        <span className="text-muted-foreground font-normal"> · {relativeTime(d.createdAt)}</span>
                      </p>
                      {d.message && (
                        <p className="text-xs text-muted-foreground italic">"{d.message}"</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isSeller && (
                <div className="space-y-2">
                  {deliveries.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Let the buyer know you've completed the work. This sends them a browser notification.
                    </p>
                  )}
                  <Textarea
                    placeholder="Optional note to buyer (e.g. 'Delivered to your email')"
                    value={deliveryMessage}
                    onChange={(e) => setDeliveryMessage(e.target.value)}
                    maxLength={500}
                    rows={2}
                    className="text-sm resize-none"
                  />
                  <Button
                    size="sm"
                    onClick={handleMarkDelivered}
                    disabled={markDelivered.isPending}
                    className="gap-1.5"
                  >
                    <PackageCheck className="h-3.5 w-3.5" />
                    {markDelivered.isPending ? 'Sending…' : 'Mark as Delivered'}
                  </Button>
                </div>
              )}
              {/* Contextual notification nudge — buyer only, only when permission hasn't been asked */}
              {isBuyer && notifPerm === 'default' && !nudgeDismissed && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Bell className="h-3.5 w-3.5 text-primary shrink-0" />
                    <p className="text-xs text-foreground">Get notified instantly when the seller delivers</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={handleEnableDeliveryNotifs}>
                      Enable
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground" onClick={() => setNudgeDismissed(true)}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Message thread — bidirectional chat between buyer and seller.
          Always available to parties (any escrow state), so post-completion
          context conversations still have a home. */}
      {isSupabaseConfigured && isParty && (
        <motion.div custom={3.5} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                Messages
                {messages.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    · {messages.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {messages.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Start the conversation. Both parties can post here — useful for clarifying
                  delivery details or resolving questions before raising a dispute.
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {messages.map((m) => {
                    const mine = m.senderAddress === address;
                    return (
                      <div
                        key={m.id}
                        className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                            mine
                              ? 'bg-primary/10 text-foreground'
                              : 'bg-muted/40 text-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {m.senderRole}
                              {mine && ' (you)'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              · {relativeTime(m.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex items-end gap-2 pt-1">
                <Textarea
                  placeholder={`Message the ${isBuyer ? 'seller' : 'buyer'}…`}
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  onKeyDown={(e) => {
                    // Cmd/Ctrl + Enter to send
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  maxLength={2000}
                  rows={2}
                  className="text-sm resize-none flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={sendMessage.isPending || !draftMessage.trim()}
                  className="gap-1.5 shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendMessage.isPending ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Settled callout — primary "Download Receipt" affordance for completed escrows */}
      {isSettled && (
        <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
          <Card className="border-l-4 border-l-success">
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-success/10 p-2 shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {escrow.status === EscrowStatus.Released ? 'Escrow released' : 'Escrow refunded'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {escrow.status === EscrowStatus.Released ? 'Funds have been successfully released to the seller.' : 'Funds have been successfully returned to the buyer.'}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadReceipt}
                disabled={receiptLoading}
                className="gap-1.5 shrink-0 self-start sm:self-auto"
              >
                <Download className="h-3.5 w-3.5" /> {receiptLoading ? 'Generating…' : 'Download Receipt'}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Timeline */}
      <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sortedEvents.length === 0 && deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events recorded.</p>
            ) : (() => {
              // Merge on-chain events and off-chain delivery signals, sorted newest-first
              type TLItem =
                | { kind: 'event'; data: typeof sortedEvents[0] }
                | { kind: 'delivery'; data: typeof deliveries[0] };
              const merged: TLItem[] = [
                ...sortedEvents.map((e) => ({ kind: 'event' as const, data: e })),
                ...deliveries.map((d) => ({ kind: 'delivery' as const, data: d })),
              ].sort((a, b) => {
                const tA = a.kind === 'event' ? a.data.timestamp : a.data.createdAt;
                const tB = b.kind === 'event' ? b.data.timestamp : b.data.createdAt;
                return tB.localeCompare(tA);
              });
              return (
                <div className="relative space-y-0">
                  {merged.map((item, i) => {
                    const isLast = i === merged.length - 1;
                    if (item.kind === 'delivery') {
                      const d = item.data;
                      return (
                        <motion.div
                          key={`delivery-${d.id}`}
                          custom={i}
                          variants={listItemVariants}
                          initial="hidden"
                          animate="visible"
                          className="flex gap-3 relative group"
                        >
                          <div className="flex flex-col items-center">
                            <div className="h-7 w-7 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center shrink-0 z-10">
                              <PackageCheck className="h-3.5 w-3.5 text-primary" />
                            </div>
                            {!isLast && <div className="w-px flex-1 bg-border min-h-[20px]" />}
                          </div>
                          <div className={`pb-5 ${isLast ? 'pb-0' : ''}`}>
                            <p className="text-sm font-medium">
                              Work marked as delivered
                              <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 font-normal">Off-chain</Badge>
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{relativeTime(d.createdAt)}</span>
                            </div>
                            {d.message && (
                              <p className="mt-1 text-xs text-muted-foreground italic">"{d.message}"</p>
                            )}
                          </div>
                        </motion.div>
                      );
                    }
                    const event = item.data;
                    const cfg = EVENT_CONFIG[event.eventType] || { label: event.eventType, color: 'bg-muted-foreground', icon: Clock };
                    const Icon = cfg.icon;
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
                            <span className="font-mono">Block {event.blockHeight}</span>
                            <span>·</span>
                            <span>{relativeTime(event.timestamp)}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </motion.div>

      {/* Actions */}
      {isParty && (isPending || isDisputed) && !isPaused && (hasActions || confirmAction) && (
        <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible">
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

              {isDisputed && existingDisputeReason && (
                <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-foreground">Dispute reason: {existingDisputeReason.reasonLabel}</p>
                  {existingDisputeReason.details && (
                    <p className="text-xs text-muted-foreground italic">"{existingDisputeReason.details}"</p>
                  )}
                </div>
              )}

              <AnimatePresence>
              {confirmAction && (
                <motion.div variants={slideDown} initial="initial" animate="animate" exit="exit" className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-3">
                  {confirmAction === 'dispute' ? (
                    <>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Raise a Dispute</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Select a reason so the admin can resolve this efficiently. A dispute timeout will begin.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-foreground">
                          Reason <span className="text-destructive">*</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {DISPUTE_REASON_CATEGORIES.map((cat) => (
                            <button
                              key={cat.value}
                              type="button"
                              onClick={() => setDisputeReason(cat.value)}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                disputeReason === cat.value
                                  ? 'bg-destructive text-destructive-foreground border-destructive'
                                  : 'border-border bg-background text-foreground hover:border-destructive/50'
                              }`}
                            >
                              {cat.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-foreground">
                          Additional details <span className="text-muted-foreground font-normal">(optional)</span>
                        </p>
                        <Textarea
                          placeholder="Describe the issue in more detail…"
                          value={disputeDetails}
                          onChange={(e) => setDisputeDetails(e.target.value)}
                          maxLength={1000}
                          rows={3}
                          className="text-sm resize-none"
                        />
                        {disputeDetails.length > 800 && (
                          <p className="text-xs text-muted-foreground text-right">{disputeDetails.length}/1000</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => { setConfirmAction(null); setDisputeReason(''); setDisputeDetails(''); }}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm" variant="destructive"
                          onClick={() => handleAction('dispute')}
                          disabled={loading || !disputeReason}
                        >
                          {loading ? 'Submitting…' : 'Submit Dispute'}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Confirm {confirmAction}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {confirmAction === 'release' && 'This will release funds to the seller. This action cannot be undone.'}
                            {confirmAction === 'refund' && 'This will return the escrowed funds to the buyer.'}
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
                    </>
                  )}
                </motion.div>
              )}
              </AnimatePresence>

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
                  {isSeller && isPending && isExpired && (
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

interface SaveContactInlineProps {
  role: 'buyer' | 'seller';
  address: string;
  isOpen: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSave: () => void;
  name: string;
  onNameChange: (value: string) => void;
}

function SaveContactInline({ role, address, isOpen, onOpen, onCancel, onSave, name, onNameChange }: SaveContactInlineProps) {
  if (isOpen) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-[11px] text-muted-foreground font-mono truncate">{truncateAddress(address, 8)}</p>
        <div className="flex gap-2">
          <label htmlFor={`contact-name-${role}`} className="sr-only">Name for {role}</label>
          <Input
            id={`contact-name-${role}`}
            placeholder={`Name this ${role}`}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="text-xs h-8"
            maxLength={64}
            autoFocus
          />
          <Button size="sm" onClick={onSave} disabled={!name.trim()} className="gap-1.5 h-8 shrink-0">
            <BookUser className="h-3 w-3" /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 shrink-0">
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onOpen}
      className="mt-2 h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5 -ml-2"
    >
      <Plus className="h-3 w-3" /> Save to contacts
    </Button>
  );
}
