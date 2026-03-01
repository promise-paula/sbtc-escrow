import { EscrowStatus } from "@/lib/stacks-config";
import { type UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusConfig: Record<EscrowStatus, { label: string; className: string; dot?: boolean }> = {
  [EscrowStatus.PENDING]: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20", dot: true },
  [EscrowStatus.RELEASED]: { label: "Released", className: "bg-success/10 text-success border-success/20" },
  [EscrowStatus.REFUNDED]: { label: "Refunded", className: "bg-info/10 text-info border-info/20" },
  [EscrowStatus.DISPUTED]: { label: "Disputed", className: "bg-error/10 text-error border-error/20" },
};

export function StatusBadge({ status }: { status: EscrowStatus }) {
  const config = statusConfig[status] ?? { label: "Unknown", className: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", config.className)}>
      {config.dot && <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === EscrowStatus.PENDING && "status-dot-pulse")} />}
      {status === EscrowStatus.RELEASED && <span className="text-[10px]">✓</span>}
      {config.label}
    </span>
  );
}

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
      role === "buyer" ? "bg-stx/10 text-stx border-stx/20" : "bg-btc/10 text-btc border-btc/20"
    )}>
      {role === "buyer" ? "Buyer" : "Seller"}
    </span>
  );
}
