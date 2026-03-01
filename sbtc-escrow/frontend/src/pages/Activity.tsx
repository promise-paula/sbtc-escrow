import { useState } from "react";
import { useDocumentHead } from "@/hooks/use-document-head";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { staggerContainer, staggerChild } from "@/lib/animations";
import { StatusBadge, RoleBadge } from "@/components/escrow/StatusBadge";
import { useAllEscrows } from "@/hooks/use-escrow";
import { useWallet } from "@/contexts/WalletContext";
import { EscrowStatus } from "@/lib/stacks-config";
import { Activity as ActivityIcon, Filter, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SkeletonActivityRow } from "@/components/states/EmptyAndLoading";

type FilterValue = 'all' | EscrowStatus;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: EscrowStatus.PENDING, label: "Pending" },
  { value: EscrowStatus.RELEASED, label: "Released" },
  { value: EscrowStatus.DISPUTED, label: "Disputed" },
  { value: EscrowStatus.REFUNDED, label: "Refunded" },
];

// Format relative time
function formatTimeAgo(blockHeight: bigint | number, currentBlock?: number): string {
  // Without current block context, show block number
  if (!currentBlock) {
    return `Block ${Number(blockHeight).toLocaleString()}`;
  }
  const blocksAgo = currentBlock - Number(blockHeight);
  if (blocksAgo < 0) return 'Pending';
  const daysAgo = Math.floor(blocksAgo / 144); // ~144 blocks per day
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return '1d ago';
  return `${daysAgo}d ago`;
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<FilterValue>("all");
  const { data: escrows = [], isLoading, error } = useAllEscrows();
  const { address } = useWallet();
  useDocumentHead({ title: "Activity | sBTC Escrow", description: "All escrow transactions and history." });

  const filtered = escrows.filter((e) => filter === "all" || e.status === filter);

  // Get user role for an escrow
  const getUserRole = (escrow: { buyer: string; seller: string }): 'buyer' | 'seller' | undefined => {
    if (!address) return undefined;
    if (escrow.buyer === address) return 'buyer';
    if (escrow.seller === address) return 'seller';
    return undefined;
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 pb-24 md:pb-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-heading flex items-center gap-2">
              <ActivityIcon className="h-6 w-6 text-primary" /> Activity
            </h1>
            <p className="text-sm text-muted-foreground mt-1">All escrow transactions and history</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 mb-6 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground mr-1" />
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              aria-label={`Filter by ${f.label}`}
              aria-pressed={filter === f.value}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors border",
                filter === f.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-error/10 border border-error/20 text-error flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load activity. Please try again.</span>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">ID</div>
            <div className="col-span-3">Description</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-1 text-center">Role</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-2 text-right">Expires</div>
          </div>

          {/* Rows */}
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonActivityRow key={i} />
            ))
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate">
              {filtered.map((escrow) => {
                const role = getUserRole(escrow);
                return (
                  <motion.div key={escrow.id} variants={staggerChild}>
                    <Link
                      to={`/escrow/${escrow.id}`}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-surface-1 transition-colors"
                    >
                      <div className="sm:col-span-2 font-mono text-sm font-semibold">ESC-{String(escrow.id).padStart(3, '0')}</div>
                      <div className="sm:col-span-3 text-sm text-muted-foreground truncate">{escrow.description || 'No description'}</div>
                      <div className="sm:col-span-2 text-sm font-mono text-right">{escrow.amountStx.toLocaleString()} STX</div>
                      <div className="sm:col-span-1 flex justify-center">
                        {role ? <RoleBadge role={role} /> : <span className="text-xs text-muted-foreground">-</span>}
                      </div>
                      <div className="sm:col-span-2 flex justify-center"><StatusBadge status={escrow.status} /></div>
                      <div className="sm:col-span-2 text-sm text-muted-foreground text-right font-mono">
                        {Number(escrow.expiresAt).toLocaleString()}
                      </div>
                    </Link>
                  </motion.div>
                );
              })}

              {filtered.length === 0 && (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                  No transactions found for this filter.
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
