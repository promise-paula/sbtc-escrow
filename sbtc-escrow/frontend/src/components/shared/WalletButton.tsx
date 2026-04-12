import React from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { truncateAddress } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Wallet, Copy, ExternalLink, LogOut } from 'lucide-react';
import { toast } from 'sonner';

export function WalletButton() {
  const { address, isConnected, connect, disconnect } = useWallet();

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 font-mono text-xs">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          {truncateAddress(address!, 5)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleCopy} className="gap-2">
          <Copy className="h-3.5 w-3.5" /> Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2">
          <a href={`https://explorer.stacks.co/address/${address}?chain=testnet`} target="_blank" rel="noopener noreferrer">
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
