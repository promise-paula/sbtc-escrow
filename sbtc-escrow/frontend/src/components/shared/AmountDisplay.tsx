import React from 'react';
import { formatAmount, microToSTX, tokenLabel } from '@/lib/utils';
import { TokenType } from '@/lib/types';
import { useStxPrice } from '@/hooks/use-stx-price';

interface AmountDisplayProps {
  micro: number;
  tokenType?: TokenType;
  showUsd?: boolean;
  className?: string;
}

export function AmountDisplay({ micro, tokenType = TokenType.STX, showUsd = true, className }: AmountDisplayProps) {
  const label = tokenLabel(tokenType);
  const { data: stxPrice } = useStxPrice();

  const usdStr = stxPrice && stxPrice > 0
    ? `$${(microToSTX(micro) * stxPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  return (
    <span className={className}>
      <span className="font-mono text-sm font-medium">{formatAmount(micro, tokenType)} {label}</span>
      {showUsd && tokenType === TokenType.STX && usdStr && (
        <span className="text-xs text-muted-foreground ml-1">({usdStr})</span>
      )}
    </span>
  );
}
