import { motion } from "framer-motion";
import { cardReveal } from "@/lib/animations";
import { EscrowStatus } from "@/lib/stacks-config";
import { EscrowDisplay, getBlockTimeRemaining, isActiveStatus } from "@/lib/types";
import { useBlockHeight } from "@/hooks/use-escrow";
import { StatusBadge, RoleBadge } from "./StatusBadge";
import { AddressDisplay } from "./AddressDisplay";
import { AmountDisplay } from "./AmountDisplay";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface EscrowCardProps {
  escrow: EscrowDisplay;
  onClick?: () => void;
}

export function EscrowCard({ escrow, onClick }: EscrowCardProps) {
  const { data: currentBlock = 0 } = useBlockHeight();
  const timeRemaining = getBlockTimeRemaining(escrow.expiresAt, currentBlock);
  const isActive = isActiveStatus(escrow.status);

  return (
    <motion.div
      variants={cardReveal}
      whileHover={{ scale: 1.015, y: -2 }}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      role="article"
      aria-label={`Escrow ${escrow.id}`}
      tabIndex={0}
      className={cn(
        "group relative rounded-xl border border-border bg-card p-5 cursor-pointer transition-colors",
        "hover:border-primary/30 noise-overlay",
        escrow.status === EscrowStatus.DISPUTED && "border-error/20"
      )}
    >
      <div className="relative z-10 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">#{escrow.id}</span>
            {escrow.userRole && <RoleBadge role={escrow.userRole} />}
          </div>
          <StatusBadge status={escrow.status} />
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-1">{escrow.description || "No description"}</p>

        {/* Amount */}
        <AmountDisplay amount={escrow.amount} size="md" />

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{escrow.userRole === "buyer" ? "To:" : "From:"}</span>
              <AddressDisplay
                address={escrow.userRole === "buyer" ? escrow.seller : escrow.buyer}
                showExplorer={false}
              />
            </div>
          </div>
          {isActive && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{timeRemaining}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
