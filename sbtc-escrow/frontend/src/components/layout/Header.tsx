import React from 'react';
import { Link } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { WalletButton } from '@/components/shared/WalletButton';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Logo } from '@/components/shared/Logo';
import { Home } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-card px-4">
      <SidebarTrigger className="shrink-0" />
      <Link
        to="/"
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors md:hidden"
        aria-label="Back to home"
      >
        <Logo size="sm" className="text-accent-warm" />
      </Link>
      <div className="flex-1" />
      <Link
        to="/"
        className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1.5 hover:bg-accent/50"
        aria-label="Back to home"
      >
        <Home className="h-3.5 w-3.5" />
        <span>Home</span>
      </Link>
      <ThemeToggle />
      <WalletButton />
    </header>
  );
}
