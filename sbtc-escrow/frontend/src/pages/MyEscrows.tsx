import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';
import { useEscrows } from '@/hooks/use-escrow';
import { EscrowStatus, STATUS_LABELS } from '@/lib/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { EmptyState } from '@/components/shared/EmptyState';
import { EscrowListSkeleton } from '@/components/shared/PageSkeletons';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Inbox } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { relativeTime } from '@/lib/utils';
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

export default function MyEscrows() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const { data: allEscrows, isLoading, isError } = useEscrows(address);
  const [roleFilter, setRoleFilter] = useState<'all' | 'buyer' | 'seller'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [search, setSearch] = useState('');

  const roleFiltered = useMemo(() => {
    return (allEscrows || []).filter(e => {
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
        switch (sortBy) {
          case 'oldest': return a.createdAt - b.createdAt;
          case 'amount-high': return b.amount - a.amount;
          case 'amount-low': return a.amount - b.amount;
          default: return b.createdAt - a.createdAt;
        }
      });
  }, [roleFiltered, statusFilter, search, sortBy]);

  if (isLoading) return <EscrowListSkeleton />;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground tracking-tight">
          My Escrows{' '}
          <span className="text-muted-foreground font-normal">({allEscrows?.length ?? 0})</span>
        </h1>
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="amount-high">Amount: High → Low</SelectItem>
              <SelectItem value="amount-low">Amount: Low → High</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 w-full sm:w-48 text-xs"
            />
          </div>
        </div>
      </div>

      {isError && <ErrorBanner message="Failed to load escrows. Showing cached data." />}

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
          {STATUS_TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs gap-1.5 px-2.5 py-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((e, i) => {
            const isBuyer = e.buyer === address;
            const counterparty = isBuyer ? e.seller : e.buyer;
            return (
              <motion.div
                key={e.id}
                custom={i}
                variants={listItemVariants}
                initial="hidden"
                animate="visible"
              >
                <Card
                  className="p-4 cursor-pointer transition-all hover:shadow-glow-sm hover:border-primary/20 space-y-3"
                  onClick={() => navigate(`/escrow/${e.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">#{e.id}</span>
                    <StatusBadge status={e.status} />
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
                    <span>{e.indexedAt ? relativeTime(e.indexedAt) : ''}</span>
                  </div>
                </Card>
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
