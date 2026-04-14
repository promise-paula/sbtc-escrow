import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  connect as stacksConnect,
  disconnect as stacksDisconnect,
  isConnected as stacksIsConnected,
  getLocalStorage,
} from '@stacks/connect';
import { CONTRACT_ADDRESS } from '@/lib/stacks-config';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { toast } from 'sonner';

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
  const [contractOwner, setContractOwner] = useState<string>(CONTRACT_ADDRESS);
  const ownerFetched = useRef(false);

  // Fetch the actual contract owner from Supabase (survives ownership transfers)
  const fetchContractOwner = useCallback(() => {
    if (!isSupabaseConfigured) return;
    supabase
      .from('platform_config')
      .select('contract_owner')
      .eq('id', 1)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to fetch contract owner:', error.message);
          return;
        }
        if (data?.contract_owner) setContractOwner(data.contract_owner);
        ownerFetched.current = true;
      });
  }, []);

  useEffect(() => {
    fetchContractOwner();
  }, [fetchContractOwner]);

  // Re-fetch contract owner when address changes (e.g. reconnecting with a different wallet)
  useEffect(() => {
    if (address && ownerFetched.current) {
      fetchContractOwner();
    }
  }, [address, fetchContractOwner]);

  // Listen for platform_config changes via realtime
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel('wallet-owner-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_config' }, () => {
        fetchContractOwner();
      })
      .subscribe();
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [fetchContractOwner]);

  const connect = useCallback(async () => {
    try {
      const response = await stacksConnect();
      const stxAddr = response.addresses.find(
        (a) => a.symbol === 'STX',
      )?.address ?? null;
      setAddress(stxAddr);
    } catch (err) {
      console.error('Wallet connection failed:', err);
      toast.error('Wallet connection failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    stacksDisconnect();
    setAddress(null);
    setContractOwner(CONTRACT_ADDRESS);
    ownerFetched.current = false;
  }, []);

  const isConnected = !!address;
  const isAdmin = !!address && address === contractOwner;

  return (
    <WalletContext.Provider value={{ address, isConnected, isAdmin, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
