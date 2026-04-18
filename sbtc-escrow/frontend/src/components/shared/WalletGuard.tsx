import { Navigate, useLocation } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';

/**
 * Route guard that redirects unauthenticated users to the landing page.
 * Preserves the intended destination so the user can be redirected after connecting.
 */
export function WalletGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useWallet();
  const location = useLocation();

  if (!isConnected) {
    return <Navigate to="/" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
