import React, { useState, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { truncateAddress, getExplorerUrl, formatSTX, formatSBTC } from '@/lib/utils';
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
import { Wallet, Copy, ExternalLink, LogOut, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Balances {
  stx: number; // in micro-STX
  sbtc: number; // in sats
}

export function WalletButton() {
  const { address, isConnected, connect, disconnect } = useWallet();
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
          <div className="px-2 py-1.5 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">STX</span>
              <span className="font-mono font-medium">{formatSTX(balances.stx)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">sBTC</span>
              <span className="font-mono font-medium">{formatSBTC(balances.sbtc)}</span>
            </div>
          </div>
        ) : (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Unable to load balances
          </div>
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
        <DropdownMenuItem onClick={disconnect} className="gap-2 text-destructive">
          <LogOut className="h-3.5 w-3.5" /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
