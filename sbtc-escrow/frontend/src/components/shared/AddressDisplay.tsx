import React, { useState } from 'react';
import { truncateAddress, getExplorerUrl } from '@/lib/utils';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { dur } from '@/lib/motion';

interface AddressDisplayProps {
  address: string;
  truncateChars?: number;
  showCopy?: boolean;
  showExplorer?: boolean;
}

export function AddressDisplay({ address, truncateChars = 4, showCopy = true, showExplorer = false }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-sm">{truncateAddress(address, truncateChars)}</span>
      {showCopy && (
        <Button variant="ghost" size="icon" className="h-7 w-7 min-h-[44px] min-w-[44px]" onClick={handleCopy} aria-label="Copy address">
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.span
                key="check"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: dur(150) }}
              >
                <Check className="h-3 w-3 text-success" />
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: dur(150) }}
              >
                <Copy className="h-3 w-3 text-muted-foreground" />
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      )}
      {showExplorer && (
        <a href={getExplorerUrl('address', address)} target="_blank" rel="noopener noreferrer" aria-label="View in explorer">
          <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </a>
      )}
    </span>
  );
}
