import React from 'react';
import { NavLink } from '@/components/NavLink';
import { Home, LayoutDashboard, PlusCircle, List, BookOpen } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const items = [
  { title: 'Home', url: '/', icon: Home },
  { title: 'Board', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Create', url: '/create', icon: PlusCircle },
  { title: 'Escrows', url: '/escrows', icon: List },
  { title: 'Docs', url: '/docs', icon: BookOpen },
];

export function MobileNav() {
  const location = useLocation();

  return (
    <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t border-border bg-card">
      {items.map((item) => {
        const active = location.pathname === item.url;
        return (
          <NavLink
            key={item.url}
            to={item.url}
            end
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-muted-foreground transition-colors"
            activeClassName="text-primary"
          >
            <item.icon className="h-5 w-5" />
            <span className="text-xs font-medium">{item.title}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
