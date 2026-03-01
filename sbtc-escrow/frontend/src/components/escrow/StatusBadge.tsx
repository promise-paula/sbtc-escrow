import { type EscrowStatus, type UserRole } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const statusConfig: Record<EscrowStatus, { label: string; className: string; dot?: boolean }> = {
  pending: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20", dot: true },
  active: { label: "Active", className: "bg-success/10 text-success border-success/20", dot: true },
  released: { label: "Released", className: "bg-success/10 text-success border-success/20" },
  refunded: { label: "Refunded", className: "bg-info/10 text-info border-info/20" },
  disputed: { label: "Disputed", className: "bg-error/10 text-error border-error/20" },
  expired: { label: "Expired", className: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({ status }: { status: EscrowStatus }) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", config.className)}>
      {config.dot && <span className={cn("h-1.5 w-1.5 rounded-full bg-current", (status === "pending" || status === "active") && "status-dot-pulse")} />}
      {status === "released" && <span className="text-[10px]">✓</span>}
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
