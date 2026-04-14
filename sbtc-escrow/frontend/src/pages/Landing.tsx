import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useWallet } from '@/contexts/WalletContext';
import { STACKS_NETWORK } from '@/lib/stacks-config';
import { usePlatformStats } from '@/hooks/use-admin';
import { usePlatformConfig } from '@/hooks/use-admin';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { formatSTX, formatSBTC, formatAmount } from '@/lib/utils';
import { EscrowStatus, TokenType, STATUS_LABELS } from '@/lib/types';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { dur, revealVariants, staggerContainer } from '@/lib/motion';
import { Logo } from '@/components/shared/Logo';
import {
  Wallet, ArrowRight, Shield, Clock,
  Lock, Code, Activity, Scale, CalendarPlus, Users,
  FileCheck, Server, Timer,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Static data                                                       */
/* ------------------------------------------------------------------ */

const trustSignals = [
  { icon: Shield, label: 'Smart Contract Audited' },
  { icon: Lock, label: 'Non-Custodial' },
  { icon: Code, label: 'Open Source' },
  { icon: Activity, label: '99.9% Uptime' },
];

const features = [
  { icon: Shield, title: 'Trustless Settlement', desc: 'Funds held in a Clarity smart contract, released only when both parties agree.' },
  { icon: Scale, title: 'Dispute Resolution', desc: 'Built-in arbitration flow with configurable timeout windows.' },
  { icon: Clock, title: 'Auto-Refund on Expiry', desc: 'Buyer funds automatically return if the seller does not deliver within the agreed timeframe.' },
  { icon: CalendarPlus, title: 'Extend Deadlines', desc: 'Both parties can mutually agree to extend escrow deadlines without creating a new contract.' },
  { icon: Activity, title: 'Real-Time Monitoring', desc: 'Track escrow status, block confirmations, and dispute progress in real time.' },
  { icon: Users, title: 'Multi-Role Support', desc: 'Separate buyer, seller, and arbiter roles with granular permissions.' },
];

const steps = [
  { num: '1', title: 'Connect Wallet', desc: 'Link your Stacks wallet to authenticate and sign transactions.' },
  { num: '2', title: 'Create Escrow', desc: 'Lock funds with terms both parties agree to — amount, deadline, and description.' },
  { num: '3', title: 'Release or Resolve', desc: 'Funds release on mutual approval, auto-refund on expiry, or resolve via dispute.' },
];

const security = [
  { icon: FileCheck, title: 'Clarity Smart Contract', desc: 'All escrow logic runs on-chain in a verified Clarity contract. Deterministic execution with no hidden behavior.' },
  { icon: Server, title: 'Non-Custodial Architecture', desc: 'Your keys never leave your wallet. The platform cannot move, freeze, or access your funds at any time.' },
  { icon: Timer, title: 'Dispute Timeout Hardened', desc: 'V4 contract enforces a configurable dispute window with buyer self-recovery after timeout.' },
];



/* ------------------------------------------------------------------ */
/*  Animation variants                                                */
/* ------------------------------------------------------------------ */

const heroLeftVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: dur(500), ease: 'easeOut' as const } },
};

const heroRightVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: dur(500), delay: dur(200), ease: 'easeOut' as const } },
};

const trustItemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: dur(400) + i * dur(80), duration: dur(300), ease: 'easeOut' as const },
  }),
};

/* ------------------------------------------------------------------ */
/*  Dashboard Preview (decorative)                                    */
/* ------------------------------------------------------------------ */

const STATUS_COLOR: Record<number, string> = {
  [EscrowStatus.Pending]: 'bg-status-pending',
  [EscrowStatus.Released]: 'bg-status-released',
  [EscrowStatus.Refunded]: 'bg-status-refunded',
  [EscrowStatus.Disputed]: 'bg-status-disputed',
};

function useRecentEscrows() {
  return useQuery({
    queryKey: ['landing-recent-escrows'],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      const { data } = await supabase
        .from('escrows')
        .select('id, amount, status, token_type')
        .order('id', { ascending: false })
        .limit(4);
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

function DashboardPreview() {
  const { data: ps } = usePlatformStats();
  const { data: rows } = useRecentEscrows();

  const pending = ps?.totalEscrows
    ? ps.totalEscrows - ps.totalReleased - ps.totalRefunded - ps.activeDisputes
    : 0;
  const completed = ps ? ps.totalReleased + ps.totalRefunded : 0;

  return (
    <div className="relative">
      {/* Floating badge */}
      <div className="absolute -top-3 -right-2 z-10">
        <Badge variant="outline" className="bg-background text-xs font-medium shadow-sm border-accent-warm/40 text-accent-warm">
          Live on {STACKS_NETWORK === 'mainnet' ? 'Mainnet' : 'Testnet'}
        </Badge>
      </div>

      <div
        aria-hidden="true"
        className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-xl shadow-lg shadow-glow-sm overflow-hidden select-none pointer-events-none"
      >
        {/* Mini stat bar */}
        <div className="grid grid-cols-3 gap-px bg-border">
          {[
            { v: ps ? formatSTX(ps.totalVolumeStx) + ' STX' : '—', v2: ps && ps.totalVolumeSbtc > 0 ? formatSBTC(ps.totalVolumeSbtc) + ' sBTC' : null, l: 'Volume' },
            { v: `${pending + (ps?.activeDisputes ?? 0)}`, v2: null, l: 'Active' },
            { v: `${completed}`, v2: null, l: 'Completed' },
          ].map((s) => (
            <div key={s.l} className="bg-card px-4 py-3 text-center overflow-hidden">
              <p className="font-mono text-sm font-medium text-foreground truncate">{s.v}</p>
              {s.v2 && <p className="font-mono text-xs font-medium text-foreground truncate">{s.v2}</p>}
              <p className="text-xs text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </div>

        {/* Table header */}
        <div className="grid grid-cols-3 px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border bg-muted/40">
          <span>Escrow</span>
          <span>Amount</span>
          <span>Status</span>
        </div>

        {/* Rows */}
        {(rows ?? []).map((r) => (
          <div key={r.id} className="grid grid-cols-3 items-center px-4 py-2.5 text-sm border-t border-border">
            <span className="font-mono text-xs text-foreground">#{r.id}</span>
            <span className="font-mono text-xs text-foreground truncate">
              {formatAmount(r.amount, (r.token_type ?? 0) as TokenType)} {(r.token_type ?? 0) === 1 ? 'sBTC' : 'STX'}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[r.status] ?? 'bg-muted-foreground'}`} />
              {STATUS_LABELS[r.status as EscrowStatus] ?? 'Unknown'}
            </span>
          </div>
        ))}
        {(!rows || rows.length === 0) && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">No escrows yet</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Landing Page                                                      */
/* ------------------------------------------------------------------ */

export default function Landing() {
  const { connect, isConnected } = useWallet();
  const navigate = useNavigate();
  const { data: ps } = usePlatformStats();
  const { data: cfg } = usePlatformConfig();

  const handleGetStarted = () => {
    if (isConnected) {
      navigate('/dashboard');
    } else {
      connect();
      navigate('/dashboard');
    }
  };

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-background">
      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav aria-label="Main" className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <Logo size="sm" className="text-accent-warm" />
            <span className="font-bold tracking-tight">sBTC Escrow</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground">
            <button onClick={() => scrollTo('features')} className="hover:text-foreground transition-colors px-3 py-2 rounded-md">Features</button>
            <button onClick={() => scrollTo('security')} className="hover:text-foreground transition-colors px-3 py-2 rounded-md">Security</button>
            <button onClick={() => scrollTo('how-it-works')} className="hover:text-foreground transition-colors px-3 py-2 rounded-md">How it Works</button>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isConnected ? (
              <Button size="sm" onClick={() => navigate('/dashboard')}>Dashboard</Button>
            ) : (
              <Button size="sm" onClick={connect} className="gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> Connect Wallet
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-14 lg:py-20" style={{ background: 'var(--gradient-hero)' }}>
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left — copy */}
          <motion.div variants={heroLeftVariants} initial="hidden" animate="visible">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-warm" />
              Built on Stacks · {STACKS_NETWORK === 'mainnet' ? 'Mainnet' : 'Testnet'} Live
            </div>

            <h1 className="font-bold tracking-tight text-foreground leading-[1.1]" style={{ fontSize: 'clamp(1.875rem, 1.2rem + 2.5vw, 3.75rem)' }}>
              Institutional-Grade Escrow&nbsp;for&nbsp;Bitcoin
            </h1>
            <p className="mt-4 text-base lg:text-lg text-muted-foreground max-w-lg leading-relaxed">
              Non-custodial smart contract escrow on Stacks. Lock, release, or dispute — all on-chain.
            </p>

            {/* Inline social proof */}
            <p className="mt-3 text-sm text-muted-foreground/70 font-mono">
              {ps?.totalEscrows ?? 0} escrows created · {formatSTX(ps?.totalVolumeStx ?? 0)} STX{(ps?.totalVolumeSbtc ?? 0) > 0 ? ` + ${formatSBTC(ps.totalVolumeSbtc)} sBTC` : ''} secured
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <motion.div whileHover={{ scale: 1.03 }} transition={{ duration: dur(100) }}>
                <Button size="lg" onClick={handleGetStarted} className="gap-2 shadow-glow-md hover:shadow-glow-lg transition-shadow">
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
              <Button size="lg" variant="outline" onClick={() => scrollTo('how-it-works')}>
                How it Works
              </Button>
            </div>
          </motion.div>

          {/* Right — dashboard preview */}
          <motion.div variants={heroRightVariants} initial="hidden" animate="visible" className="lg:pl-4">
            <DashboardPreview />
          </motion.div>
        </div>
      </section>

      {/* ── Trust Bar ──────────────────────────────────────────── */}
      <section className="border-y border-border bg-surface-2">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-wrap justify-center gap-x-10 gap-y-3">
          {trustSignals.map((t, i) => (
            <motion.div
              key={t.label}
              custom={i}
              variants={trustItemVariants}
              initial="hidden"
              animate="visible"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <t.icon className="h-4 w-4 text-primary" />
              <span>{t.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section id="features" className="max-w-6xl mx-auto px-4 pt-16 pb-24">
        <motion.div variants={revealVariants} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.2 }}>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Platform Features</h2>
          <p className="mt-3 text-muted-foreground max-w-lg">Everything you need to manage escrow transactions with confidence.</p>
        </motion.div>

        <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.1 }} className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={revealVariants}
              className="rounded-lg border border-border/60 bg-surface-1 p-6 transition-all hover:shadow-glow-sm hover:border-primary/20"
            >
              <div className="inline-flex items-center justify-center rounded-md bg-muted p-2.5 mb-5">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-bold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── How it Works ───────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-border bg-surface-2">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24">
          <motion.div variants={revealVariants} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.3 }}>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">How it Works</h2>
            <p className="mt-3 text-muted-foreground">Three steps from wallet to settlement.</p>
          </motion.div>

          <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.2 }} className="mt-14 grid sm:grid-cols-3 gap-10 relative">
            <div className="hidden sm:block absolute top-6 left-[16.67%] right-[16.67%] h-px bg-border" aria-hidden="true" />

            {steps.map((s) => (
              <motion.div key={s.num} variants={revealVariants} className="relative text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full border-2 border-primary bg-background text-primary font-bold font-mono text-lg relative z-10 shadow-glow-sm">
                  {s.num}
                </div>
                <h3 className="mt-5 text-base font-bold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.2 }} className="max-w-6xl mx-auto px-4 py-20 grid grid-cols-2 sm:grid-cols-4 gap-5">
          {[
            { value: (ps?.totalEscrows ?? 0).toLocaleString(), value2: null, label: 'Escrows Created' },
            { value: formatSTX(ps?.totalVolumeStx ?? 0) + ' STX', value2: (ps?.totalVolumeSbtc ?? 0) > 0 ? formatSBTC(ps.totalVolumeSbtc) + ' sBTC' : null, label: 'Total Volume' },
            { value: `${((cfg?.platformFeeBps ?? 50) / 100).toFixed(1)}%`, value2: null, label: 'Platform Fee' },
            { value: `${Math.round((cfg?.disputeTimeout ?? 4320) / 144)} days`, value2: null, label: 'Dispute Window' },
          ].map((s) => (
            <motion.div key={s.label} variants={revealVariants} className="rounded-lg border border-border/50 bg-card/60 backdrop-blur-sm p-4 sm:p-5 text-center overflow-hidden">
              <p className="text-lg sm:text-2xl font-bold font-mono text-foreground tracking-tight truncate">{s.value}</p>
              {s.value2 && <p className="text-sm font-mono font-medium text-foreground truncate">{s.value2}</p>}
              <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Security ───────────────────────────────────────────── */}
      <section id="security" className="border-t border-border bg-surface-2">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24">
          <motion.div variants={revealVariants} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.3 }}>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Built for Security</h2>
            <p className="mt-3 text-muted-foreground max-w-lg">Enterprise-grade protections at every layer of the stack.</p>
          </motion.div>

          <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.1 }} className="mt-14 grid sm:grid-cols-3 gap-6">
            {security.map((s) => (
              <motion.div key={s.title} variants={revealVariants} className="rounded-lg border border-border/60 bg-surface-1 p-5 sm:p-7 transition-all hover:shadow-glow-sm hover:border-primary/20">
                <s.icon className="h-6 w-6 text-primary mb-5" />
                <h3 className="text-base font-bold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-surface-2">
        <motion.div variants={revealVariants} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.5 }} className="max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Ready to get started?</h2>
          <p className="mt-3 text-muted-foreground">Create your first escrow in under a minute.</p>
          <Button size="lg" onClick={handleGetStarted} className="mt-8 gap-2 shadow-glow-md hover:shadow-glow-lg transition-shadow">
            Launch App <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="text-center sm:text-left">sBTC Escrow v4.0.0 · {STACKS_NETWORK === 'mainnet' ? 'Mainnet' : 'Testnet'}</span>
          <div className="flex flex-wrap justify-center sm:justify-end gap-4">
            <a href="https://explorer.stacks.co" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Explorer</a>
            <button onClick={() => scrollTo('security')} className="hover:text-foreground transition-colors">Security</button>
            <a href="https://github.com/promise-paula/sbtc-escrow#readme" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Docs</a>
            <a href="https://github.com/promise-paula/sbtc-escrow" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
