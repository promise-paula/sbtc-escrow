import React from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { useWallet } from '@/contexts/WalletContext';
import { useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  List,
  Activity,
  BarChart3,
  Settings,
  Shield,
  AlertTriangle,
  Sliders,
} from 'lucide-react';
import { Logo } from '@/components/shared/Logo';
import { Badge } from '@/components/ui/badge';
import { useDisputeCount } from '@/hooks/use-dispute-count';

const userItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Create Escrow', url: '/create', icon: PlusCircle },
  { title: 'My Escrows', url: '/escrows', icon: List },
  { title: 'Activity', url: '/activity', icon: Activity },
  { title: 'Analytics', url: '/analytics', icon: BarChart3 },
  { title: 'Settings', url: '/settings', icon: Settings },
];

const adminItems = [
  { title: 'Admin Dashboard', url: '/admin', icon: Shield },
  { title: 'Disputes', url: '/admin/disputes', icon: AlertTriangle },
  { title: 'Controls', url: '/admin/controls', icon: Sliders },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { isAdmin } = useWallet();
  const location = useLocation();
  const { count: disputeCount } = useDisputeCount();

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <NavLink to="/dashboard" className="flex items-center gap-2 no-underline">
          <Logo size="md" className="text-accent-warm shrink-0" />
          {!collapsed && (
            <span className="font-semibold text-foreground text-sm tracking-tight">
              sBTC Escrow
            </span>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">Navigation</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {userItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-accent/50"
                      activeClassName="bg-accent text-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">Admin</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => {
                  const showBadge = item.title === 'Disputes' && disputeCount > 0;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <NavLink
                          to={item.url}
                          end
                          className="hover:bg-accent/50 relative"
                          activeClassName="bg-accent text-foreground font-medium"
                        >
                          <div className="relative shrink-0">
                            <item.icon className="h-4 w-4" />
                            {showBadge && collapsed && (
                              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
                            )}
                          </div>
                          {!collapsed && (
                            <>
                              <span className="flex-1">{item.title}</span>
                              {showBadge && (
                                <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
                                  {disputeCount}
                                </Badge>
                              )}
                            </>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <p className="text-[10px] text-muted-foreground">
            v3.0.0 · Testnet
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
