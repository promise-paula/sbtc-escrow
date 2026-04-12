import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/contexts/WalletContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminGuard } from "@/components/shared/AdminGuard";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import CreateEscrow from "@/pages/CreateEscrow";
import MyEscrows from "@/pages/MyEscrows";
import EscrowDetail from "@/pages/EscrowDetail";
import Activity from "@/pages/Activity";
import Analytics from "@/pages/Analytics";
import Settings from "@/pages/Settings";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import DisputeQueue from "@/pages/admin/DisputeQueue";
import ContractControls from "@/pages/admin/ContractControls";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <WalletProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
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
          </BrowserRouter>
        </TooltipProvider>
      </WalletProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
