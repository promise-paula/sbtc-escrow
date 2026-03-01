import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, LayoutDashboard, Plus, Activity, Wallet, LogOut, ChevronDown, Menu, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { TestnetIndicator } from "./TestnetBanner";
import { AnimatePresence } from "framer-motion";
import { useWallet } from "@/contexts/WalletContext";
import { truncateAddress } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useActiveSection } from "@/hooks/use-active-section";
import { useFocusTrap } from "@/hooks/use-focus-trap";

const navLinks = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/create", label: "Create", icon: Plus },
  { to: "/activity", label: "Activity", icon: Activity },
];

const sectionLinks = [
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How It Works" },
  { id: "testimonials", label: "Testimonials" },
];

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isConnected, address, connect, disconnect } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  const walletDropdownRef = useRef<HTMLDivElement>(null);
  const isLanding = location.pathname === "/";

  useFocusTrap(menuDropdownRef, menuOpen);
  useFocusTrap(walletDropdownRef, walletOpen);
  const sectionIds = useMemo(() => sectionLinks.map((l) => l.id), []);
  const activeSection = useActiveSection(sectionIds, isLanding);

  const handleSectionClick = useCallback((sectionId: string) => {
    if (isLanding) {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate(`/#${sectionId}`);
    }
  }, [isLanding, navigate]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        menuButtonRef.current && !menuButtonRef.current.contains(target) &&
        menuDropdownRef.current && !menuDropdownRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!walletOpen && !menuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setWalletOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [walletOpen, menuOpen]);

  useEffect(() => {
    if (!walletOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (walletRef.current && !walletRef.current.contains(target)) {
        setWalletOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [walletOpen]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-surface-0/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            s<span className="text-primary">BTC</span> Escrow
          </span>
          <TestnetIndicator />
        </Link>

        {/* Nav Links — Desktop */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          {/* Section links */}
          {sectionLinks.map((link) => {
            const isActive = activeSection === link.id;
            return (
              <button
                key={link.id}
                onClick={() => handleSectionClick(link.id)}
                className={cn(
                  "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {link.label}
                {isActive && (
                  <motion.div
                    layoutId="section-indicator"
                    className="absolute inset-0 rounded-lg bg-accent"
                    style={{ zIndex: -1 }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}

          <div className="mx-2 h-4 w-px bg-border" />

          {/* App nav links */}
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
                {isActive && (
                  <motion.div
                    layoutId="navbar-indicator"
                    className="absolute inset-0 rounded-lg bg-accent"
                    style={{ zIndex: -1 }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            ref={menuButtonRef}
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Wallet */}
          <div className="relative" ref={walletRef}>
            {isConnected && address ? (
              <div>
                <button
                  onClick={() => setWalletOpen(!walletOpen)}
                  aria-label="Wallet menu"
                  aria-expanded={walletOpen}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-2"
                >
                  <div className="h-2 w-2 rounded-full bg-success" />
                  <span className="font-mono text-xs hidden sm:inline">{truncateAddress(address)}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
                {walletOpen && (
                  <motion.div
                    ref={walletDropdownRef}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border bg-card p-1 elevation-3"
                  >
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-xs text-muted-foreground">Connected</p>
                      <p className="font-mono text-xs mt-0.5">{truncateAddress(address, 8, 6)}</p>
                    </div>
                    <button
                      onClick={() => { disconnect(); setWalletOpen(false); }}
                      aria-label="Disconnect wallet"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-error hover:bg-accent transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Disconnect
                    </button>
                  </motion.div>
                )}
              </div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={connect}
                className="flex items-center gap-2 rounded-lg btn-gradient px-4 py-2 text-sm font-semibold transition-colors"
              >
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">Connect Wallet</span>
                <span className="sm:hidden">Connect</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="md:hidden overflow-hidden border-t border-border bg-surface-0"
            ref={menuDropdownRef}
          >
            <div className="px-4 py-3 space-y-1">
              {/* Section links */}
              {sectionLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => { handleSectionClick(link.id); setMenuOpen(false); }}
                  className={cn(
                    "flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    activeSection === link.id ? "text-primary bg-accent" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {link.label}
                </button>
              ))}

              <div className="my-2 h-px bg-border" />

              {/* App nav links */}
              {navLinks.map((link) => {
                const isActive = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "text-primary bg-accent" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLanding = location.pathname === "/";

  const handleSectionClick = useCallback((sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const sectionIds = useMemo(() => sectionLinks.map((l) => l.id), []);
  const activeSection = useActiveSection(sectionIds, isLanding);

  if (isLanding) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface-0/90 backdrop-blur-xl md:hidden" aria-label="Section navigation">
        <div className="flex items-center justify-around py-2">
          {sectionLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => handleSectionClick(link.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors",
                activeSection === link.id ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span className="text-[10px] font-medium">{link.label}</span>
            </button>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface-0/90 backdrop-blur-xl md:hidden" aria-label="App navigation">
      <div className="flex items-center justify-around py-2">
        {navLinks.map((link) => {
          const isActive = location.pathname === link.to;
          const isCreate = link.to === "/create";
          return (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                "flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
                isCreate && !isActive && "text-primary"
              )}
            >
              <link.icon className={cn("h-5 w-5", isCreate && "h-6 w-6")} />
              <span className="text-[10px] font-medium">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
