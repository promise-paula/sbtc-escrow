/**
 * Wallet Context - Stacks Wallet Integration
 * 
 * Provides wallet connection state and methods using @stacks/connect.
 * Uses the new connect/disconnect API (not the legacy showConnect).
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { connect, disconnect, isConnected as checkIsConnected } from '@stacks/connect';
import type { GetAddressesResult } from '@stacks/connect/dist/types/methods';
import { IS_MAINNET } from '@/lib/stacks-config';
import { toast } from 'sonner';

// Types for wallet addresses
interface WalletAddresses {
  stxAddress: string;
  btcAddress?: string;
}

interface WalletState {
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  addresses: WalletAddresses | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

const WalletContext = createContext<WalletState>({
  isConnected: false,
  isConnecting: false,
  address: null,
  addresses: null,
  connect: async () => {},
  disconnect: () => {},
  error: null,
});

// Storage key for persisting connection state
const WALLET_STORAGE_KEY = 'sbtc-escrow-wallet';

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [addresses, setAddresses] = useState<WalletAddresses | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if already connected on mount
  useEffect(() => {
    const checkConnection = () => {
      if (checkIsConnected()) {
        // Try to restore from localStorage
        const stored = localStorage.getItem(WALLET_STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setAddresses(parsed);
            setIsConnected(true);
          } catch {
            // Invalid stored data, clear it
            localStorage.removeItem(WALLET_STORAGE_KEY);
          }
        }
      }
    };
    checkConnection();
  }, []);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response: GetAddressesResult = await connect({
        // Force wallet selector to show even if already connected
        forceWalletSelect: false,
      });

      console.log('Wallet connected:', response);

      // Find the STX address based on network
      // response.addresses contains addresses for different purposes
      // Index 0: Payment (BTC), Index 1: Ordinals (BTC), Index 2: Stacks (STX)
      const stxAddressObj = response.addresses.find(
        (addr) => addr.symbol === 'STX'
      ) || response.addresses[2]; // Fallback to index 2 for Stacks

      if (!stxAddressObj) {
        throw new Error('No Stacks address found in wallet response');
      }

      const walletAddresses: WalletAddresses = {
        stxAddress: stxAddressObj.address,
        btcAddress: response.addresses[0]?.address,
      };

      // Validate address matches expected network
      const isTestnetAddress = walletAddresses.stxAddress.startsWith('ST');
      if (IS_MAINNET && isTestnetAddress) {
        const errorMsg = 'Please switch your wallet to mainnet';
        toast.error('Wrong Network', {
          description: errorMsg,
          duration: 6000,
        });
        throw new Error(errorMsg);
      }
      if (!IS_MAINNET && !isTestnetAddress) {
        const errorMsg = 'Mainnet wallet detected. Please switch to Stacks Testnet.';
        toast.error('Wrong Network', {
          description: 'This app only works with Testnet wallets. Please switch your wallet to Stacks Testnet and try again.',
          duration: 8000,
        });
        throw new Error(errorMsg);
      }

      setAddresses(walletAddresses);
      setIsConnected(true);

      // Persist to localStorage
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(walletAddresses));
    } catch (err) {
      console.error('Wallet connection error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
      setIsConnected(false);
      setAddresses(null);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setIsConnected(false);
    setAddresses(null);
    setError(null);
    localStorage.removeItem(WALLET_STORAGE_KEY);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        isConnecting,
        address: addresses?.stxAddress ?? null,
        addresses,
        connect: handleConnect,
        disconnect: handleDisconnect,
        error,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
