import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AppConfig, showConnect, UserSession } from '@stacks/connect';
import { CONTRACT_ADDRESS } from '@/lib/stacks-config';

const appConfig = new AppConfig(['store_write']);
const userSession = new UserSession({ appConfig });

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  isAdmin: boolean;
  connect: () => void;
  disconnect: () => void;
  userSession: UserSession;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  isAdmin: false,
  connect: () => {},
  disconnect: () => {},
  userSession,
});

function getAddress(): string | null {
  if (!userSession.isUserSignedIn()) return null;
  const userData = userSession.loadUserData();
  return userData.profile?.stxAddress?.testnet ?? null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(getAddress);

  useEffect(() => {
    if (userSession.isSignInPending()) {
      userSession.handlePendingSignIn().then(() => {
        setAddress(getAddress());
      });
    }
  }, []);

  const connect = useCallback(() => {
    showConnect({
      appDetails: {
        name: 'sBTC Escrow',
        icon: window.location.origin + '/favicon.ico',
      },
      onFinish: () => {
        setAddress(getAddress());
      },
      userSession,
    });
  }, []);

  const disconnect = useCallback(() => {
    userSession.signUserOut();
    setAddress(null);
  }, []);

  const isConnected = !!address;
  const isAdmin = address === CONTRACT_ADDRESS;

  return (
    <WalletContext.Provider value={{ address, isConnected, isAdmin, connect, disconnect, userSession }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
