import React from 'react';
import { Navigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';
import { toast } from 'sonner';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isConnected } = useWallet();

  if (!isConnected || !isAdmin) {
    toast.error('Access denied — admin only');
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
