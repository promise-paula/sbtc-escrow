import React, { useState } from 'react';
import { truncateAddress, getExplorerUrl } from '@/lib/utils';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} aria-label="Copy address">
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
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
