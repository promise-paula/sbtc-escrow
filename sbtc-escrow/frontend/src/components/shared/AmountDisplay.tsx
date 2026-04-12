import React from 'react';
import { formatAmount, formatUSD, tokenLabel } from '@/lib/utils';
import { TokenType } from '@/lib/types';

interface AmountDisplayProps {
  micro: number;
  tokenType?: TokenType;
  showUsd?: boolean;
  className?: string;
}

export function AmountDisplay({ micro, tokenType = TokenType.STX, showUsd = true, className }: AmountDisplayProps) {
  const label = tokenLabel(tokenType);
  return (
    <span className={className}>
      <span className="font-mono text-sm font-medium">{formatAmount(micro, tokenType)} {label}</span>
      {showUsd && tokenType === TokenType.STX && <span className="text-xs text-muted-foreground ml-1">({formatUSD(micro)})</span>}
    </span>
  );
}
