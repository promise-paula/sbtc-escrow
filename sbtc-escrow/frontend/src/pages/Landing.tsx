import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '@/contexts/WalletContext';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { dur } from '@/lib/motion';
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

const stats = [
  { value: '142', label: 'Escrows Created' },
  { value: '15,750 STX', label: 'Total Volume' },
  { value: '0.5%', label: 'Platform Fee' },
  { value: '30 days', label: 'Dispute Window' },
];

const security = [
  { icon: FileCheck, title: 'Clarity Smart Contract', desc: 'All escrow logic runs on-chain in a verified Clarity contract. Deterministic execution with no hidden behavior.' },
  { icon: Server, title: 'Non-Custodial Architecture', desc: 'Your keys never leave your wallet. The platform cannot move, freeze, or access your funds at any time.' },
  { icon: Timer, title: 'Dispute Timeout Hardened', desc: 'V3 contract enforces a 4,320-block (~30-day) dispute window with buyer self-recovery after timeout.' },
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

const previewRows = [
  { id: '#1042', amount: '50.00 STX', status: 'Pending', color: 'bg-status-pending' },
  { id: '#1041', amount: '150.00 STX', status: 'Released', color: 'bg-status-released' },
  { id: '#1040', amount: '25.00 STX', status: 'Refunded', color: 'bg-status-refunded' },
  { id: '#1039', amount: '500.00 STX', status: 'Disputed', color: 'bg-status-disputed' },
];

function DashboardPreview() {
  return (
    <div className="relative">
      {/* Floating badge */}
      <div className="absolute -top-3 -right-2 z-10">
        <Badge variant="outline" className="bg-background text-xs font-medium shadow-sm border-accent-warm/40 text-accent-warm">
          Live on Testnet
        </Badge>
      </div>

      <div
        aria-hidden="true"
        className="rounded-xl border border-border bg-card shadow-lg overflow-hidden select-none pointer-events-none"
      >
        {/* Mini stat bar */}
        <div className="grid grid-cols-3 gap-px bg-border">
          {[
            { v: '60.00 STX', l: 'Locked' },
            { v: '2', l: 'Active' },
            { v: '3', l: 'Completed' },
          ].map((s) => (
            <div key={s.l} className="bg-card px-4 py-3 text-center">
              <p className="font-mono text-sm font-semibold text-foreground">{s.v}</p>
              <p className="text-[11px] text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </div>

        {/* Table header */}
        <div className="grid grid-cols-3 px-4 py-2 text-[11px] font-medium text-muted-foreground border-t border-border bg-muted/40">
          <span>Escrow</span>
          <span>Amount</span>
          <span>Status</span>
        </div>

        {/* Rows */}
        {previewRows.map((r) => (
          <div key={r.id} className="grid grid-cols-3 items-center px-4 py-2.5 text-sm border-t border-border">
            <span className="font-mono text-xs text-foreground">{r.id}</span>
            <span className="font-mono text-xs text-foreground">{r.amount}</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${r.color}`} />
              {r.status}
            </span>
          </div>
        ))}
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
            <span className="font-semibold">sBTC Escrow</span>
          </div>

          <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
            <button onClick={() => scrollTo('features')} className="hover:text-foreground transition-colors">Features</button>
            <button onClick={() => scrollTo('security')} className="hover:text-foreground transition-colors">Security</button>
            <button onClick={() => scrollTo('how-it-works')} className="hover:text-foreground transition-colors">How it Works</button>
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
      <section className="max-w-6xl mx-auto px-4 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — copy */}
          <motion.div variants={heroLeftVariants} initial="hidden" animate="visible">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-warm" />
              Built on Stacks · Testnet Live
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.15]">
              Institutional-Grade Escrow&nbsp;for&nbsp;Bitcoin
            </h1>
            <p className="mt-4 text-base lg:text-lg text-muted-foreground max-w-lg leading-relaxed">
              Purpose-built smart contract infrastructure for secure, non-custodial escrow on Stacks. Trusted by teams managing digital asset transactions.
            </p>

            {/* Inline social proof */}
            <p className="mt-3 text-sm text-muted-foreground/70 font-mono">
              142 escrows created · 15,750 STX secured
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={{ duration: dur(100) }}>
                <Button size="lg" onClick={handleGetStarted} className="gap-2">
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
      <section className="border-y border-border bg-muted/30">
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
      <section id="features" className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-2xl font-bold text-foreground">Platform Features</h2>
        <p className="mt-2 text-muted-foreground max-w-lg">Everything you need to manage escrow transactions with confidence.</p>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <div className="inline-flex items-center justify-center rounded-md bg-muted p-2.5 mb-4">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it Works ───────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <h2 className="text-2xl font-bold text-foreground">How it Works</h2>
          <p className="mt-2 text-muted-foreground">Three steps from wallet to settlement.</p>

          <div className="mt-12 grid sm:grid-cols-3 gap-8 relative">
            <div className="hidden sm:block absolute top-6 left-[16.67%] right-[16.67%] h-px bg-border" aria-hidden="true" />

            {steps.map((s) => (
              <div key={s.num} className="relative text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full border-2 border-primary bg-background text-primary font-bold text-lg relative z-10">
                  {s.num}
                </div>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-14 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-5 text-center">
              <p className="text-xl font-bold font-mono text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Security ───────────────────────────────────────────── */}
      <section id="security" className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <h2 className="text-2xl font-bold text-foreground">Built for Security</h2>
          <p className="mt-2 text-muted-foreground max-w-lg">Enterprise-grade protections at every layer of the stack.</p>

          <div className="mt-10 grid sm:grid-cols-3 gap-5">
            {security.map((s) => (
              <div key={s.title} className="rounded-lg border border-border bg-background p-6">
                <s.icon className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/40">
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold text-foreground">Ready to get started?</h2>
          <p className="mt-2 text-muted-foreground">Create your first escrow in under a minute.</p>
          <Button size="lg" onClick={handleGetStarted} className="mt-6 gap-2">
            Launch App <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="text-center sm:text-left">sBTC Escrow v3.0.0 · Testnet</span>
          <div className="flex flex-wrap justify-center sm:justify-end gap-4">
            <a href="https://explorer.stacks.co" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Explorer</a>
            <button onClick={() => scrollTo('security')} className="hover:text-foreground transition-colors">Security</button>
            <a href="#" className="hover:text-foreground transition-colors">Docs</a>
            <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
