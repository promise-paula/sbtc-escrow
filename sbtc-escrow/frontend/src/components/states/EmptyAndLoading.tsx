import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/animations";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div variants={fadeInUp} initial="initial" animate="animate" className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>
      {action}
    </motion.div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-pulse">
      <div className="flex justify-between">
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded bg-surface-2" />
          <div className="h-5 w-14 rounded-full bg-surface-2" />
        </div>
        <div className="h-5 w-16 rounded-full bg-surface-2" />
      </div>
      <div className="h-4 w-3/4 rounded bg-surface-2" />
      <div className="space-y-1">
        <div className="h-6 w-32 rounded bg-surface-2" />
        <div className="h-3 w-20 rounded bg-surface-2" />
      </div>
      <div className="pt-2 border-t border-border flex justify-between">
        <div className="h-4 w-40 rounded bg-surface-2" />
        <div className="h-4 w-24 rounded bg-surface-2" />
      </div>
    </div>
  );
}

export function SkeletonStatsCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-surface-2" />
        <div className="h-4 w-4 rounded bg-surface-2" />
      </div>
      <div className="space-y-1">
        <div className="h-7 w-36 rounded bg-surface-2" />
        <div className="h-3 w-20 rounded bg-surface-2" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded bg-surface-2" />
        <div className="h-3 w-24 rounded bg-surface-2" />
      </div>
    </div>
  );
}

export function SkeletonActivityRow() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-4 border-b border-border animate-pulse">
      <div className="sm:col-span-2"><div className="h-4 w-16 rounded bg-surface-2" /></div>
      <div className="sm:col-span-3"><div className="h-4 w-full rounded bg-surface-2" /></div>
      <div className="sm:col-span-2 flex justify-end"><div className="h-4 w-20 rounded bg-surface-2" /></div>
      <div className="sm:col-span-1 flex justify-center"><div className="h-5 w-12 rounded-full bg-surface-2" /></div>
      <div className="sm:col-span-2 flex justify-center"><div className="h-5 w-16 rounded-full bg-surface-2" /></div>
      <div className="sm:col-span-2 flex justify-end"><div className="h-4 w-16 rounded bg-surface-2" /></div>
    </div>
  );
}