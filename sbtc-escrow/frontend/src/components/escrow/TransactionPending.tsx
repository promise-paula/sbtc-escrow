import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";

interface TransactionPendingProps {
  txId?: string;
  estimatedTime?: string;
  message?: string;
  onComplete?: () => void;
}

export function TransactionPending({
  txId,
  estimatedTime = "~2 min remaining",
  message = "Processing transaction...",
}: TransactionPendingProps) {
  return (
    <div className="flex flex-col items-center py-8 space-y-5">
      {/* Spinning ring with pulsing glow */}
      <div className="relative flex items-center justify-center">
        <motion.div
          animate={{ boxShadow: ["0 0 20px hsl(35 93% 54% / 0.15)", "0 0 40px hsl(35 93% 54% / 0.3)", "0 0 20px hsl(35 93% 54% / 0.15)"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="h-16 w-16 rounded-full"
        />
        <div className="absolute h-16 w-16 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
        <div className="absolute h-8 w-8 rounded-full bg-primary/10" />
      </div>

      {/* Message */}
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold">{message}</p>
        <p className="text-xs text-muted-foreground">{estimatedTime}</p>
      </div>

      {/* Transaction hash */}
      {txId && (
        <a
          href={`https://explorer.stacks.co/txid/${txId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-mono"
        >
          {txId.slice(0, 10)}...{txId.slice(-6)}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
