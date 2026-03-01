import { motion, AnimatePresence } from "framer-motion";
import { modalOverlay, modalContent, celebrationPop } from "@/lib/animations";
import { AlertTriangle, CheckCircle2, X, PartyPopper, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
}

export function ConfirmationModal({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", variant = "default", loading }: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc">
          <motion.div variants={modalOverlay} initial="initial" animate="animate" exit="exit" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div variants={modalContent} initial="initial" animate="animate" exit="exit" className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 elevation-4">
            <button onClick={onClose} aria-label="Close dialog" className="absolute right-4 top-4 p-1 rounded hover:bg-accent transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="flex items-start gap-4">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", variant === "danger" ? "bg-error/10" : "bg-primary/10")}>
                {variant === "danger" ? <AlertTriangle className="h-5 w-5 text-error" /> : <CheckCircle2 className="h-5 w-5 text-primary" />}
              </div>
              <div className="space-y-2">
                <h3 id="confirm-title" className="text-lg font-semibold">{title}</h3>
                <p id="confirm-desc" className="text-sm text-muted-foreground">{description}</p>
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end">
              <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">Cancel</button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onConfirm}
                disabled={loading}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
                  variant === "danger" ? "bg-error text-error-foreground hover:bg-error/90" : "btn-gradient"
                )}
              >
                {loading ? "Processing..." : confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface SuccessModalProps {
  open: boolean;
  onClose: () => void;
  escrowId: string;
  txId?: string;
}

export function SuccessModal({ open, onClose, escrowId, txId }: SuccessModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="success-title">
          <motion.div variants={modalOverlay} initial="initial" animate="animate" exit="exit" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div variants={modalContent} initial="initial" animate="animate" exit="exit" className="relative w-full max-w-md rounded-xl border border-border bg-card p-8 text-center elevation-4">
            <motion.div variants={celebrationPop} initial="initial" animate="animate" className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <PartyPopper className="h-8 w-8 text-success" />
              </div>
            </motion.div>
            <h3 id="success-title" className="text-xl font-bold mb-2">Escrow Created!</h3>
            <p className="text-muted-foreground text-sm mb-4">Your escrow has been successfully created and is ready for funding.</p>
            <div className="rounded-lg bg-surface-2 p-3 mb-6">
              <p className="text-xs text-muted-foreground mb-1">Escrow ID</p>
              <p className="font-mono font-semibold text-primary">{escrowId}</p>
            </div>
            {txId && (
              <a href={`https://explorer.stacks.co/txid/${txId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-4">
                View Transaction <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <div className="mt-2">
              <motion.button whileTap={{ scale: 0.97 }} onClick={onClose} className="w-full rounded-lg btn-gradient px-4 py-2.5 text-sm font-semibold transition-colors">
                Done
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
