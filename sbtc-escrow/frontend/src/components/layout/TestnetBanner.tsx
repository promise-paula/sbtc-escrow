/**
 * Testnet Banner Component
 * 
 * Displays a persistent banner at the top of the app indicating testnet-only mode.
 * Shows additional warning when a mainnet wallet connection is detected.
 */

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Info, X } from "lucide-react";
import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { IS_MAINNET } from "@/lib/stacks-config";

export function TestnetBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { error } = useWallet();

  // Don't show on mainnet
  if (IS_MAINNET) return null;

  // Check if error is related to network mismatch
  const isNetworkError = error?.toLowerCase().includes('testnet') || 
                         error?.toLowerCase().includes('mainnet');

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative z-50"
        >
          {/* Main Testnet Notice */}
          <div className="bg-amber-500/10 border-b border-amber-500/20 backdrop-blur-sm">
            <div className="mx-auto max-w-7xl px-4 py-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20">
                    <Info className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                    <span className="text-sm font-medium text-amber-500">
                      Testnet Mode
                    </span>
                    <span className="text-xs text-muted-foreground sm:text-sm">
                      This app is running on Stacks Testnet. Use testnet STX only.
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setDismissed(true)}
                  className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-amber-500/20 transition-colors"
                  aria-label="Dismiss testnet notice"
                >
                  <X className="h-3.5 w-3.5 text-amber-500" />
                </button>
              </div>
            </div>
          </div>

          {/* Network Mismatch Error */}
          <AnimatePresence>
            {isNetworkError && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-destructive/10 border-b border-destructive/20"
              >
                <div className="mx-auto max-w-7xl px-4 py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/20">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <span className="text-sm font-medium text-destructive">
                        Wrong Network
                      </span>
                      <span className="text-xs text-muted-foreground sm:text-sm">
                        {error} — Please switch your wallet to Stacks Testnet and reconnect.
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Compact testnet indicator for mobile/navbar
 */
export function TestnetIndicator() {
  if (IS_MAINNET) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
      Testnet
    </span>
  );
}
