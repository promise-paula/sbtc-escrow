import { useState } from "react";
import { useDocumentHead } from "@/hooks/use-document-head";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { staggerContainer, staggerChild } from "@/lib/animations";
import { StatusBadge, RoleBadge } from "@/components/escrow/StatusBadge";
import { AddressDisplay } from "@/components/escrow/AddressDisplay";
import { AmountDisplay } from "@/components/escrow/AmountDisplay";
import { GlassCard } from "@/components/escrow/GlassCard";
import { ConfirmationModal } from "@/components/modals/Modals";
import { LoadingState } from "@/components/states/EmptyAndLoading";
import { useEscrow, useReleaseEscrow, useRefundEscrow, useDisputeEscrow, useBlockHeight, useUserRole } from "@/hooks/use-escrow";
import { useWallet } from "@/contexts/WalletContext";
import { EscrowStatus, microStxToStx, truncateAddress } from "@/lib/stacks-config";
import { getBlockTimeRemaining } from "@/lib/types";
import { ArrowLeft, Clock, ExternalLink, CheckCircle2, AlertTriangle, RotateCcw, FileText, Zap, Shield, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

const getStatusLabel = (status: EscrowStatus): string => {
  switch (status) {
    case EscrowStatus.PENDING: return 'Pending';
    case EscrowStatus.RELEASED: return 'Released';
    case EscrowStatus.REFUNDED: return 'Refunded';
    case EscrowStatus.DISPUTED: return 'Disputed';
    default: return 'Unknown';
  }
};

export default function EscrowDetail() {
  const { id } = useParams<{ id: string }>();
  const escrowId = id ? parseInt(id, 10) : undefined;
  const { data: escrow, isLoading, error } = useEscrow(escrowId);
  const { data: currentBlock = 0 } = useBlockHeight();
  const { address } = useWallet();
  
  const releaseMutation = useReleaseEscrow();
  const refundMutation = useRefundEscrow();
  const disputeMutation = useDisputeEscrow();
  
  const [modal, setModal] = useState<"release" | "dispute" | "refund" | null>(null);
  
  const userRole = escrow && address 
    ? (escrow.buyer === address ? 'buyer' : escrow.seller === address ? 'seller' : 'observer')
    : 'observer';
  
  useDocumentHead({ 
    title: escrow ? `Escrow #${escrowId} | sBTC Escrow` : "Escrow Not Found | sBTC Escrow", 
    description: "View escrow details and transaction history." 
  });

  if (isLoading) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-24">
          <LoadingState message="Loading escrow details..." />
        </div>
      </PageTransition>
    );
  }

  if (error || !escrow) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-24 text-center">
          <h1 className="text-heading mb-2">Escrow Not Found</h1>
          <p className="text-muted-foreground mb-6">
            {error ? 'Failed to load escrow details.' : "The escrow you're looking for doesn't exist."}
          </p>
          <Link to="/dashboard" className="text-primary hover:underline text-sm">← Back to Dashboard</Link>
        </div>
      </PageTransition>
    );
  }

  const isActive = escrow.status === EscrowStatus.PENDING;
  const isBuyer = userRole === "buyer";
  const isSeller = userRole === "seller";
  const amountStx = microStxToStx(escrow.amount);
  const timeRemaining = getBlockTimeRemaining(Number(escrow.expiresAt), currentBlock);
  const isExpired = currentBlock >= Number(escrow.expiresAt);
  const actionLoading = releaseMutation.isPending || refundMutation.isPending || disputeMutation.isPending;

  const handleRelease = async () => {
    if (!escrowId) return;
    try {
      await releaseMutation.mutateAsync(escrowId);
      setModal(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleRefund = async () => {
    if (!escrowId) return;
    try {
      await refundMutation.mutateAsync(escrowId);
      setModal(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDispute = async () => {
    if (!escrowId) return;
    try {
      await disputeMutation.mutateAsync(escrowId);
      setModal(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 pb-24 md:pb-8">
        {/* Back */}
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
          {/* Header */}
          <motion.div variants={staggerChild} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-heading font-mono">Escrow #{escrowId}</h1>
              <StatusBadge status={escrow.status} />
              <RoleBadge role={userRole} />
            </div>
            {isActive && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {isExpired ? 'Expired' : timeRemaining}
              </div>
            )}
          </motion.div>

          {/* Description */}
          <motion.div variants={staggerChild}>
            <p className="text-muted-foreground">
              Escrow between {truncateAddress(escrow.buyer)} (buyer) and {truncateAddress(escrow.seller)} (seller)
            </p>
          </motion.div>

          {/* Main Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Left - Details */}
            <motion.div variants={staggerChild} className="md:col-span-2 space-y-6">
              {/* Transaction Summary */}
              <GlassCard>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> Transaction Summary
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-start py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <AmountDisplay amount={amountStx} size="md" />
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Buyer</span>
                    <AddressDisplay address={escrow.buyer} />
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Seller</span>
                    <AddressDisplay address={escrow.seller} />
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Release Block</span>
                    <span className="text-sm font-mono">{Number(escrow.expiresAt).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <span className="text-sm">{getStatusLabel(escrow.status)}</span>
                  </div>
                </div>
              </GlassCard>

              {/* Current Block Info */}
              <GlassCard>
                <h3 className="text-sm font-semibold mb-4">Block Info</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Current Block</span>
                    <span className="text-sm font-mono">{currentBlock.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Release Block</span>
                    <span className="text-sm font-mono">{Number(escrow.expiresAt).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Blocks Remaining</span>
                    <span className={cn("text-sm font-mono", isExpired ? "text-error" : "")}>
                      {isExpired ? 'Expired' : (Number(escrow.expiresAt) - currentBlock).toLocaleString()}
                    </span>
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Right - Actions */}
            <motion.div variants={staggerChild} className="space-y-4">
              {isActive && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <h3 className="text-sm font-semibold">Actions</h3>
                  {isBuyer && (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setModal("release")}
                        disabled={actionLoading}
                        aria-label="Release escrow funds to seller"
                        className="w-full rounded-lg bg-success py-2.5 text-sm font-semibold text-success-foreground hover:bg-success/90 transition-colors disabled:opacity-50"
                      >
                        Release Funds
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setModal("dispute")}
                        disabled={actionLoading}
                        aria-label="File a dispute for this escrow"
                        className="w-full rounded-lg border border-error/30 bg-error/5 py-2.5 text-sm font-semibold text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                      >
                        Dispute
                      </motion.button>
                    </>
                  )}
                  {isSeller && isExpired && (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setModal("refund")}
                      disabled={actionLoading}
                      aria-label="Request refund after expiry"
                      className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      Request Refund
                    </motion.button>
                  )}
                  {isSeller && !isExpired && (
                    <p className="text-xs text-muted-foreground">
                      Waiting for buyer to release funds. Refund available after block {Number(escrow.expiresAt).toLocaleString()}.
                    </p>
                  )}
                  {!isBuyer && !isSeller && (
                    <p className="text-xs text-muted-foreground">You are viewing this escrow as an observer.</p>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold mb-3">Quick Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <StatusBadge status={escrow.status} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Your Role</span>
                    <RoleBadge role={userRole} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount (STX)</span>
                    <span className="font-mono">{amountStx.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Modals */}
        <ConfirmationModal
          open={modal === "release"}
          onClose={() => setModal(null)}
          onConfirm={handleRelease}
          title="Release Funds"
          description={`Are you sure you want to release ${amountStx.toLocaleString()} STX to the seller? This action cannot be undone.`}
          confirmLabel="Release Funds"
          loading={actionLoading}
        />
        <ConfirmationModal
          open={modal === "dispute"}
          onClose={() => setModal(null)}
          onConfirm={handleDispute}
          title="Dispute Escrow"
          description="Filing a dispute will freeze the funds and initiate the arbitration process. Are you sure?"
          confirmLabel="File Dispute"
          variant="danger"
          loading={actionLoading}
        />
        <ConfirmationModal
          open={modal === "refund"}
          onClose={() => setModal(null)}
          onConfirm={handleRefund}
          title="Request Refund"
          description={`Are you sure you want to refund ${amountStx.toLocaleString()} STX back to the buyer? This action cannot be undone.`}
          confirmLabel="Request Refund"
          loading={actionLoading}
        />
      </div>
    </PageTransition>
  );
}
