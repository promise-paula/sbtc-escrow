import React from 'react';
import { formatAmount, tokenLabel } from '@/lib/utils';
import { TokenType } from '@/lib/types';
import { useUsdEstimate } from '@/hooks/use-usd-estimate';

interface AmountDisplayProps {
  micro: number;
  tokenType?: TokenType;
  /** When `false`, suppresses the USD estimate even if the user has it enabled. */
  showUsd?: boolean;
  className?: string;
}

export function AmountDisplay({ micro, tokenType = TokenType.STX, showUsd, className }: AmountDisplayProps) {
  const label = tokenLabel(tokenType);
  const usdStr = useUsdEstimate(micro, tokenType);
  const visible = showUsd === false ? null : usdStr;

  return (
    <span className={className}>
      <span className="font-mono text-sm font-medium">{formatAmount(micro, tokenType)} {label}</span>
      {visible && (
        <span className="text-xs text-muted-foreground ml-1">({visible})</span>
      )}
    </span>
  );
}
