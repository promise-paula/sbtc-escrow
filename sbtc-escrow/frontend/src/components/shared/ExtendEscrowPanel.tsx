import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_DURATION_BLOCKS } from '@/lib/stacks-config';
import { useBlockHeight } from '@/hooks/use-block-height';
import { useBlockRate, timeToBlocks } from '@/hooks/use-block-rate';
import { blockToEstimatedDate, blocksToTime } from '@/lib/utils';
import { extendEscrow } from '@/lib/escrow-service';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';

interface ExtendEscrowPanelProps {
  escrowId: number;
  currentExpiresAt: number;
}

const presets = [
  { label: '+1 Day', minutes: 60 * 24 },
  { label: '+1 Week', minutes: 60 * 24 * 7 },
  { label: '+2 Weeks', minutes: 60 * 24 * 14 },
];

export function ExtendEscrowPanel({ escrowId, currentExpiresAt }: ExtendEscrowPanelProps) {
  const [open, setOpen] = useState(false);
  const [customBlocks, setCustomBlocks] = useState('');
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: currentBlock = 0 } = useBlockHeight();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? 10;

  const blocks = selectedMinutes
    ? timeToBlocks(selectedMinutes, minutesPerBlock)
    : (customBlocks ? parseInt(customBlocks) : 0);
  const newExpiry = currentExpiresAt + blocks;
  const maxAdditional = currentBlock + MAX_DURATION_BLOCKS - currentExpiresAt;
  const valid = blocks > 0 && blocks <= maxAdditional;

  const handleExtend = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      await extendEscrow(escrowId, blocks);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
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

      <div className="flex gap-2">
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
