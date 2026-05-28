import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';
import { useEscrow, useEscrowEvents } from '@/hooks/use-escrow';
import { useBlockHeight } from '@/hooks/use-block-height';
import { usePlatformConfig } from '@/hooks/use-admin';
import { CONTRACT_PRINCIPAL, DEFAULT_DISPUTE_TIMEOUT, DEFAULT_MINUTES_PER_BLOCK, supportsOnChainDelivery } from '@/lib/stacks-config';
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
import { releaseEscrow, refundEscrow, disputeEscrow, resolveExpiredDispute, resolveExpiredDisputeForSeller, deliverEscrow } from '@/lib/escrow-service';
import { useSellerRescueEligible } from '@/hooks/use-seller-rescue-eligible';
import { blocksToTime, relativeTime, getExplorerUrl, truncateAddress } from '@/lib/utils';
import { useBlockRate } from '@/hooks/use-block-rate';
import { useAddressBook } from '@/hooks/use-address-book';
import { useSettings } from '@/hooks/use-settings';
import { getNotificationPermission, requestNotificationPermission } from '@/lib/notifications';
import { motion, AnimatePresence } from 'framer-motion';
import { cardVariants, listItemVariants, pageVariants, slideDown } from '@/lib/motion';
import {
  ArrowLeft, AlertTriangle, AlertCircle, CheckCircle2, XCircle, Shield,
  Users, Info, Clock, Zap, PlusCircle, Timer, Share2, Link, Download,
  BookUser, Plus, ExternalLink, Bell, MessageSquare, Send, LogIn
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { generateEscrowReceipt } from '@/lib/generate-receipt';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { PackageCheck } from 'lucide-react';
import { useDeliveries, useMarkDelivered } from '@/hooks/use-deliveries';
import { useMessages, useSendMessage } from '@/hooks/use-messages';
import { useWalletAuth } from '@/contexts/WalletAuthContext';
import { usePendingAction, useReconcilePendingAction } from '@/hooks/use-pending-actions';
import { setPendingAction, ACTION_LABEL, type ActionType } from '@/lib/pending-actions';
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
  // Pass the escrow's own contract_id so legacy escrows show their events.
  // `escrow` is undefined on first render — hooks fall back to the active
  // contract for that pass, then re-fire once the escrow loads with its real
  // contract_id (React Query handles this cleanly via the queryKey).
  const escrowContractId = escrow?.contractId;
  const { data: escrowEvents = [] } = useEscrowEvents(
    isNaN(escrowId) ? 0 : escrowId,
    escrowContractId,
  );
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
  const { data: deliveries = [] } = useDeliveries(
    isNaN(escrowId) ? 0 : escrowId,
    escrowContractId,
  );
  const markDelivered = useMarkDelivered();
  const submitDisputeReason = useSubmitDisputeReason();
  const { data: existingDisputeReason } = useDisputeReason(
    isNaN(escrowId) ? 0 : escrowId,
    escrowContractId,
  );
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
  const { isAuthenticated, isSigningIn, signIn } = useWalletAuth();

  // Optimistic action overlay: shows "Releasing…" / "Refunding…" / etc. as
  // soon as the wallet returns a txid, before the chainhook indexes the
  // resulting on-chain event. Reconciles automatically when the indexed
  // status matches the action's expected outcome.
  const pendingAction = usePendingAction(escrow?.contractId, isNaN(escrowId) ? 0 : escrowId);
  useReconcilePendingAction(escrow?.contractId, escrow?.id ?? 0, escrow?.status);

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

  // Display precision intentionally degrades with distance from expiry.
  // Block-rate is an estimate — showing "27d 14h 22m 8s" implies certainty
  // we don't have, and ticking sub-minute values is visual noise when the
  // window is days wide. Tight, honest format:
  //   ≥7d      → "~Nd"
  //   1d–7d    → "Nd Nh"
  //   1h–24h   → "Nh Nm"
  //   < 1h     → "Nm Ns" (live ticking matters here)
  const formatCountdown = (totalSec: number): string => {
    if (totalSec <= 0) return 'Expired';
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (d >= 7) return `~${d}d`;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
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
  // v3+ beneficiary has buyer-equivalent rights on-chain. We treat them the
  // same as the buyer for UI gating so the same buttons appear for both.
  const isPrimaryBuyer = escrow.buyer === address;
  const isBeneficiary = !!escrow.beneficiary && escrow.beneficiary === address;
  const isBuyer = isPrimaryBuyer || isBeneficiary;
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
  const isDelivered = escrow.status === EscrowStatus.Delivered;
  // "Active" = the escrow is in-flight on-chain (funds still locked, parties
  // can still act). v7 adds DELIVERED as a second in-flight state: the seller
  // has signaled delivery, the review window is running, but the buyer hasn't
  // released or disputed yet. All buttons that gated on `isPending` should
  // really gate on `isActive` — otherwise the action card vanishes the
  // moment the seller marks delivered.
  const isActive = isPending || isDelivered;
  const isDisputed = escrow.status === EscrowStatus.Disputed;
  const isExpired = escrow.expiresAt <= currentBlock;
  const disputeTimedOut = isDisputed && escrow.disputedAt
    ? (currentBlock - escrow.disputedAt) >= disputeTimeout
    : false;

  // v3+ seller self-rescue. The contract enforces the full eligibility
  // (delivered AND status=disputed AND past 2x dispute-timeout). We rely on
  // the read-only `is-seller-rescue-eligible` to avoid duplicating the math
  // client-side; the contract is the source of truth. Returns false on
  // non-v3 contracts so legacy escrows naturally hide the button.
  const sellerRescueEligible =
    useSellerRescueEligible(escrow?.contractId, escrow?.id).data === true;

  // True when this escrow lives on a contract version other than the one the
  // SDK / wallet is configured for. We can still READ its state, but every
  // write helper in escrow-service.ts dispatches to CONTRACT_PRINCIPAL, so
  // signing a release/refund/dispute here would target the wrong contract
  // and fail. Disable actions and surface a clear banner instead.
  const isLegacyContract =
    !!escrow.contractId && escrow.contractId !== CONTRACT_PRINCIPAL;
  const legacyContractName = isLegacyContract
    ? escrow.contractId.split('.')[1] ?? escrow.contractId
    : null;

  // When an optimistic action is in flight, hide the action UI entirely —
  // we don't want users double-submitting Release / Refund / etc. while the
  // chain catches up. The pending banner shows what's in progress instead.
  const hasActions = !pendingAction && (
    (isBuyer && (isActive || isExpired) && !isDisputed) ||
    (isBuyer && isActive && !isExpired) ||
    (isActive && !isExpired) ||
    (isSeller && isActive) ||
    (isBuyer && isActive && isExpired) ||
    (isBuyer && disputeTimedOut) ||
    (isSeller && isActive && isExpired) ||
    (isSeller && sellerRescueEligible)
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
      // Each action helper returns the wallet's txid. We capture it so we
      // can record an optimistic "pending action" overlay for the escrow,
      // which surfaces a "Releasing…" / "Refunding…" / etc. banner until
      // the indexer catches up (typically 30s–3min). Without this the UI
      // looks frozen for the full chain-confirmation window.
      let txId: string | null = null;
      let actionType: ActionType | null = null;
      switch (action) {
        case 'release':
          txId = await releaseEscrow(escrow.contractId, escrow.id, escrow.amount, escrow.feeAmount, escrow.tokenType);
          actionType = 'release';
          break;
        case 'refund':
          txId = await refundEscrow(escrow.contractId, escrow.id, escrow.amount, escrow.feeAmount, escrow.tokenType);
          actionType = 'refund';
          break;
        case 'dispute':
          txId = await disputeEscrow(escrow.contractId, escrow.id);
          actionType = 'dispute';
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
        case 'recover':
          txId = await resolveExpiredDispute(escrow.contractId, escrow.id, escrow.amount, escrow.feeAmount, escrow.tokenType);
          actionType = 'resolve-expired';
          break;
        case 'seller-rescue':
          // v3+ only: seller claims funds for delivered work after 2x dispute-timeout
          txId = await resolveExpiredDisputeForSeller(escrow.contractId, escrow.id, escrow.amount, escrow.feeAmount, escrow.tokenType);
          actionType = 'release';
          break;
      }

      if (txId && actionType) {
        setPendingAction({
          contractId: escrow.contractId,
          escrowId: escrow.id,
          type: actionType,
          txId,
          submittedAt: new Date().toISOString(),
        });
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
    const hasOnChainDelivery = supportsOnChainDelivery(escrow.contractId);
    try {
      // v7+: trigger the on-chain delivery signal first. This is what actually
      // protects the seller from the Golden Rule attack — it flips the escrow
      // into STATUS_DELIVERED and starts the review window. The off-chain
      // message is just the human-readable context attached to that event.
      //
      // Legacy contracts (v6 / escrow-mainnet) don't expose `deliver()`, so we
      // fall through to the off-chain marker only — same behavior as before.
      if (hasOnChainDelivery) {
        const txId = await deliverEscrow(escrow.contractId, escrow.id);
        // Optimistic overlay so the UI doesn't look frozen during chain
        // confirmation; reconciled when the indexed status becomes DELIVERED.
        setPendingAction({
          contractId: escrow.contractId,
          escrowId: escrow.id,
          type: 'deliver',
          txId,
          submittedAt: new Date().toISOString(),
        });
      }

      await markDelivered.mutateAsync({
        contractId: escrow.contractId,
        escrowId: escrow.id,
        sellerAddress: escrow.seller,
        buyerAddress: escrow.buyer,
        message: deliveryMessage,
      });
      setDeliveryMessage('');
      toast.success(
        hasOnChainDelivery ? 'Delivery signaled on-chain' : 'Marked as delivered',
        {
          description: hasOnChainDelivery
            ? 'Review window started. Funds stay locked until the buyer releases or you raise a dispute.'
            : 'The buyer has been notified and can now review and release payment.',
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('reject') || msg.includes('cancel') || msg.includes('denied')) {
        toast.error('Cancelled', {
          description: 'You declined the wallet prompt — no on-chain or off-chain change was made.',
        });
        return;
      }
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

      {isLegacyContract && (
        <div className="rounded-lg border border-muted bg-muted/30 p-3 flex items-start gap-2 text-sm">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
          <div className="space-y-1 flex-1">
            <p className="font-medium text-foreground">
              Acting on legacy contract
            </p>
            <p className="text-xs text-muted-foreground">
              This escrow lives on <span className="font-mono">{legacyContractName}</span>,
              an older contract version. Any actions on this page (release,
              refund, dispute) are signed against <span className="font-mono">{legacyContractName}</span> directly,
              not the currently active contract. Funds remain governed by the
              contract this escrow was created under.
            </p>
            <a
              // Hiro Explorer resolves a fully-qualified contract id under the
              // /txid/ path, same way the README links do.
              href={getExplorerUrl('tx', escrow.contractId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View contract on explorer
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      {pendingAction && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2 text-sm">
          <span className="relative flex h-2 w-2 mt-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <div className="space-y-1 flex-1 min-w-0">
            <p className="font-medium text-foreground">
              {ACTION_LABEL[pendingAction.type]}…
            </p>
            <p className="text-xs text-muted-foreground">
              Your transaction is confirming on Stacks. This usually takes 30s–3min. The
              status will update automatically once the chain confirms — no need to refresh.
            </p>
            <a
              href={getExplorerUrl('tx', pendingAction.txId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono"
            >
              {pendingAction.txId.slice(0, 10)}…{pendingAction.txId.slice(-6)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
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
              {isExpired && isActive && (
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
              {isActive && !isExpired && blocksToExpiry > 0 && (
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

            {escrow.beneficiary && (
              <div className="rounded-lg border border-border p-3 mt-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Beneficiary
                  {address === escrow.beneficiary && <span className="text-primary font-medium">(you)</span>}
                  <span className="text-[10px] text-muted-foreground/70 ml-1">
                    · co-buyer with full release/refund/dispute rights
                  </span>
                </p>
                <AddressDisplay address={escrow.beneficiary} showExplorer />
              </div>
            )}
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

      {/* Delivery Card — visible to seller (mark as done) and buyer (view signals or enable notifs).
          Stays visible after delivery so the recorded delivery message is still readable;
          the "Mark as Delivered" CTA inside hides itself once already delivered. */}
      {isSupabaseConfigured && isActive && (isSeller || isBuyer) && (isSeller || deliveries.length > 0 || notifPerm === 'default') && (
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
              {/* Mark-as-Delivered CTA — only available before the seller has
                  signaled delivery. Once status flips to DELIVERED (v7+), the
                  signal already lives on-chain and re-pressing would be a no-op. */}
              {isSeller && isPending && (
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
              {/* Post-delivery state — confirm the on-chain signal landed and
                  surface what the buyer should do next. */}
              {isDelivered && (
                <div className="rounded-md bg-status-delivered/10 border border-status-delivered/20 px-3 py-2 text-xs">
                  <p className="font-medium text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-delivered" />
                    Delivery signaled on-chain
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {isBuyer
                      ? 'The seller has marked this delivered. Review and release the payment, or raise a dispute if something is wrong.'
                      : 'Waiting for the buyer to release. If they go silent, you can raise a dispute to involve the arbiter.'}
                  </p>
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
              {/* Mirror of the description disclosure on CreateEscrow. Messages
                  live off-chain in Supabase but are readable by anyone with
                  the public anon key, so users should self-censor sensitive
                  info the same way they would on-chain. */}
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2 text-[11px] text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                <span>
                  Messages here are visible to anyone reading the platform.
                  Avoid personal info, contact details, or anything sensitive
                  beyond what's needed to resolve this deal.
                </span>
              </div>
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
              {/* Reading messages is anon-readable, so we always render them
                  above. Posting requires a signed-in session because RLS on
                  INSERT verifies the sender_address against the JWT claim.
                  The CTA below distinguishes:
                    - authed:      show the input + send button
                    - not authed:  show "Sign in to reply" — softer copy when
                                   messages already exist (the user can see
                                   what's there and decide to engage). */}
              {isAuthenticated ? (
                <div className="flex items-end gap-2 pt-1">
                  <Textarea
                    placeholder={`Message the ${isBuyer ? 'seller' : 'buyer'}…`}
                    value={draftMessage}
                    onChange={(e) => setDraftMessage(e.target.value)}
                    onKeyDown={(e) => {
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
              ) : (
                <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <LogIn className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {messages.length > 0
                          ? 'Sign in to reply'
                          : 'Sign in to send a message'}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        One-time wallet signature. Proves you own this address
                        so the other party knows it's really you. No gas, no
                        on-chain tx.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => signIn()}
                    disabled={isSigningIn}
                    className="gap-1.5 shrink-0"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    {isSigningIn ? 'Signing…' : 'Sign in'}
                  </Button>
                </div>
              )}
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
      {isParty && (isActive || isDisputed) && !isPaused && (hasActions || confirmAction) && (
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
                            {confirmAction === 'seller-rescue' && 'The admin did not resolve this delivered dispute in time. You can claim the funds for the work you delivered.'}
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
                  {isBuyer && (isActive || isExpired) && !isDisputed && (
                    <Button size="sm" onClick={() => setConfirmAction('release')} className="gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Release Payment
                    </Button>
                  )}
                  {/* Extend only makes sense before delivery — once delivered,
                      the escrow is on a different timeline (review window). */}
                  {isBuyer && isPending && !isExpired && (
                    <ExtendEscrowPanel
                      contractId={escrow.contractId}
                      escrowId={escrow.id}
                      currentExpiresAt={escrow.expiresAt}
                    />
                  )}
                  {isActive && !isExpired && (
                    <Button size="sm" variant="outline" onClick={() => setConfirmAction('dispute')} className="gap-1.5 text-destructive border-destructive/30">
                      <AlertTriangle className="h-3.5 w-3.5" /> Dispute
                    </Button>
                  )}
                  {isSeller && isActive && isExpired && (
                    <Button size="sm" variant="outline" onClick={() => setConfirmAction('dispute')} className="gap-1.5 text-destructive border-destructive/30">
                      <AlertTriangle className="h-3.5 w-3.5" /> Dispute
                    </Button>
                  )}
                  {isSeller && isActive && (
                    <Button size="sm" variant="outline" onClick={() => setConfirmAction('refund')} className="gap-1.5">
                      <XCircle className="h-3.5 w-3.5" /> Refund Buyer
                    </Button>
                  )}
                  {isBuyer && isActive && isExpired && (
                    <Button size="sm" variant="outline" onClick={() => setConfirmAction('refund')} className="gap-1.5">
                      <XCircle className="h-3.5 w-3.5" /> Claim Refund
                    </Button>
                  )}
                  {isBuyer && disputeTimedOut && (
                    <Button size="sm" onClick={() => setConfirmAction('recover')} className="gap-1.5">
                      <Shield className="h-3.5 w-3.5" /> Recover Funds
                    </Button>
                  )}
                  {isSeller && sellerRescueEligible && (
                    <Button size="sm" onClick={() => setConfirmAction('seller-rescue')} className="gap-1.5">
                      <Shield className="h-3.5 w-3.5" /> Claim Delivered Funds
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
