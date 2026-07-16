import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  connect as stacksConnect,
  disconnect as stacksDisconnect,
  isConnected as stacksIsConnected,
  getLocalStorage,
} from '@stacks/connect';
import { CONTRACT_ADDRESS, STACKS_NETWORK } from '@/lib/stacks-config';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAddressNetwork } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Terms acceptance (clickwrap). "By connecting you agree" in a document the
// user never saw is browsewrap and courts routinely refuse to enforce it; an
// explicit agree-and-connect step shown once at the moment of action is the
// enforceable form. Bump TERMS_VERSION only on MATERIAL changes to the Terms
// or Privacy Policy to re-prompt existing users.
const TERMS_VERSION = 1;
const TERMS_KEY = 'terms-accepted';

function hasAcceptedTerms(): boolean {
  try {
    const raw = localStorage.getItem(TERMS_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as { v?: number }).v === TERMS_VERSION;
  } catch {
    return false;
  }
}

function persistTermsAcceptance() {
  try {
    localStorage.setItem(TERMS_KEY, JSON.stringify({ v: TERMS_VERSION, at: new Date().toISOString() }));
  } catch {
    // Storage unavailable (private mode): proceed; the dialog will simply
    // show again next session, which is acceptable.
  }
}

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

function isWrongNetwork(addr: string | null): boolean {
  const detected = getAddressNetwork(addr);
  return detected !== null && detected !== STACKS_NETWORK;
}

function showWrongNetworkToast(addr: string) {
  const detected = getAddressNetwork(addr);
  if (!detected) return;
  const expected = STACKS_NETWORK === 'mainnet' ? 'Mainnet' : 'Testnet';
  const got = detected === 'mainnet' ? 'Mainnet' : 'Testnet';
  toast.error('Wrong network', {
    description: `This site is on ${expected}, but your wallet is on ${got}. Switch networks in your wallet and reconnect.`,
    duration: 10000,
  });
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(() => {
    if (!stacksIsConnected()) return null;
    const persisted = getPersistedAddress();
    return isWrongNetwork(persisted) ? null : persisted;
  });
  const [contractOwner, setContractOwner] = useState<string>(CONTRACT_ADDRESS);
  const ownerFetched = useRef(false);

  // If a stale persisted session was rejected for network mismatch, surface it
  // to the user once on mount and clear the stored connect state.
  useEffect(() => {
    if (!stacksIsConnected()) return;
    const persisted = getPersistedAddress();
    if (isWrongNetwork(persisted)) {
      stacksDisconnect();
      showWrongNetworkToast(persisted!);
    }
  }, []);

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

  const [termsGateOpen, setTermsGateOpen] = useState(false);

  const doConnect = useCallback(async () => {
    try {
      const response = await stacksConnect();

      // Wallet-agnostic: identify the Stacks address by prefix rather than
      // relying on a wallet-specific `symbol` field. Leather puts symbol:'STX'
      // on each entry; Xverse uses different shapes (purpose:'stacks' or no
      // marker at all). Either way, every Stacks address starts with ST/SP/SM/SN.
      const addresses = (response?.addresses ?? []) as Array<{ address?: string }>;
      const stxAddr =
        addresses.find((a) => typeof a?.address === 'string' && getAddressNetwork(a.address) !== null)
          ?.address ?? getPersistedAddress();

      if (isWrongNetwork(stxAddr)) {
        stacksDisconnect();
        showWrongNetworkToast(stxAddr!);
        return;
      }

      setAddress(stxAddr);
    } catch (err) {
      console.error('Wallet connection failed:', err);
      toast.error('Wallet connection failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  }, []);

  // Public connect: gate the first-ever connection behind explicit terms
  // acceptance; every later call goes straight through.
  const connect = useCallback(async () => {
    if (!hasAcceptedTerms()) {
      setTermsGateOpen(true);
      return;
    }
    await doConnect();
  }, [doConnect]);

  const acceptTermsAndConnect = useCallback(async () => {
    persistTermsAcceptance();
    setTermsGateOpen(false);
    await doConnect();
  }, [doConnect]);

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
      {/* Plain <a> links (not router <Link>): this provider mounts outside
          BrowserRouter, and a new tab keeps the connect flow in place. */}
      <AlertDialog open={termsGateOpen} onOpenChange={setTermsGateOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Before you connect</AlertDialogTitle>
            <AlertDialogDescription>
              sBTC Escrow is non-custodial software: your funds are held by an open-source smart
              contract, never by us. By connecting your wallet you agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Terms of Service</a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={acceptTermsAndConnect}>Agree and connect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
