import { motion } from "framer-motion";
import { statsReveal } from "@/lib/animations";
import { formatStxAmount, formatUsdAmount } from "@/lib/mock-data";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/use-count-up";

interface StatsCardProps {
  label: string;
  value: number;
  usdValue?: number;
  change?: number;
  suffix?: string;
  icon?: React.ReactNode;
  formatAsCurrency?: boolean;
}

export function StatsCard({ label, value, usdValue, change, suffix, icon, formatAsCurrency }: StatsCardProps) {
  const isPositive = change && change > 0;
  const animatedValue = useCountUp(value);
  const animatedUsd = useCountUp(usdValue ?? 0, { delay: 300 });

  return (
    <motion.div variants={statsReveal} className="rounded-xl border border-border bg-card p-5 noise-overlay">
      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <div>
          <span className="font-mono text-2xl font-bold tracking-tight">
            {formatAsCurrency ? formatUsdAmount(animatedValue) : formatStxAmount(animatedValue)}
            {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
          </span>
          {usdValue && (
            <p className="text-xs text-muted-foreground font-mono mt-0.5">≈ {formatUsdAmount(animatedUsd)}</p>
          )}
        </div>
        {change !== undefined && (
          <div className={cn("flex items-center gap-1 text-xs font-medium", isPositive ? "text-success" : "text-error")}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{isPositive ? "+" : ""}{change}%</span>
            <span className="text-muted-foreground">vs last week</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
