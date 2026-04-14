import { AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { slideDown } from '@/lib/motion';

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <motion.div
      role="alert"
      variants={slideDown}
      initial="initial"
      animate="animate"
      exit="exit"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2 text-sm text-destructive"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {message}
    </motion.div>
  );
}
