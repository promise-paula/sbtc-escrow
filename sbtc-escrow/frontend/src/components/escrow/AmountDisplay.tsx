import { formatStxAmount, formatUsdAmount, STX_PRICE_USD } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface AmountDisplayProps {
  amount: number;
  showUsd?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AmountDisplay({ amount, showUsd = true, size = "md", className }: AmountDisplayProps) {
  const sizeClasses = {
    sm: "text-sm",
    md: "text-lg font-semibold",
    lg: "text-2xl font-bold",
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <span className={cn("font-mono tracking-tight", sizeClasses[size])}>
        {formatStxAmount(amount)} <span className="text-muted-foreground text-[0.7em]">STX</span>
      </span>
      {showUsd && (
        <span className="text-xs text-muted-foreground font-mono">
          ≈ {formatUsdAmount(amount * STX_PRICE_USD)}
        </span>
      )}
    </div>
  );
}
