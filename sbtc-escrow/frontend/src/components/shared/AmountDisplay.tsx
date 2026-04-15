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

const STORAGE_KEY = 'sbtc-escrow-settings';

function readShowUsdSetting(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw).showUsd ?? false) : false;
  } catch {
    return false;
  }
}

export function AmountDisplay({ micro, tokenType = TokenType.STX, showUsd, className }: AmountDisplayProps) {
  const label = tokenLabel(tokenType);
  const { data: stxPrice } = useStxPrice();

  // If showUsd is explicitly passed, honor it. Otherwise read from user settings.
  const shouldShowUsd = showUsd ?? readShowUsdSetting();

  const usdStr = stxPrice && stxPrice > 0
    ? `$${(microToSTX(micro) * stxPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  return (
    <span className={className}>
      <span className="font-mono text-sm font-medium">{formatAmount(micro, tokenType)} {label}</span>
      {shouldShowUsd && tokenType === TokenType.STX && usdStr && (
        <span className="text-xs text-muted-foreground ml-1">({usdStr})</span>
      )}
    </span>
  );
}
