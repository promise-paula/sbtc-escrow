import React from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { WalletButton } from '@/components/shared/WalletButton';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-card px-4">
      <SidebarTrigger className="shrink-0" />
      <div className="flex-1" />
      <ThemeToggle />
      <WalletButton />
    </header>
  );
}
