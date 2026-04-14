import React, { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';
import { toast } from 'sonner';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isConnected } = useWallet();
  const denied = !isConnected || !isAdmin;
  const toasted = useRef(false);

  useEffect(() => {
    if (denied && !toasted.current) {
      toast.error('Access denied — admin only');
      toasted.current = true;
    }
  }, [denied]);

  if (denied) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
