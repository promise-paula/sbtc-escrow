import React from 'react';
import { formatSTX, formatUSD } from '@/lib/utils';

interface AmountDisplayProps {
  micro: number;
  showUsd?: boolean;
  className?: string;
}

export function AmountDisplay({ micro, showUsd = true, className }: AmountDisplayProps) {
  return (
    <span className={className}>
      <span className="font-mono text-sm font-medium">{formatSTX(micro)} STX</span>
      {showUsd && <span className="text-xs text-muted-foreground ml-1">({formatUSD(micro)})</span>}
    </span>
  );
}
