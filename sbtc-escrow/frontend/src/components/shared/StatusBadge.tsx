import React from 'react';
import { EscrowStatus, STATUS_LABELS } from '@/lib/types';

const statusClasses: Record<EscrowStatus, string> = {
  [EscrowStatus.Pending]: 'bg-status-pending',
  [EscrowStatus.Released]: 'bg-status-released',
  [EscrowStatus.Refunded]: 'bg-status-refunded',
  [EscrowStatus.Disputed]: 'bg-status-disputed',
};

export function StatusBadge({ status }: { status: EscrowStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${statusClasses[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
