import React, { useState, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useWalletAuth } from '@/contexts/WalletAuthContext';
import { truncateAddress, getExplorerUrl, formatSTX, formatSBTC } from '@/lib/utils';
import { useUsdEstimate } from '@/hooks/use-usd-estimate';
import { TokenType } from '@/lib/types';
import { STACKS_API_URL, SBTC_CONTRACT } from '@/lib/stacks-config';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Wallet, Copy, ExternalLink, LogOut, Loader2, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

interface Balances {
  stx: number; // in micro-STX
  sbtc: number; // in sats
}

export function WalletButton() {
  const { address, isConnected, connect, disconnect } = useWallet();
  const { isAuthenticated, isSigningIn, signIn, signOut } = useWalletAuth();
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`${STACKS_API_URL}/extended/v1/address/${address}/balances`);
      if (!res.ok) throw new Error('Failed to fetch balances');
      const data = await res.json();
      const stx = Number(data.stx?.balance ?? 0);
      const [contractAddr, contractName] = SBTC_CONTRACT.split('.');
      const sbtcKey = `${contractAddr}.${contractName}::sbtc-token`;
      const sbtcAlt = `${contractAddr}.${contractName}::token`;
      const ftBalances = data.fungible_tokens ?? {};
      const sbtc = Number(
        ftBalances[sbtcKey]?.balance ?? ftBalances[sbtcAlt]?.balance ?? 0
      );
      setBalances({ stx, sbtc });
    } catch {
      setBalances(null);
    } finally {
      setLoading(false);
    }
  }, [address]);

  if (!isConnected) {
    return (
      <Button onClick={connect} size="sm" className="gap-2">
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  const handleCopy = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      toast.success('Address copied');
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) fetchBalances(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 font-mono text-xs">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          {truncateAddress(address!, 5)}
          {/* Tiny shield icon next to address — filled when auth-signed,
              outlined when wallet-connected but not signed in. Tells the
              user at a glance whether they can post messages / mark
              delivered / etc. without opening the dropdown. */}
          {isAuthenticated ? (
            <ShieldCheck className="h-3 w-3 text-success" aria-label="Signed in" />
          ) : (
            <ShieldOff className="h-3 w-3 text-muted-foreground" aria-label="Not signed in" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Balances
        </DropdownMenuLabel>
        {loading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : balances ? (
          <BalanceList stx={balances.stx} sbtc={balances.sbtc} />
        ) : (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Unable to load balances
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Account
        </DropdownMenuLabel>
        {/* Auth state row — the wallet-auth signature is separate from the
            wallet connection itself. Connecting proves nothing; signing in
            with a wallet signature is what unlocks message posting and
            authenticates the user to the off-chain layer. */}
        {isAuthenticated ? (
          <DropdownMenuItem onClick={signOut} className="gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            <span className="flex-1">Signed in</span>
            <span className="text-[10px] text-muted-foreground">Sign out</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={(e) => { e.preventDefault(); signIn(); }}
            disabled={isSigningIn}
            className="gap-2"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {isSigningIn ? 'Signing…' : 'Sign in to message'}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopy} className="gap-2">
          <Copy className="h-3.5 w-3.5" /> Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2">
          <a href={getExplorerUrl('address', address)} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> View in Explorer
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => { signOut(); disconnect(); }}
          className="gap-2 text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BalanceList({ stx, sbtc }: { stx: number; sbtc: number }) {
  const stxUsd = useUsdEstimate(stx, TokenType.STX);
  const sbtcUsd = useUsdEstimate(sbtc, TokenType.SBTC);
  return (
    <div className="px-2 py-1.5 space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">STX</span>
        <span className="font-mono font-medium">
          {formatSTX(stx)}
          {stxUsd && <span className="text-xs text-muted-foreground ml-1">({stxUsd})</span>}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">sBTC</span>
        <span className="font-mono font-medium">
          {formatSBTC(sbtc)}
          {sbtcUsd && <span className="text-xs text-muted-foreground ml-1">({sbtcUsd})</span>}
        </span>
      </div>
    </div>
  );
}
