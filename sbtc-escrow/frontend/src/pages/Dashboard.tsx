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
import { useUserEscrows, useDashboardStats, usePlatformStats } from "@/hooks/use-escrow";
import { EscrowStatus, microStxToStx, STX_PRICE_USD } from "@/lib/stacks-config";
import { toEscrowDisplay } from "@/lib/types";
import { LayoutDashboard, TrendingUp, CheckCircle2, ArrowUpDown, Wallet, Plus, Inbox, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

type Filter = "all" | "buyer" | "seller";

export default function Dashboard() {
  const { isConnected, isConnecting, connect, address, error: walletError } = useWallet();
  const [filter, setFilter] = useState<Filter>("all");
  const navigate = useNavigate();
  
  const { data: escrows = [], isLoading, error: escrowError } = useUserEscrows();
  const { data: platformStats } = usePlatformStats();
  const dashboardStats = useDashboardStats();
  
  useDocumentHead({ title: "Dashboard | sBTC Escrow", description: "Manage your active escrows and transactions." });

  // Convert escrows to display format
  const displayEscrows = escrows.map(e => toEscrowDisplay(e, address ?? undefined));
  
  const filtered = displayEscrows.filter((e) => {
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
                disabled={isConnecting}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Wallet className="h-4 w-4" /> 
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </motion.button>
            }
          />
          {walletError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-error justify-center">
              <AlertCircle className="h-4 w-4" />
              {walletError}
            </div>
          )}
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
            <StatsCard 
              label="Total Sent" 
              value={dashboardStats.totalSent} 
              usdValue={dashboardStats.totalSent * STX_PRICE_USD} 
              suffix="STX" 
              icon={<TrendingUp className="h-4 w-4" />} 
            />
            <StatsCard 
              label="Active Escrows" 
              value={dashboardStats.activeCount} 
              icon={<ArrowUpDown className="h-4 w-4" />} 
            />
            <StatsCard 
              label="Completed" 
              value={dashboardStats.completedCount} 
              icon={<CheckCircle2 className="h-4 w-4" />} 
            />
          </motion.div>
        )}

        {/* Error State */}
        {escrowError && (
          <div className="mb-6 p-4 rounded-lg bg-error/10 border border-error/20 text-error flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load escrows. Please try again.</span>
          </div>
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
