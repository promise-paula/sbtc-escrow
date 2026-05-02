import { useEffect, useState } from 'react';
import { useStxPrice } from './use-stx-price';
import { useBtcPrice } from './use-btc-price';
import { TokenType } from '@/lib/types';
import { microToSTX, satsToBTC } from '@/lib/utils';

const STORAGE_KEY = 'sbtc-escrow-settings';
export const SETTINGS_CHANGED_EVENT = 'sbtc-settings-changed';

function readShowUsd(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? Boolean(JSON.parse(raw).showUsd) : false;
  } catch {
    return false;
  }
}

/**
 * Reactive hook for the user's "Show USD estimates" preference.
 * Subscribes to both cross-tab `storage` events and same-tab updates
 * dispatched via `SETTINGS_CHANGED_EVENT`.
 */
export function useShowUsdSetting(): boolean {
  const [showUsd, setShowUsd] = useState(readShowUsd);

  useEffect(() => {
    const handler = () => setShowUsd(readShowUsd());
    window.addEventListener('storage', handler);
    window.addEventListener(SETTINGS_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, handler);
    };
  }, []);

  return showUsd;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Returns a formatted USD string for the given on-chain amount, or null if
 * the user hasn't enabled USD estimates or the price feed is unavailable.
 *
 * - STX uses CoinGecko's `blockstack` price.
 * - sBTC uses CoinGecko's `bitcoin` price (1 sBTC = 1 BTC by design).
 */
export function useUsdEstimate(micro: number, tokenType: TokenType): string | null {
  const showUsd = useShowUsdSetting();
  const value = useUsdValue(micro, tokenType);
  return showUsd ? value : null;
}

/**
 * Same conversion as `useUsdEstimate` but always returns the USD string when
 * a price is available, regardless of the user's "Show USD" preference.
 *
 * Use for *contextual* surfaces where the USD value is the point of the UI
 * (e.g. an amount input — a buyer typing 1 STX deserves to see ≈ $X
 * whether or not they've toggled the global setting).
 */
export function useUsdValue(micro: number, tokenType: TokenType): string | null {
  const { data: stxPrice } = useStxPrice();
  const { data: btcPrice } = useBtcPrice();

  if (tokenType === TokenType.STX) {
    if (!stxPrice || stxPrice <= 0) return null;
    return formatUsd(microToSTX(micro) * stxPrice);
  }

  if (tokenType === TokenType.SBTC) {
    if (!btcPrice || btcPrice <= 0) return null;
    return formatUsd(satsToBTC(micro) * btcPrice);
  }

  return null;
}
