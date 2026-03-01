import { useState } from "react";
import { useDocumentHead } from "@/hooks/use-document-head";
import { toast } from "sonner";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { staggerContainer, staggerChild } from "@/lib/animations";
import { StatusBadge, RoleBadge } from "@/components/escrow/StatusBadge";
import { AddressDisplay } from "@/components/escrow/AddressDisplay";
import { AmountDisplay } from "@/components/escrow/AmountDisplay";
import { GlassCard } from "@/components/escrow/GlassCard";
import { ConfirmationModal } from "@/components/modals/Modals";
import { MOCK_ESCROWS, getTimeRemaining } from "@/lib/mock-data";
import { TimeDisplay } from "@/components/escrow/TimeDisplay";
import { ArrowLeft, Clock, ExternalLink, CheckCircle2, AlertTriangle, RotateCcw, FileText, Zap, Shield, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

const eventIcons: Record<string, React.ReactNode> = {
  created: <FileText className="h-3.5 w-3.5" />,
  funded: <Zap className="h-3.5 w-3.5" />,
  released: <CheckCircle2 className="h-3.5 w-3.5" />,
  disputed: <AlertTriangle className="h-3.5 w-3.5" />,
  refunded: <RotateCcw className="h-3.5 w-3.5" />,
  expired: <Ban className="h-3.5 w-3.5" />,
};

export default function EscrowDetail() {
  const { id } = useParams<{ id: string }>();
  const escrow = MOCK_ESCROWS.find((e) => e.id === id);
  const [modal, setModal] = useState<"release" | "dispute" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  useDocumentHead({ title: escrow ? `${escrow.id} | sBTC Escrow` : "Escrow Not Found | sBTC Escrow", description: "View escrow details and transaction history." });

  if (!escrow) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-24 text-center">
          <h1 className="text-heading mb-2">Escrow Not Found</h1>
          <p className="text-muted-foreground mb-6">The escrow you're looking for doesn't exist.</p>
          <Link to="/dashboard" className="text-primary hover:underline text-sm">← Back to Dashboard</Link>
        </div>
      </PageTransition>
    );
  }

  const isActive = escrow.status === "active";
  const isBuyer = escrow.userRole === "buyer";

  const handleAction = () => {
    setActionLoading(true);
    const currentModal = modal;
    setTimeout(() => {
      setActionLoading(false);
      setModal(null);
      if (currentModal === "release") {
        toast.success("Funds Released", {
          description: `${escrow.amount.toLocaleString()} STX sent to seller`,
        });
      } else if (currentModal === "dispute") {
        toast.error("Dispute Filed", {
          description: "Arbitration process initiated",
        });
      }
    }, 1500);
  };

  const handleRefund = () => {
    toast.success("Escrow Refunded", {
      description: `${escrow.amount.toLocaleString()} STX returned to buyer`,
    });
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
              <h1 className="text-heading font-mono">{escrow.id}</h1>
              <StatusBadge status={escrow.status} />
              <RoleBadge role={escrow.userRole} />
            </div>
            {isActive && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {getTimeRemaining(escrow.expiresAt)}
              </div>
            )}
          </motion.div>

          {/* Description */}
          <motion.div variants={staggerChild}>
            <p className="text-muted-foreground">{escrow.description}</p>
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
                    <AmountDisplay amount={escrow.amount} size="md" />
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Buyer</span>
                    <AddressDisplay address={escrow.buyerAddress} />
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Seller</span>
                    <AddressDisplay address={escrow.sellerAddress} />
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Created</span>
                    <span className="text-sm">{escrow.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>
                </div>
              </GlassCard>

              {/* Timeline */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold mb-4">Activity Timeline</h3>
                <div className="space-y-0">
                  {escrow.events.map((event, i) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full border",
                          event.type === "released" ? "border-success/30 bg-success/10 text-success" :
                          event.type === "disputed" ? "border-error/30 bg-error/10 text-error" :
                          event.type === "refunded" ? "border-info/30 bg-info/10 text-info" :
                          "border-border bg-surface-2 text-muted-foreground"
                        )}>
                          {eventIcons[event.type]}
                        </div>
                        {i < escrow.events.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
                      </div>
                      <div className="pb-6">
                        <p className="text-sm font-medium">{event.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5"><TimeDisplay date={event.timestamp} /></p>
                        {event.txId && (
                          <a href={`https://explorer.stacks.co/txid/${event.txId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                            {event.txId.slice(0, 10)}... <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
                        aria-label="Release escrow funds to seller"
                        className="w-full rounded-lg bg-success py-2.5 text-sm font-semibold text-success-foreground hover:bg-success/90 transition-colors"
                      >
                        Release Funds
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setModal("dispute")}
                        aria-label="File a dispute for this escrow"
                        className="w-full rounded-lg border border-error/30 bg-error/5 py-2.5 text-sm font-semibold text-error hover:bg-error/10 transition-colors"
                      >
                        Dispute
                      </motion.button>
                    </>
                  )}
                  {!isBuyer && (
                    <p className="text-xs text-muted-foreground">Waiting for buyer to release funds or the escrow to expire.</p>
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
                    <RoleBadge role={escrow.userRole} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Events</span>
                    <span>{escrow.events.length}</span>
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
          onConfirm={handleAction}
          title="Release Funds"
          description={`Are you sure you want to release ${escrow.amount.toLocaleString()} STX to the seller? This action cannot be undone.`}
          confirmLabel="Release Funds"
          loading={actionLoading}
        />
        <ConfirmationModal
          open={modal === "dispute"}
          onClose={() => setModal(null)}
          onConfirm={handleAction}
          title="Dispute Escrow"
          description="Filing a dispute will freeze the funds and initiate the arbitration process. Are you sure?"
          confirmLabel="File Dispute"
          variant="danger"
          loading={actionLoading}
        />
      </div>
    </PageTransition>
  );
}
