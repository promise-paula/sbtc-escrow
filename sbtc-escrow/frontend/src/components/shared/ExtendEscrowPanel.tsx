import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_DURATION_BLOCKS, DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';
import { useBlockHeight } from '@/hooks/use-block-height';
import { useBlockRate, timeToBlocks } from '@/hooks/use-block-rate';
import { blockToEstimatedDate, blocksToTime } from '@/lib/utils';
import { extendEscrow } from '@/lib/escrow-service';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface ExtendEscrowPanelProps {
  contractId: string;
  escrowId: number;
  currentExpiresAt: number;
  /** If set, disables the trigger and shows this as a tooltip — used to
   *  surface contract-level gating (e.g. "Contract paused") without
   *  removing the button entirely. */
  disabledReason?: string;
}

const presets = [
  { label: '+1 Day', minutes: 60 * 24 },
  { label: '+1 Week', minutes: 60 * 24 * 7 },
  { label: '+2 Weeks', minutes: 60 * 24 * 14 },
];

export function ExtendEscrowPanel({ contractId, escrowId, currentExpiresAt, disabledReason }: ExtendEscrowPanelProps) {
  const [open, setOpen] = useState(false);
  const [customBlocks, setCustomBlocks] = useState('');
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: currentBlock = 0 } = useBlockHeight();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;

  const blocks = selectedMinutes
    ? timeToBlocks(selectedMinutes, minutesPerBlock)
    : (customBlocks ? parseInt(customBlocks, 10) : 0);
  const newExpiry = currentExpiresAt + blocks;
  const maxAdditional = Math.max(0, currentBlock + MAX_DURATION_BLOCKS - currentExpiresAt);
  const valid = blocks > 0 && blocks <= maxAdditional;

  const handleExtend = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      await extendEscrow(contractId, escrowId, blocks);
      toast.success('Deadline extended', { description: `Added ${blocksToTime(blocks, minutesPerBlock)} to this escrow.` });
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
        toast.error('Transaction cancelled', { description: 'You declined the wallet prompt.' });
      } else {
        toast.error('Failed to extend deadline', { description: 'Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!!disabledReason}
        title={disabledReason}
        className="gap-1.5"
      >
        <Clock className="h-3.5 w-3.5" /> Extend Deadline
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Extend Escrow Deadline</h4>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)} aria-label="Close">
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {presets.map(p => (
          <Button
            key={p.label}
            variant={selectedMinutes === p.minutes ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setSelectedMinutes(p.minutes); setCustomBlocks(''); }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Custom blocks"
          value={customBlocks}
          onChange={(e) => { setCustomBlocks(e.target.value); setSelectedMinutes(null); }}
          className="font-mono text-sm"
          min={1}
          max={maxAdditional}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">blocks</span>
      </div>

      {valid && (
        <p className="text-xs text-muted-foreground">
          New expiry: block {newExpiry.toLocaleString()} (~{blockToEstimatedDate(newExpiry, currentBlock, minutesPerBlock).toLocaleDateString()})
          · +{blocksToTime(blocks, minutesPerBlock)}
        </p>
      )}

      <Button onClick={handleExtend} disabled={!valid || loading} size="sm" className="w-full">
        {loading ? 'Extending…' : 'Confirm Extension'}
      </Button>
    </div>
  );
}
