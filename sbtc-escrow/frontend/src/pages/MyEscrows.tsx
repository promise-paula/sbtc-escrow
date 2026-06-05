import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';
import { useEscrows } from '@/hooks/use-escrow';
import { useMergedEscrows } from '@/hooks/use-pending-escrows';
import { usePendingAction } from '@/hooks/use-pending-actions';
import { ACTION_LABEL } from '@/lib/pending-actions';
import { Escrow, EscrowStatus, STATUS_LABELS } from '@/lib/types';
import { getExplorerUrl } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { EmptyState } from '@/components/shared/EmptyState';
import { EscrowListSkeleton } from '@/components/shared/PageSkeletons';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Inbox } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { relativeTime } from '@/lib/utils';
import { useBlockHeight } from '@/hooks/use-block-height';
import { useBlockRate } from '@/hooks/use-block-rate';
import { DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';
import { motion, AnimatePresence } from 'framer-motion';
import { listItemVariants, fadeInOut } from '@/lib/motion';

type SortOption = 'newest' | 'oldest' | 'amount-high' | 'amount-low';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: String(EscrowStatus.Pending), label: STATUS_LABELS[EscrowStatus.Pending] },
  { value: String(EscrowStatus.Released), label: STATUS_LABELS[EscrowStatus.Released] },
  { value: String(EscrowStatus.Refunded), label: STATUS_LABELS[EscrowStatus.Refunded] },
  { value: String(EscrowStatus.Disputed), label: STATUS_LABELS[EscrowStatus.Disputed] },
];

/**
 * Single escrow card in the grid. Extracted so we can call `usePendingAction`
 * per row — that hook subscribes to a store and React rules forbid hooks inside
 * .map() closures, but they're fine inside child components rendered from a map.
 *
 * Shows a "Releasing…" / "Refunding…" chip when an action submitted from this
 * device hasn't yet been reflected by the indexer. The chip disappears
 * automatically once the indexed status matches the action's expected outcome.
 */
function EscrowCard({
  escrow,
  isBuyer,
  counterparty,
  currentBlock,
  minutesPerBlock,
  onClick,
}: {
  escrow: Escrow;
  isBuyer: boolean;
  counterparty: string;
  currentBlock: number;
  minutesPerBlock: number;
  onClick: () => void;
}) {
  const pendingAction = usePendingAction(escrow.contractId, escrow.id);

  return (
    <button
      type="button"
      className="w-full text-left p-4 rounded-lg border border-border cursor-pointer transition-all hover:shadow-glow-sm hover:border-primary/20 space-y-3 bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      aria-label={`Escrow #${escrow.id}: ${escrow.description}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">#{escrow.id}</span>
        {pendingAction ? (
          <Badge variant="outline" className="text-xs font-normal gap-1.5 border-primary/40 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            {ACTION_LABEL[pendingAction.type]}…
          </Badge>
        ) : (
          <StatusBadge status={escrow.status} />
        )}
      </div>
      <p className="text-sm font-medium text-foreground line-clamp-2">{escrow.description}</p>
      <div className="flex items-center justify-between">
        <AmountDisplay micro={escrow.amount} tokenType={escrow.tokenType} />
        <AddressDisplay address={counterparty} showCopy={false} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <Badge variant="outline" className="text-xs font-normal">
          {isBuyer ? 'Buyer' : 'Seller'}
        </Badge>
        <span>{relativeTime(escrow.indexedAt)}</span>
      </div>
    </button>
  );
}

export default function MyEscrows() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const { data: indexedEscrows, isLoading, isError } = useEscrows(address);
  // Optimistic merge: pending tx placeholders appear at the top until
  // the chainhook indexer mirrors the row into Supabase. Without this,
  // a freshly-created escrow can be missing from this list for ~1–3 min.
  const allEscrows = useMergedEscrows(address, indexedEscrows);
  const { data: currentBlock = 0 } = useBlockHeight();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;
  const [roleFilter, setRoleFilter] = useState<'all' | 'buyer' | 'seller'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [search, setSearch] = useState('');

  const roleFiltered = useMemo(() => {
    return allEscrows.filter(e => {
      if (roleFilter === 'buyer') return e.buyer === address;
      if (roleFilter === 'seller') return e.seller === address;
      return true;
    });
  }, [allEscrows, address, roleFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: roleFiltered.length };
    for (const e of roleFiltered) {
      const key = String(e.status);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [roleFiltered]);

  const filtered = useMemo(() => {
    const statusValue = statusFilter === 'all' ? null : Number(statusFilter) as EscrowStatus;
    return roleFiltered
      .filter(e => statusValue === null || e.status === statusValue)
      .filter(e => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          e.id.toString().includes(q) ||
          e.buyer.toLowerCase().includes(q) ||
          e.seller.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Pending placeholders always pin to the top — they're the most recent action.
        if (a.isPending && !b.isPending) return -1;
        if (!a.isPending && b.isPending) return 1;
        // Use indexedAt (wall-clock) not createdAt (block height). Mixing
        // burn blocks (v3+) with Stacks blocks (legacy) in a numeric sort
        // puts every legacy escrow before every v3 escrow regardless of
        // actual chronology.
        switch (sortBy) {
          case 'oldest': return a.indexedAt < b.indexedAt ? -1 : 1;
          case 'amount-high': return b.amount - a.amount;
          case 'amount-low': return a.amount - b.amount;
          default: return a.indexedAt < b.indexedAt ? 1 : -1;
        }
      });
  }, [roleFiltered, statusFilter, search, sortBy]);

  if (isLoading) return <EscrowListSkeleton />;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          My Escrows{' '}
          <span className="text-muted-foreground font-normal">({allEscrows.length})</span>
        </h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-full sm:w-36 h-10 text-sm">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="amount-high">Amount: High → Low</SelectItem>
              <SelectItem value="amount-low">Amount: Low → High</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-2.5 top-3 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-10 w-full sm:w-48 text-sm"
            />
          </div>
        </div>
      </div>

      {isError && <ErrorBanner message="Failed to load escrows. Showing cached data." />}

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
          {STATUS_TABS.filter(tab => tab.value === 'all' || (statusCounts[tab.value] ?? 0) > 0 || statusFilter === tab.value).map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs gap-1.5 px-3 py-1.5 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {tab.label}
              {(statusCounts[tab.value] ?? 0) > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-xs font-normal rounded-full">
                  {statusCounts[tab.value]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Role Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Role:</span>
        <Tabs value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-3">All</TabsTrigger>
            <TabsTrigger value="buyer" className="text-xs px-3">Buyer</TabsTrigger>
            <TabsTrigger value="seller" className="text-xs px-3">Seller</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Card Grid */}
      <AnimatePresence mode="wait">
      {filtered.length === 0 ? (
        <motion.div key="empty" variants={fadeInOut} initial="initial" animate="animate" exit="exit">
        <EmptyState
          icon={Inbox}
          title="No escrows found"
          description={search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first escrow to get started.'}
          actionLabel={!search && statusFilter === 'all' ? 'Create Escrow' : undefined}
          onAction={!search && statusFilter === 'all' ? () => navigate('/create') : undefined}
        />
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((e, i) => {
            const isBuyer = e.buyer === address;
            const counterparty = isBuyer ? e.seller : e.buyer;
            return (
              <motion.div
                key={e.isPending ? `pending-${e.txHash}` : e.id}
                custom={i}
                variants={listItemVariants}
                initial="hidden"
                animate="visible"
              >
                {e.isPending ? (
                  // Pending placeholder — no navigation (no real id yet); link to explorer instead.
                  <div className="w-full text-left p-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Awaiting confirmation
                      </span>
                      <Badge variant="outline" className="text-xs font-normal">Submitting</Badge>
                    </div>
                    <p className="text-sm font-medium text-foreground line-clamp-2">{e.description}</p>
                    <div className="flex items-center justify-between">
                      <AmountDisplay micro={e.amount} tokenType={e.tokenType} />
                      <AddressDisplay address={counterparty} showCopy={false} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs font-normal">
                        {isBuyer ? 'Buyer' : 'Seller'}
                      </Badge>
                      {e.txHash && (
                        <a
                          href={getExplorerUrl('tx', e.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs underline hover:text-foreground"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          View tx
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <EscrowCard
                    escrow={e}
                    isBuyer={isBuyer}
                    counterparty={counterparty}
                    currentBlock={currentBlock}
                    minutesPerBlock={minutesPerBlock}
                    onClick={() => navigate(`/escrow/${e.id}`)}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      )}
      </AnimatePresence>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} escrow{filtered.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
