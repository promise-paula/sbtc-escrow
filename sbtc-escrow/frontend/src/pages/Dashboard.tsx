import { useState } from "react";
import { useDocumentHead } from "@/hooks/use-document-head";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { staggerContainer } from "@/lib/animations";
import { PageTransition } from "@/components/layout/PageTransition";
import { EscrowCard } from "@/components/escrow/EscrowCard";
import { StatsCard } from "@/components/escrow/StatsCard";
import { EmptyState, SkeletonCard, SkeletonStatsCard } from "@/components/states/EmptyAndLoading";
import { useWallet } from "@/contexts/WalletContext";
import { MOCK_ESCROWS, PLATFORM_STATS } from "@/lib/mock-data";
import { LayoutDashboard, TrendingUp, CheckCircle2, ArrowUpDown, Wallet, Plus, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useSimulatedLoading } from "@/hooks/use-simulated-loading";

type Filter = "all" | "buyer" | "seller";

export default function Dashboard() {
  const { isConnected, connect } = useWallet();
  const [filter, setFilter] = useState<Filter>("all");
  const navigate = useNavigate();
  const isLoading = useSimulatedLoading();
  useDocumentHead({ title: "Dashboard | sBTC Escrow", description: "Manage your active escrows and transactions." });

  const filtered = MOCK_ESCROWS.filter((e) => {
    if (filter === "all") return true;
    return e.userRole === filter;
  });

  if (!isConnected) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24">
          <EmptyState
            icon={<Wallet className="h-8 w-8 text-muted-foreground" />}
            title="Connect Your Wallet"
            description="Connect your Stacks wallet to view your escrows, create new transactions, and manage your funds."
            action={
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={connect}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
              >
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-heading flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-primary" /> Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your active escrows and transactions</p>
          </div>
          <Link to="/create">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              aria-label="Create new escrow"
            >
              <Plus className="h-4 w-4" /> New Escrow
            </motion.button>
          </Link>
        </div>

        {/* Stats */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonStatsCard key={i} />
            ))}
          </div>
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <StatsCard label="Total Volume" value={PLATFORM_STATS.totalVolume} usdValue={PLATFORM_STATS.totalVolumeUsd} change={12.5} suffix="STX" icon={<TrendingUp className="h-4 w-4" />} />
            <StatsCard label="Active Escrows" value={PLATFORM_STATS.activeEscrows} change={8.3} icon={<ArrowUpDown className="h-4 w-4" />} />
            <StatsCard label="Completed" value={PLATFORM_STATS.completedEscrows} change={15.2} icon={<CheckCircle2 className="h-4 w-4" />} />
          </motion.div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-1 mb-6 p-1 rounded-lg bg-surface-1 w-fit">
          {(["all", "buyer", "seller"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-label={`Filter escrows: ${f === "all" ? "All" : f === "buyer" ? "As Buyer" : "As Seller"}`}
              aria-pressed={filter === f}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                filter === f ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "All" : f === "buyer" ? "As Buyer" : "As Seller"}
            </button>
          ))}
        </div>

        {/* Escrow List */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-8 w-8 text-muted-foreground" />}
            title="No Escrows Found"
            description={`You don't have any escrows ${filter !== "all" ? `as ${filter}` : ""} yet. Create your first escrow to get started.`}
            action={
              <Link to="/create">
                <motion.button whileTap={{ scale: 0.97 }} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  <Plus className="h-4 w-4" /> Create Escrow
                </motion.button>
              </Link>
            }
          />
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((escrow) => (
              <EscrowCard key={escrow.id} escrow={escrow} onClick={() => navigate(`/escrow/${escrow.id}`)} />
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
