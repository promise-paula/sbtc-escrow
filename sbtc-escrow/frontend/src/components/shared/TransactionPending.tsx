import React from 'react';
import { Loader2, ExternalLink } from 'lucide-react';
import { getExplorerUrl } from '@/lib/utils';

interface TransactionPendingProps {
  txHash?: string;
  message?: string;
}

export function TransactionPending({ txHash, message = 'Waiting for confirmation…' }: TransactionPendingProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="text-xs text-muted-foreground mt-0.5">This may take a few minutes on the Stacks blockchain.</p>
      </div>
      {txHash && (
        <a
          href={getExplorerUrl('tx', txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-primary hover:underline flex items-center gap-1"
        >
          Explorer <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
