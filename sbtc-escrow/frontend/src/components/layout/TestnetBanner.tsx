import React, { useState } from 'react';
import { X } from 'lucide-react';
import { STACKS_NETWORK } from '@/lib/stacks-config';

const DISMISSED_KEY = 'testnet-banner-dismissed';

export function TestnetBanner() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');

  // Don't show the testnet warning on mainnet
  if (STACKS_NETWORK === 'mainnet' || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="bg-accent-warm text-white text-xs font-medium flex items-center justify-center gap-2 px-4 py-1.5 relative">
      <span>⚠ You are on Stacks Testnet — funds are not real</span>
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-primary-foreground/20 transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
