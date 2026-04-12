import React from 'react';

interface ContractStatusIndicatorProps {
  isPaused: boolean;
}

export function ContractStatusIndicator({ isPaused }: ContractStatusIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${isPaused ? 'bg-destructive' : 'bg-success'}`} />
      <span className="text-sm font-medium">{isPaused ? 'Paused' : 'Operational'}</span>
    </div>
  );
}
