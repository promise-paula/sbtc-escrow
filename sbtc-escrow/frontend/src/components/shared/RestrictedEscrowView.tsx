import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { cardVariants, pageVariants } from '@/lib/motion';
import { getExplorerUrl } from '@/lib/utils';
import { CONTRACT_PRINCIPAL } from '@/lib/stacks-config';
import type { Escrow } from '@/lib/types';

interface RestrictedEscrowViewProps {
  escrow: Escrow;
}

/**
 * Shown when the connected wallet is neither buyer nor seller (and not admin).
 *
 * All escrow data is public on-chain, so this is UX/expectation-setting rather
 * than security — the goal is to make casual `/escrow/<n>` probing feel like
 * "not your escrow" while still allowing a legitimately-shared link to render
 * something useful. Off-chain context (description, dispute reasons, delivery
 * messages) is intentionally omitted.
 */
export function RestrictedEscrowView({ escrow }: RestrictedEscrowViewProps) {
  const navigate = useNavigate();
  const contractExplorerUrl = getExplorerUrl('address', CONTRACT_PRINCIPAL);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <motion.div variants={pageVariants} initial="initial" animate="animate">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </button>
      </motion.div>

      <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
        <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
          <Lock className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">You are not a party to this escrow</p>
            <p className="text-xs text-muted-foreground">
              Only the buyer and seller can see full details and take actions. Public on-chain
              information is shown below.
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <span className="text-2xl font-bold font-mono text-foreground tracking-tight">
                #{escrow.id}
              </span>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                <AmountDisplay micro={escrow.amount} tokenType={escrow.tokenType} className="text-lg" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={escrow.status} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Buyer</p>
                <AddressDisplay address={escrow.buyer} />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Seller</p>
                <AddressDisplay address={escrow.seller} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
        <p className="text-xs text-muted-foreground text-center">
          All escrow records are publicly readable on the Stacks blockchain.{' '}
          <a
            href={contractExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            View contract on explorer <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </motion.div>

      <div className="flex justify-center">
        <Button variant="outline" onClick={() => navigate('/escrows')}>
          Go to My Escrows
        </Button>
      </div>
    </div>
  );
}
