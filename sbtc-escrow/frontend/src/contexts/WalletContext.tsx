import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  connect as stacksConnect,
  disconnect as stacksDisconnect,
  isConnected as stacksIsConnected,
  getLocalStorage,
} from '@stacks/connect';
import { CONTRACT_ADDRESS } from '@/lib/stacks-config';

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  isAdmin: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  isAdmin: false,
  connect: async () => {},
  disconnect: () => {},
});

function getPersistedAddress(): string | null {
  const stored = getLocalStorage();
  return stored?.addresses?.stx?.[0]?.address ?? null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(() => {
    if (stacksIsConnected()) return getPersistedAddress();
    return null;
  });

  useEffect(() => {
    if (stacksIsConnected()) {
      setAddress(getPersistedAddress());
    }
  }, []);

  const connect = useCallback(async () => {
    const response = await stacksConnect();
    const stxAddr = response.addresses.find(
      (a) => a.symbol === 'STX',
    )?.address ?? null;
    setAddress(stxAddr);
  }, []);

  const disconnect = useCallback(() => {
    stacksDisconnect();
    setAddress(null);
  }, []);

  const isConnected = !!address;
  const isAdmin = address === CONTRACT_ADDRESS;

  return (
    <WalletContext.Provider value={{ address, isConnected, isAdmin, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
