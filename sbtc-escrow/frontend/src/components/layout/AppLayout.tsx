import React from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { TestnetBanner } from './TestnetBanner';
import { IndexerHealthBanner } from '@/components/shared/IndexerHealthBanner';
import { Outlet, useLocation } from 'react-router-dom';
import { useEscrowRealtime } from '@/hooks/use-escrow-realtime';
import { motion, AnimatePresence } from 'framer-motion';
import { pageVariants } from '@/lib/motion';
import { Seo } from '@/components/shared/Seo';

// Tab titles for the authenticated app routes. These are all noindexed (they
// require a wallet and hold no crawlable content), so the title is for the
// browser tab, not search.
const APP_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/create': 'Create Escrow',
  '/escrows': 'My Escrows',
  '/activity': 'Activity',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
  '/admin': 'Admin',
  '/admin/disputes': 'Disputes',
  '/admin/controls': 'Contract Controls',
};

export function AppLayout() {
  useEscrowRealtime();
  const location = useLocation();
  const appTitle =
    APP_TITLES[location.pathname] ??
    (location.pathname.startsWith('/escrow/') ? 'Escrow' : 'App');

  return (
    <SidebarProvider>
      <Seo title={appTitle} noindex />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TestnetBanner />
          <Header />
          {/* Surface indexer health right below the header so a lagging
              chainhook is immediately visible on any authenticated page.
              Renders nothing in the healthy case. */}
          <div className="px-4 sm:px-6 pt-3">
            <IndexerHealthBanner />
          </div>
          {/* pb on mobile reserves space for the fixed MobileNav. The
              env(safe-area-inset-bottom) addition keeps content clear of
              the iPhone home-indicator gesture region (the same offset is
              applied to MobileNav itself, so the visible bar height stays
              4rem on devices without a notch). */}
          <main
            id="main-content"
            className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={location.key}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div><Outlet /></div>
              </motion.div>
            </AnimatePresence>
          </main>
          <MobileNav />
        </div>
      </div>
    </SidebarProvider>
  );
}
