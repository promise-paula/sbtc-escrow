import { useState } from "react";
import { useDocumentHead } from "@/hooks/use-document-head";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { staggerContainer, staggerChild } from "@/lib/animations";
import { StatusBadge, RoleBadge } from "@/components/escrow/StatusBadge";
import { MOCK_ESCROWS, formatStxAmount, type EscrowStatus } from "@/lib/mock-data";
import { TimeDisplay } from "@/components/escrow/TimeDisplay";
import { Activity as ActivityIcon, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSimulatedLoading } from "@/hooks/use-simulated-loading";
import { SkeletonActivityRow } from "@/components/states/EmptyAndLoading";

const FILTERS: { value: EscrowStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "released", label: "Released" },
  { value: "disputed", label: "Disputed" },
  { value: "refunded", label: "Refunded" },
];

export default function ActivityPage() {
  const [filter, setFilter] = useState<EscrowStatus | "all">("all");
  const isLoading = useSimulatedLoading();
  useDocumentHead({ title: "Activity | sBTC Escrow", description: "All escrow transactions and history." });

  const filtered = MOCK_ESCROWS.filter((e) => filter === "all" || e.status === filter);

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

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">ID</div>
            <div className="col-span-3">Description</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-1 text-center">Role</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-2 text-right">Time</div>
          </div>

          {/* Rows */}
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonActivityRow key={i} />
            ))
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate">
              {filtered.map((escrow) => (
                <motion.div key={escrow.id} variants={staggerChild}>
                  <Link
                    to={`/escrow/${escrow.id}`}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-surface-1 transition-colors"
                  >
                    <div className="sm:col-span-2 font-mono text-sm font-semibold">{escrow.id}</div>
                    <div className="sm:col-span-3 text-sm text-muted-foreground truncate">{escrow.description}</div>
                    <div className="sm:col-span-2 text-sm font-mono text-right">{formatStxAmount(escrow.amount)} STX</div>
                    <div className="sm:col-span-1 flex justify-center"><RoleBadge role={escrow.userRole} /></div>
                    <div className="sm:col-span-2 flex justify-center"><StatusBadge status={escrow.status} /></div>
                    <div className="sm:col-span-2 text-sm text-muted-foreground text-right"><TimeDisplay date={escrow.createdAt} /></div>
                  </Link>
                </motion.div>
              ))}

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
