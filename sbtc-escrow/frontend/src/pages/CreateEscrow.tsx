import { useState } from "react";
import { useDocumentHead } from "@/hooks/use-document-head";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { staggerContainer, staggerChild } from "@/lib/animations";
import { useWallet } from "@/contexts/WalletContext";
import { useCreateEscrow } from "@/hooks/use-escrow";
import { STX_PRICE_USD, formatUsdAmount } from "@/lib/mock-data";
import { SuccessModal } from "@/components/modals/Modals";
import { EmptyState } from "@/components/states/EmptyAndLoading";
import { GlassCard } from "@/components/escrow/GlassCard";
import { TransactionPending } from "@/components/escrow/TransactionPending";
import { Plus, Wallet, ArrowLeft, ArrowRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Validate Stacks testnet address (ST prefix)
function isValidStacksAddress(address: string): boolean {
  return /^ST[0-9A-Z]{39,40}$/i.test(address);
}

interface FormData {
  sellerAddress: string;
  amount: string;
  duration: string;
  description: string;
}

const DURATIONS = [
  { value: "144", label: "~1 Day", blocks: "144 blocks" },
  { value: "1008", label: "~1 Week", blocks: "1,008 blocks" },
  { value: "2016", label: "~2 Weeks", blocks: "2,016 blocks" },
  { value: "4320", label: "~1 Month", blocks: "4,320 blocks" },
];

export default function CreateEscrow() {
  const { isConnected, connect } = useWallet();
  const createEscrowMutation = useCreateEscrow();
  useDocumentHead({ title: "Create Escrow | sBTC Escrow", description: "Set up a new escrow transaction." });
  const [step, setStep] = useState<"form" | "review">("form");
  const [showSuccess, setShowSuccess] = useState(false);
  const [txId, setTxId] = useState<string>("");
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [form, setForm] = useState<FormData>({
    sellerAddress: "",
    amount: "",
    duration: "1008",
    description: "",
  });

  const usdPreview = form.amount ? formatUsdAmount(parseFloat(form.amount) * STX_PRICE_USD) : "$0";
  const loading = createEscrowMutation.isPending;

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormData, string>> = {};
    if (!form.sellerAddress || !isValidStacksAddress(form.sellerAddress)) {
      errs.sellerAddress = "Enter a valid Stacks testnet address (ST...)";
    }
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = "Enter a valid amount";
    if (!form.description.trim()) errs.description = "Description is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleReview = () => {
    if (validate()) setStep("review");
  };

  const handleSubmit = async () => {
    try {
      const result = await createEscrowMutation.mutateAsync({
        sellerAddress: form.sellerAddress,
        amountStx: parseFloat(form.amount),
        description: form.description,
      });
      setTxId(result.txid);
      setShowSuccess(true);
    } catch (error) {
      // Error is handled by the mutation hook
      console.error('Failed to create escrow:', error);
    }
  };

  if (!isConnected) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24">
          <EmptyState
            icon={<Wallet className="h-8 w-8 text-muted-foreground" />}
            title="Connect Your Wallet"
            description="Connect your wallet to create a new escrow transaction."
            action={
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={connect} className="flex items-center gap-2 rounded-xl btn-gradient px-6 py-3 text-sm font-semibold">
                <Wallet className="h-4 w-4" /> Connect Wallet
              </motion.button>
            }
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 pb-24 md:pb-8">
        <div className="mb-8">
          <h1 className="text-heading flex items-center gap-2">
            <Plus className="h-6 w-6 text-primary" /> Create Escrow
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Set up a new escrow transaction</p>
        </div>

        <AnimatePresence mode="wait">
          {step === "form" ? (
            <motion.div key="form" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
                {/* Seller Address */}
                <motion.div variants={staggerChild} className="space-y-2">
                  <label htmlFor="seller-address" className="text-sm font-medium">Seller Address</label>
                  <div className={cn("focus-glow rounded-lg border border-border bg-surface-1 transition-colors", errors.sellerAddress && "border-error")}>
                    <input
                      id="seller-address"
                      value={form.sellerAddress}
                      onChange={(e) => { setForm({ ...form, sellerAddress: e.target.value }); setErrors({ ...errors, sellerAddress: undefined }); }}
                      placeholder="SP1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE"
                      aria-invalid={!!errors.sellerAddress}
                      aria-describedby={errors.sellerAddress ? "seller-address-error" : undefined}
                      className="w-full bg-transparent px-4 py-3 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none"
                    />
                  </div>
                  {errors.sellerAddress && <p id="seller-address-error" className="flex items-center gap-1 text-xs text-error"><AlertCircle className="h-3 w-3" />{errors.sellerAddress}</p>}
                </motion.div>

                {/* Amount */}
                <motion.div variants={staggerChild} className="space-y-2">
                  <label htmlFor="escrow-amount" className="text-sm font-medium">Amount</label>
                  <div className={cn("focus-glow rounded-lg border border-border bg-surface-1 flex items-center transition-colors", errors.amount && "border-error")}>
                    <input
                      id="escrow-amount"
                      type="number"
                      value={form.amount}
                      onChange={(e) => { setForm({ ...form, amount: e.target.value }); setErrors({ ...errors, amount: undefined }); }}
                      placeholder="0"
                      aria-invalid={!!errors.amount}
                      aria-describedby={errors.amount ? "amount-error" : undefined}
                      className="flex-1 bg-transparent px-4 py-3 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none"
                    />
                    <span className="pr-4 text-sm font-mono text-muted-foreground">STX</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {errors.amount ? <p id="amount-error" className="flex items-center gap-1 text-xs text-error"><AlertCircle className="h-3 w-3" />{errors.amount}</p> : <span />}
                    <p className="text-xs text-muted-foreground font-mono">≈ {usdPreview} USD</p>
                  </div>
                </motion.div>

                {/* Duration */}
                <motion.div variants={staggerChild} className="space-y-2">
                  <label className="text-sm font-medium">Duration</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DURATIONS.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setForm({ ...form, duration: d.value })}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          form.duration === d.value ? "border-primary bg-primary/5" : "border-border bg-surface-1 hover:bg-surface-2"
                        )}
                      >
                        <span className="block text-sm font-medium">{d.label}</span>
                        <span className="block text-xs text-muted-foreground font-mono">{d.blocks}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>

                {/* Description */}
                <motion.div variants={staggerChild} className="space-y-2">
                  <label htmlFor="escrow-description" className="text-sm font-medium">Description</label>
                  <div className={cn("focus-glow rounded-lg border border-border bg-surface-1 transition-colors", errors.description && "border-error")}>
                    <textarea
                      id="escrow-description"
                      value={form.description}
                      onChange={(e) => { setForm({ ...form, description: e.target.value }); setErrors({ ...errors, description: undefined }); }}
                      placeholder="Describe what this escrow is for..."
                      rows={3}
                      aria-invalid={!!errors.description}
                      aria-describedby={errors.description ? "description-error" : undefined}
                      className="w-full bg-transparent px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none resize-none"
                    />
                  </div>
                  {errors.description && <p id="description-error" className="flex items-center gap-1 text-xs text-error"><AlertCircle className="h-3 w-3" />{errors.description}</p>}
                </motion.div>

                <motion.div variants={staggerChild}>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleReview}
                    className="w-full flex items-center justify-center gap-2 rounded-xl btn-gradient py-3 text-sm font-semibold"
                  >
                    Review Escrow <ArrowRight className="h-4 w-4" />
                  </motion.button>
                </motion.div>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
              <GlassCard className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Review & Confirm</h2>
                  <p className="text-sm text-muted-foreground">Please review the details before creating the escrow.</p>
                </div>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Seller</span>
                    <span className="font-mono text-xs">{form.sellerAddress.slice(0, 10)}...{form.sellerAddress.slice(-6)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Amount</span>
                    <div className="text-right">
                      <span className="font-mono font-semibold">{parseFloat(form.amount).toLocaleString()} STX</span>
                      <p className="text-xs text-muted-foreground font-mono">{usdPreview}</p>
                    </div>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{DURATIONS.find((d) => d.value === form.duration)?.label}</span>
                  </div>
                  <div className="py-2">
                    <span className="text-muted-foreground">Description</span>
                    <p className="mt-1">{form.description}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep("form")} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium hover:bg-surface-2 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Edit
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl btn-gradient py-3 text-sm font-semibold disabled:opacity-50"
                  >
                    Create Escrow
                  </motion.button>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Transaction Pending overlay */}
          {loading && (
            <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
              <GlassCard>
                <TransactionPending
                  txId={txId || "Waiting for wallet..."}
                  message="Creating escrow..."
                  estimatedTime="Confirm in wallet"
                />
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        <SuccessModal
          open={showSuccess}
          onClose={() => {
            setShowSuccess(false);
            // Reset form after successful creation
            setForm({ sellerAddress: "", amount: "", duration: "1008", description: "" });
            setStep("form");
            setTxId("");
          }}
          escrowId="View on Explorer"
          txId={txId}
        />
      </div>
    </PageTransition>
  );
}
