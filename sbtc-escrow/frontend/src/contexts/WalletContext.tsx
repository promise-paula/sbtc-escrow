import React, { createContext, useContext, useState, useCallback } from "react";
import { MOCK_WALLET_ADDRESS } from "@/lib/mock-data";

interface WalletState {
  isConnected: boolean;
  address: string | null;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  isConnected: false,
  address: null,
  connect: () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    setTimeout(() => setIsConnected(true), 600);
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        address: isConnected ? MOCK_WALLET_ADDRESS : null,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
