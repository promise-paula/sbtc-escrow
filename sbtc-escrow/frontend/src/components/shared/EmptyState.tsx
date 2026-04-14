import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { dur, scaleIn } from '@/lib/motion';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: dur(400) }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <motion.div
        variants={scaleIn}
        initial="initial"
        animate="animate"
        className="rounded-full bg-muted p-3 mb-4"
      >
        <Icon className="h-6 w-6 text-muted-foreground" />
      </motion.div>
      <h3 className="text-sm font-bold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm">{actionLabel}</Button>
      )}
    </motion.div>
  );
}
