import React from 'react';
import { motion } from 'framer-motion';
import { dur } from '@/lib/motion';

interface ContractStatusIndicatorProps {
  isPaused: boolean;
}

export function ContractStatusIndicator({ isPaused }: ContractStatusIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {!isPaused && (
          <motion.span
            className="absolute inset-0 rounded-full bg-success"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: dur(2000), repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${isPaused ? 'bg-destructive' : 'bg-success'}`} />
      </span>
      <span className="text-sm font-medium">{isPaused ? 'Paused' : 'Operational'}</span>
    </div>
  );
}
