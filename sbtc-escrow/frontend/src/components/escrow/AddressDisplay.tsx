import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, ExternalLink } from "lucide-react";
import { truncateAddress } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface AddressDisplayProps {
  address: string;
  className?: string;
  showExplorer?: boolean;
}

export function AddressDisplay({ address, className, showExplorer = true }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="font-mono text-sm text-muted-foreground">{truncateAddress(address)}</span>
      <button onClick={handleCopy} className="relative p-1 rounded hover:bg-accent transition-colors">
        <AnimatePresence mode="wait">
          {copied ? (
            <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
              <Check className="h-3.5 w-3.5 text-success" />
            </motion.div>
          ) : (
            <motion.div key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>
      {showExplorer && (
        <a href={`https://explorer.stacks.co/address/${address}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-accent transition-colors">
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      )}
    </div>
  );
}
