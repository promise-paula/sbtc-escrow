import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BLOCKS_PER_DAY, BLOCKS_PER_WEEK, MAX_DURATION_BLOCKS } from '@/lib/stacks-config';
import { CURRENT_BLOCK_HEIGHT } from '@/lib/mock-data';
import { blockToEstimatedDate, blocksToTime } from '@/lib/utils';
import { extendEscrow } from '@/lib/escrow-service';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';

interface ExtendEscrowPanelProps {
  escrowId: number;
  currentExpiresAt: number;
}

const presets = [
  { label: '+1 Day', blocks: BLOCKS_PER_DAY },
  { label: '+1 Week', blocks: BLOCKS_PER_WEEK },
  { label: '+2 Weeks', blocks: BLOCKS_PER_WEEK * 2 },
];

export function ExtendEscrowPanel({ escrowId, currentExpiresAt }: ExtendEscrowPanelProps) {
  const [open, setOpen] = useState(false);
  const [customBlocks, setCustomBlocks] = useState('');
  const [selectedBlocks, setSelectedBlocks] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const blocks = selectedBlocks || (customBlocks ? parseInt(customBlocks) : 0);
  const newExpiry = currentExpiresAt + blocks;
  const maxAdditional = CURRENT_BLOCK_HEIGHT + MAX_DURATION_BLOCKS - currentExpiresAt;
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
            variant={selectedBlocks === p.blocks ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setSelectedBlocks(p.blocks); setCustomBlocks(''); }}
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
          onChange={(e) => { setCustomBlocks(e.target.value); setSelectedBlocks(null); }}
          className="font-mono text-sm"
          min={1}
          max={maxAdditional}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">blocks</span>
      </div>

      {valid && (
        <p className="text-xs text-muted-foreground">
          New expiry: block {newExpiry.toLocaleString()} (~{blockToEstimatedDate(newExpiry, CURRENT_BLOCK_HEIGHT).toLocaleDateString()})
          · +{blocksToTime(blocks)}
        </p>
      )}

      <Button onClick={handleExtend} disabled={!valid || loading} size="sm" className="w-full">
        {loading ? 'Extending…' : 'Confirm Extension'}
      </Button>
    </div>
  );
}
