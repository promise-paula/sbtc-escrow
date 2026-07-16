import { lazy, Suspense } from "react";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/contexts/WalletContext";
import { WalletAuthProvider } from "@/contexts/WalletAuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminGuard } from "@/components/shared/AdminGuard";
import { WalletGuard } from "@/components/shared/WalletGuard";
import { useEscrowNotifications } from "@/hooks/use-escrow-notifications";
import Landing from "@/pages/Landing";

function NotificationsListener() {
  useEscrowNotifications();
  return null;
}

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const CreateEscrow = lazy(() => import("@/pages/CreateEscrow"));
const MyEscrows = lazy(() => import("@/pages/MyEscrows"));
const EscrowDetail = lazy(() => import("@/pages/EscrowDetail"));
const Activity = lazy(() => import("@/pages/Activity"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Settings = lazy(() => import("@/pages/Settings"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const DisputeQueue = lazy(() => import("@/pages/admin/DisputeQueue"));
const ContractControls = lazy(() => import("@/pages/admin/ContractControls"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const DocsPage = lazy(() => import("@/pages/docs/DocsPage"));
const HowItWorks = lazy(() => import("@/pages/HowItWorks"));
const Privacy = lazy(() => import("@/pages/legal/Privacy"));
const Terms = lazy(() => import("@/pages/legal/Terms"));

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <WalletProvider>
        <WalletAuthProvider>
        <NotificationsListener />
        <TooltipProvider>
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={
              <div role="status" aria-label="Loading" className="flex items-center justify-center h-screen">
                <span className="sr-only">Loading…</span>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            }>
              {/* vercel.json rewrites are scoped to these exact paths (unknown
                  URLs get a real 404 from the edge) — a new route here needs a
                  matching rewrite entry there, or deep links to it will 404. */}
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/docs" element={<DocsPage />} />
                <Route path="/docs/*" element={<DocsPage />} />
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<WalletGuard><Dashboard /></WalletGuard>} />
                  <Route path="/create" element={<WalletGuard><CreateEscrow /></WalletGuard>} />
                  <Route path="/escrows" element={<WalletGuard><MyEscrows /></WalletGuard>} />
                  <Route path="/escrow/:id" element={<WalletGuard><EscrowDetail /></WalletGuard>} />
                  <Route path="/activity" element={<WalletGuard><Activity /></WalletGuard>} />
                  <Route path="/analytics" element={<AdminGuard><Analytics /></AdminGuard>} />
                  <Route path="/settings" element={<WalletGuard><Settings /></WalletGuard>} />
                  <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
                  <Route path="/admin/disputes" element={<AdminGuard><DisputeQueue /></AdminGuard>} />
                  <Route path="/admin/controls" element={<AdminGuard><ContractControls /></AdminGuard>} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
        </WalletAuthProvider>
      </WalletProvider>
    </ThemeProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
