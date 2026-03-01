import { motion } from "framer-motion";
import { Shield } from "lucide-react";

export function FullPageLoader() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
    >
      {/* Spinning ring + logo */}
      <div className="relative flex items-center justify-center mb-6">
        {/* Spinning ring */}
        <div className="absolute h-20 w-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        {/* Logo icon */}
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
      </div>

      {/* Brand text */}
      <p className="text-lg font-bold tracking-tight">
        s<span className="text-primary">BTC</span> Escrow
      </p>
      <p className="text-xs text-muted-foreground mt-2">Secured by Bitcoin</p>
    </motion.div>
  );
}
