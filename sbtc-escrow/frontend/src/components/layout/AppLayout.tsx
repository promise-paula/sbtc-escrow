import React from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { TestnetBanner } from './TestnetBanner';
import { Outlet, useLocation } from 'react-router-dom';
import { useEscrowRealtime } from '@/hooks/use-escrow-realtime';
import { motion, AnimatePresence } from 'framer-motion';
import { pageVariants } from '@/lib/motion';

export function AppLayout() {
  useEscrowRealtime();
  const location = useLocation();

  return (
    <SidebarProvider>
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
          <main id="main-content" className="flex-1 overflow-auto pb-16 md:pb-0">
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
