import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/contexts/WalletContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminGuard } from "@/components/shared/AdminGuard";

const Landing = lazy(() => import("@/pages/Landing"));
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <WalletProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/create" element={<CreateEscrow />} />
                  <Route path="/escrows" element={<MyEscrows />} />
                  <Route path="/escrow/:id" element={<EscrowDetail />} />
                  <Route path="/activity" element={<Activity />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
                  <Route path="/admin/disputes" element={<AdminGuard><DisputeQueue /></AdminGuard>} />
                  <Route path="/admin/controls" element={<AdminGuard><ContractControls /></AdminGuard>} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </WalletProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
