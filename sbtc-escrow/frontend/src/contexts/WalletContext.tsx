import React, { createContext, useContext, useState, useCallback } from 'react';
import { MOCK_WALLET, mockConfig } from '@/lib/mock-data';

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  isAdmin: boolean;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  isAdmin: false,
  connect: () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  const connect = useCallback(() => {
    setAddress(MOCK_WALLET);
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, []);

  const isConnected = !!address;
  const isAdmin = address === mockConfig.owner;

  return (
    <WalletContext.Provider value={{ address, isConnected, isAdmin, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
