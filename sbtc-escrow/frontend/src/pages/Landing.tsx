import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useWallet } from '@/contexts/WalletContext';
import { STACKS_NETWORK, DEFAULT_DISPUTE_TIMEOUT, DEFAULT_MINUTES_PER_BLOCK, REPO_URL } from '@/lib/stacks-config';
import { usePlatformStats } from '@/hooks/use-admin';
import { usePlatformConfig } from '@/hooks/use-admin';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { formatSTX, formatSBTC, formatAmount, relativeTime } from '@/lib/utils';
import { useBlockRate } from '@/hooks/use-block-rate';
import { EscrowStatus, TokenType, STATUS_LABELS } from '@/lib/types';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { dur, revealVariants, staggerContainer } from '@/lib/motion';
import { Logo } from '@/components/shared/Logo';
import { Seo } from '@/components/shared/Seo';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Wallet, ArrowRight, Shield, Clock,
  Activity, Scale, CalendarPlus, Users,
  Timer, Percent,
  Menu,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Static data                                                       */
/* ------------------------------------------------------------------ */

// Use cases shown as a quiet inline line in the hero. Tells a first-time
// visitor "is this for me" without adding visual weight. These are real
// scenarios the contract handles natively — no aspiration in this list.
const useCases = [
  'Freelance milestones',
  'OTC trades',
  'DAO grants',
  'Marketplace settlements',
];

// `accent: 'violet'` flips an icon to accent-violet — used sparingly on
// 2 of 6 features so the grid has a two-color rhythm instead of monotone
// orange. Picked Dispute Resolution + Multi-Role Support because those
// are the "branching" features (not the primary release-on-agreement path),
// so the visual variance maps to the conceptual variance.
// Feature descriptions are intentionally precise about WHO acts and WHEN.
// "Auto-refund on expiry" is misleading — the contract doesn't run anything
// automatically; the buyer must call refund() once the deadline passes.
// "Both parties agree to extend" is misleading — only the buyer (or v3
// beneficiary) can extend. We say what the contract actually does.
const features = [
  { icon: Shield, title: 'Trustless settlement', desc: 'Funds locked in a Clarity smart contract. Release follows the rules in the contract, with no platform discretion.' },
  { icon: Scale, title: 'Dispute resolution', desc: 'Either party can open a dispute. Admin arbitrates within a configurable timeout window.', accent: 'violet' as const },
  { icon: Clock, title: 'Refund after expiry', desc: "Once the deadline passes, the buyer can claim a refund directly from the contract. No waiting on the seller's signature." },
  { icon: CalendarPlus, title: 'Extend the deadline', desc: 'The buyer can push the deadline forward at any time before expiry. No new escrow needed.' },
  { icon: Activity, title: 'Live on-chain status', desc: 'Escrow state, block confirmations, and dispute progress update in real time as the chain advances.' },
  { icon: Users, title: 'Multi-party roles', desc: 'Buyer, seller, and an optional beneficiary with buyer-equivalent rights, each role scoped on-chain.', accent: 'violet' as const },
];

// Two-digit mono indices to match the `01–06` ledger numbering in the
// Features section — one numbering dialect across the whole page.
const steps = [
  { num: '01', title: 'Connect wallet', desc: 'Sign in with your Stacks wallet: Leather, Xverse, or any compatible wallet.' },
  { num: '02', title: 'Create escrow', desc: 'Pick the seller, amount, deadline, and a short description. Funds lock on-chain when you sign.' },
  { num: '03', title: 'Release or refund', desc: "Release when you're satisfied with the work, refund yourself after expiry, or open a dispute if something goes wrong." },
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

/* ------------------------------------------------------------------ */
/*  Dashboard Preview (decorative)                                    */
/* ------------------------------------------------------------------ */

const STATUS_COLOR: Record<number, string> = {
  [EscrowStatus.Pending]: 'bg-status-pending',
  [EscrowStatus.Delivered]: 'bg-status-delivered',
  [EscrowStatus.Released]: 'bg-status-released',
  [EscrowStatus.Refunded]: 'bg-status-refunded',
  [EscrowStatus.Disputed]: 'bg-status-disputed',
};

function useRecentEscrows() {
  return useQuery({
    queryKey: ['landing-recent-escrows'],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      // Order by `indexed_at` (DB wall-clock when the chainhook recorded the
      // create event) rather than `created_at_block`. Block numbers are
      // mixed-clock across contract versions — v3+ stores burn blocks
      // (~178,000) while legacy v2/v7 store Stacks blocks (~3,998,000), so
      // a numeric DESC on created_at_block puts every legacy escrow ahead
      // of every v3 escrow regardless of when they actually happened. The
      // landing page used to show only "Released" because the 4 entries
      // that won the numeric race all happened to be old legacy ones.
      const { data } = await supabase
        .from('escrows')
        .select('id, contract_id, amount, status, token_type, created_at_block, indexed_at')
        .order('indexed_at', { ascending: false })
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
      <div
        aria-hidden="true"
        className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-xl shadow-lg shadow-glow-sm overflow-hidden select-none pointer-events-none"
      >
        {/* Window header — an integrated live indicator (replacing the old
            floating "Live" sticker) that frames the preview as a live feed of
            real escrows. Deliberately no contract principal or version here:
            that's technical noise for a first-time visitor and would advertise
            version churn. The mono voice ties it to the `;;`/ledger identity. */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-status-released animate-pulse" />
            <span className="text-foreground">Live escrows</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground">{STACKS_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'}</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">on-chain</span>
        </div>

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

        {/* Table header — Created (relative time) replaces the numeric #id
            column, which is a technical identifier that has no meaning to a
            casual landing-page visitor. The id still lives in the URL and the
            in-app My Escrows list for users who own escrows. */}
        <div className="grid grid-cols-3 px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border bg-muted/40">
          <span>Created</span>
          <span>Amount</span>
          <span>Status</span>
        </div>

        {/* Rows */}
        {(rows ?? []).map((r) => {
          // Use composite key — escrow ids collide across contract versions.
          const rowKey = `${r.contract_id}/${r.id}`;
          return (
            <div key={rowKey} className="grid grid-cols-3 items-center px-4 py-2.5 text-sm border-t border-border">
              <span className="text-xs text-foreground">
                {r.indexed_at ? relativeTime(r.indexed_at) : '—'}
              </span>
              <span className="font-mono text-xs text-foreground truncate">
                {formatAmount(r.amount, (r.token_type ?? 0) as TokenType)} {(r.token_type ?? 0) === 1 ? 'sBTC' : 'STX'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[r.status] ?? 'bg-muted-foreground'}`} />
                {STATUS_LABELS[r.status as EscrowStatus] ?? 'Unknown'}
              </span>
            </div>
          );
        })}
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
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? 1.5;

  const location = useLocation();
  const destination = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  // Track which in-page section is in view so the nav can mark it active.
  // Only the two anchor sections (features, faq) matter — How it Works and
  // Docs are separate routes. rootMargin shrinks the observation band to
  // the middle ~5% of the viewport, so the underline only switches once
  // a section is firmly in focus instead of flickering as you scroll past edges.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  useEffect(() => {
    const ids = ['features', 'faq'];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection(e.target.id);
        });
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const handleGetStarted = async () => {
    if (isConnected) {
      navigate(destination);
    } else {
      try {
        await connect();
        navigate(destination);
      } catch {
        // User cancelled or connection failed — stay on landing
      }
    }
  };

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="sBTC Escrow | Trustless Escrow on Bitcoin"
        description="Lock STX or sBTC in a smart contract that releases only when both sides agree, or refunds if they don't. Non-custodial escrow on Bitcoin, 0.5% flat."
        path="/"
      />
      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav aria-label="Main" className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <Logo size="sm" className="text-accent-warm" />
            <span className="font-bold tracking-tight">sBTC Escrow</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground">
            <button onClick={() => navigate('/how-it-works')} className="hover:text-foreground transition-colors px-3 py-2 rounded-md">How it Works</button>
            <button
              onClick={() => scrollTo('features')}
              className={`relative hover:text-foreground transition-colors px-3 py-2 rounded-md ${activeSection === 'features' ? 'text-foreground' : ''}`}
            >
              Features
              {activeSection === 'features' && (
                <motion.span
                  layoutId="navActiveIndicator"
                  aria-hidden="true"
                  className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full bg-accent-warm"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
            <button
              onClick={() => scrollTo('faq')}
              className={`relative hover:text-foreground transition-colors px-3 py-2 rounded-md ${activeSection === 'faq' ? 'text-foreground' : ''}`}
            >
              FAQ
              {activeSection === 'faq' && (
                <motion.span
                  layoutId="navActiveIndicator"
                  aria-hidden="true"
                  className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full bg-accent-warm"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
            <button onClick={() => navigate('/docs')} className="hover:text-foreground transition-colors px-3 py-2 rounded-md">Docs</button>
          </div>

          <div className="sm:hidden flex items-center gap-2">
            <ThemeToggle />
            {isConnected ? (
              <Button size="sm" onClick={() => navigate('/dashboard')}>Dashboard</Button>
            ) : (
              <Button size="sm" onClick={connect} className="gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> Connect
              </Button>
            )}
            {/* Mobile menu — exposes the same section anchors the desktop nav
                has (How it Works / Features / Security / Docs). Previously
                only "Docs" was reachable on phones; visitors had to scroll
                the entire page to find anything. */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu" className="min-h-[44px] min-w-[44px]">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 flex flex-col gap-1 pt-12">
                <SheetTitle className="sr-only">Site navigation</SheetTitle>
                <SheetDescription className="sr-only">Jump to a section of the landing page or open the docs.</SheetDescription>
                <button onClick={() => navigate('/how-it-works')} className="text-left px-3 py-3 rounded-md hover:bg-muted text-base">How it Works</button>
                <button onClick={() => scrollTo('features')} className="text-left px-3 py-3 rounded-md hover:bg-muted text-base">Features</button>
                <button onClick={() => scrollTo('faq')} className="text-left px-3 py-3 rounded-md hover:bg-muted text-base">FAQ</button>
                <button onClick={() => navigate('/docs')} className="text-left px-3 py-3 rounded-md hover:bg-muted text-base">Docs</button>
              </SheetContent>
            </Sheet>
          </div>
          <div className="hidden sm:flex items-center gap-2">
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
      {/* Hero claims the visible viewport (minus the 4rem sticky nav) so
          the first scroll reveals a clean break into the Features section.
          On phones we let it auto-size so the headline + DashboardPreview
          stack without forcing a min-height that would push the preview
          below the fold. */}
      <section style={{ background: 'var(--gradient-hero)' }} className="relative overflow-hidden lg:min-h-[calc(100svh-4rem)] flex items-center">
        {/* Faint ledger grid — reads as the graph-paper a contract is drafted
            on. Masked to fade out so it's depth, not decoration. Kept very low
            opacity so it never competes with the copy. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(to right, oklch(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, oklch(var(--border)) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 75% 65% at 50% 35%, black 10%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 35%, black 10%, transparent 72%)',
          }}
        />
        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left — copy */}
          <motion.div variants={heroLeftVariants} initial="hidden" animate="visible">
            {/* Value-led headline: tells a first-time visitor what the product
                DOES, in plain words (no "trustless"/"non-custodial" jargon up
                top). The 0.5% anchor moves out of the headline into the proof
                line below, where it stays loud but supports the value instead
                of leading with price. */}
            <h1 className="font-bold tracking-tight text-foreground leading-[1.05] text-balance" style={{ fontSize: 'clamp(2.25rem, 1.2rem + 3vw, 4.5rem)' }}>
              Lock the payment until the deal is done.
            </h1>
            <p className="mt-5 text-base lg:text-lg text-muted-foreground max-w-lg leading-relaxed">
              Put STX or sBTC in a smart contract that releases only when both sides agree, or refunds if they don't. No middleman ever holds your funds.
            </p>

            {/* Proof line — the 0.5% anchor, kept as the eye's bright stop
                (font-black + accent-warm, the original anchor weight) but now
                supporting the value above rather than being the headline. */}
            <div className="mt-6 flex items-baseline flex-wrap gap-x-3 gap-y-1 text-sm sm:text-base text-muted-foreground">
              <span className="text-3xl lg:text-4xl font-black text-accent-warm tracking-tight leading-none">0.5%</span>
              <span>flat, charged only on release.</span>
              <span aria-hidden="true" className="text-muted-foreground/40">·</span>
              <span>Non-custodial.</span>
            </div>

            {/* Inline social proof — only show once we have data */}
            {(ps?.totalEscrows ?? 0) > 0 && (
              <p className="mt-3 text-sm text-muted-foreground/70 font-mono">
                {ps!.totalEscrows.toLocaleString()} escrows created · {formatSTX(ps!.totalVolumeStx)} STX{(ps!.totalVolumeSbtc ?? 0) > 0 ? ` + ${formatSBTC(ps!.totalVolumeSbtc)} sBTC` : ''} secured
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <motion.div whileHover={{ scale: 1.03 }} transition={{ duration: dur(100) }}>
                <Button size="lg" onClick={handleGetStarted} className="gap-2 shadow-glow-md hover:shadow-glow-lg transition-shadow">
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
              <Button size="lg" variant="outline" onClick={() => navigate('/docs')} className="gap-2">
                Read the Docs <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Use-case footnote. Concrete scenarios so a visitor can
                self-identify in one glance. Kept quiet — small text, no
                chips, dot-separated — so it doesn't compete with the CTAs. */}
            <p className="mt-6 text-xs text-muted-foreground/70">
              Built for{' '}
              {useCases.map((label, i) => (
                <React.Fragment key={label}>
                  {label}
                  {i < useCases.length - 1 && <span aria-hidden="true"> · </span>}
                </React.Fragment>
              ))}
            </p>
          </motion.div>

          {/* Right — dashboard preview */}
          <motion.div variants={heroRightVariants} initial="hidden" animate="visible" className="lg:pl-4">
            <DashboardPreview />
          </motion.div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      {/* Editorial enumerated layout rather than an identical 6-card grid.
          These six are the contract's terms — what it actually enforces —
          so reading them as a numbered ledger of clauses (left heading rail,
          right enumerated rows split by hairlines) is both more distinctive
          and more honest than six interchangeable cards. */}
      <section id="features" className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-20 sm:py-28 grid lg:grid-cols-12 gap-y-12 gap-x-10 lg:gap-x-16">
          {/* Left — heading rail. Sticks alongside the list on wide screens. */}
          <motion.div
            variants={revealVariants}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.3 }}
            className="lg:col-span-4 lg:sticky lg:top-24 self-start"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight text-balance">What the contract does</h2>
            <p className="mt-4 text-base text-muted-foreground leading-relaxed text-pretty">
              Six guarantees, each enforced on-chain by Clarity, not by us. No platform discretion sits between you and your funds.
            </p>
          </motion.div>

          {/* Right — enumerated terms. Each row is a ledger line: index, icon,
              title, description, divided by a hairline from the one above. */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.1 }}
            className="lg:col-span-8"
          >
            {features.map((f, i) => {
              const isViolet = f.accent === 'violet';
              return (
                <motion.div
                  key={f.title}
                  variants={revealVariants}
                  className="group grid grid-cols-[2.5rem_1fr] sm:grid-cols-[3rem_1fr] gap-x-3 sm:gap-x-6 py-6 border-t border-border/70 first:border-t-0 transition-colors duration-200"
                >
                  {/* Index + icon stack — the "line number" of the clause */}
                  <div className="flex flex-col items-center gap-3 pt-1">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground/50 group-hover:text-primary/80 transition-colors">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={`inline-flex items-center justify-center rounded-md p-2 transition-colors ${isViolet ? 'bg-accent-violet/10 group-hover:bg-accent-violet/15' : 'bg-primary/10 group-hover:bg-primary/15'}`}>
                      <f.icon className={`h-5 w-5 ${isViolet ? 'text-accent-violet' : 'text-primary'}`} />
                    </span>
                  </div>
                  <div className="pt-0.5">
                    <h3 className="text-base sm:text-lg font-bold text-foreground tracking-tight">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed max-w-xl text-pretty">{f.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ── How it Works ───────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-border bg-surface-2">
        <div className="max-w-6xl mx-auto px-4 py-20 sm:py-28">
          <motion.div variants={revealVariants} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.3 }}>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">How it Works</h2>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">Three steps from wallet to settlement.</p>
          </motion.div>

          {/* Animated step flow. The connecting line draws left-to-right
              with scaleX from 0→1 when the section scrolls into view,
              filling the path between the three numbered circles. Each
              circle then fades + scales in sequence. The whole thing
              takes ~1.2s and reads as "watch the escrow path unfold"
              rather than "look at three static cards". */}
          <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.3 }} className="mt-16 grid sm:grid-cols-2 md:grid-cols-3 gap-10 relative">
            {/* Connecting line — animates scaleX from origin-left so it
                reads as drawing in. Sits behind the circles via z-0. */}
            <motion.div
              aria-hidden="true"
              className="hidden md:block absolute top-7 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-primary/0 via-primary/60 to-primary/0 origin-left z-0"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: dur(900), ease: 'easeOut' as const, delay: dur(200) }}
            />

            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                variants={revealVariants}
                className="relative text-center"
                transition={{ delay: dur(300) + i * dur(180), duration: dur(500), ease: 'easeOut' as const }}
              >
                {/* Numbered circle with a soft pulsing ring on first reveal —
                    draws the eye to step 1 without continuously animating. */}
                <div className="relative mx-auto h-14 w-14 z-10">
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-primary/20"
                    initial={{ scale: 0.6, opacity: 0 }}
                    whileInView={{ scale: [0.6, 1.4, 1], opacity: [0, 0.5, 0] }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: dur(900), ease: 'easeOut' as const, delay: dur(400) + i * dur(180) }}
                  />
                  <div className="relative flex items-center justify-center h-14 w-14 rounded-full border-2 border-primary bg-background text-primary font-bold font-mono text-lg shadow-glow-sm">
                    {s.num}
                  </div>
                </div>
                <h3 className="mt-5 text-base font-bold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Contract terms ──────────────────────────────────────── */}
      {/* Standalone slim band carrying the two on-chain constants users
          most often want to know: platform fee and dispute window. These
          previously sat at the bottom of a redundant "By the numbers"
          stats section — kept here because they're useful, dropped the
          surrounding stat grid because DashboardPreview already shows
          volume/active/completed. */}
      <section className="border-t border-border">
        <motion.div variants={revealVariants} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.5 }} className="max-w-6xl mx-auto px-4 py-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Percent className="h-4 w-4 text-primary" />
            Platform fee <span className="font-mono text-foreground">{((cfg?.platformFeeBps ?? 50) / 100).toFixed(1)}%</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            Dispute window <span className="font-mono text-foreground">{Math.round((cfg?.disputeTimeout ?? DEFAULT_DISPUTE_TIMEOUT) * DEFAULT_MINUTES_PER_BLOCK / 1440)} days</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Non-custodial: your keys never leave your wallet
          </span>
        </motion.div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────── */}
      {/* Newcomer objection-handling. Six questions covering the most
          common concerns we'd expect from a first-time visitor on Bitcoin
          escrow — verified against the in-app docs (concepts/security,
          token-support, lifecycle) so answers stay consistent. Accordion
          rather than always-open so the section doesn't dwarf the page. */}
      <section id="faq" className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 py-20 sm:py-28">
          <motion.div variants={revealVariants} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.3 }}>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Frequently asked</h2>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">If you've never used a Bitcoin escrow before, start here.</p>
          </motion.div>

          <motion.div variants={revealVariants} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.2 }} className="mt-8">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="sbtc">
                <AccordionTrigger className="text-left">Is sBTC the same as Bitcoin?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  sBTC is a 1:1 Bitcoin-backed token on the Stacks blockchain. Every sBTC is collateralised by real BTC held in a multisig threshold-signed by a permissionless signer set. You can{' '}
                  <a href="https://bridge.sbtc.tech/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">peg sBTC back to BTC</a>{' '}
                  any time. For escrows, sBTC moves at Stacks speed (~10 min/block on Bitcoin anchoring) with smart-contract programmability that L1 Bitcoin doesn't have.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="why-stacks">
                <AccordionTrigger className="text-left">Why Stacks instead of Bitcoin L1?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  Bitcoin L1 doesn't support arbitrary smart contracts. The only way to do escrow there is via multisig (which still requires a trusted third signer) or HTLCs (limited use cases). Stacks anchors to Bitcoin for security and adds Clarity, a decidable contract language that lets us encode the full escrow lifecycle on-chain. The funds remain trustless; only the contract logic moves up a layer.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="admin-power">
                <AccordionTrigger className="text-left">Can the admin freeze or steal my funds?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  No. The admin's only privileges are resolving an active <em>dispute</em> (release to seller, refund to buyer, or split between them) and pausing new escrow creation for emergencies. The admin cannot touch a non-disputed escrow, cannot pause indefinitely (the pause has a hard duration + anti-chaining cooldown built in), and cannot prevent dispute timeouts from firing. Buyers self-recover after the dispute window elapses, and sellers self-rescue after 2× that window if they signaled delivery. The contract enforces every one of these constraints on-chain.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="bugs">
                <AccordionTrigger className="text-left">What if there's a bug in the contract?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  The contract went through four self-audit passes before mainnet, with 50+ invariant tests passing, including the funds-conservation invariant (contract STX/sBTC balance ≥ locked balance at all times). Source is{' '}
                  <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">open on GitHub</a>{' '}
                  for independent review. If a bug were discovered, the time-bounded pause gives admins a way to halt new escrows while existing ones unwind through their normal flows. Funds remain owned by the contract under its original rules.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="get-sbtc">
                <AccordionTrigger className="text-left">How do I get sBTC?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  Use the{' '}
                  <a href="https://bridge.sbtc.tech/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">official sBTC bridge</a>: deposit BTC, receive sBTC on Stacks 1:1. The reverse works the same way. You can also create STX escrows here without ever needing sBTC. The contract supports both tokens natively.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="fee">
                <AccordionTrigger className="text-left">What does the 0.5% fee cover?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  Maintenance of the contract, indexer infrastructure, the frontend, and the dispute-resolution path. The fee is charged only on successful release (not on refunds) and is hard-capped at 5% in the contract, so the admin cannot raise it beyond that without a new deployment. There are no other costs to use the platform beyond standard Stacks network fees for signing transactions.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      {/* bg-surface-2 + tighter padding so the CTA reads as the natural
          continuation of the FAQ ("we answered your questions, now act")
          rather than a separate chapter. The alternating bg pattern also
          stays intact: Security (surface-2) → FAQ (default) → CTA (surface-2). */}
      <section className="border-t border-border bg-surface-2">
        <motion.div variants={revealVariants} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.5 }} className="max-w-2xl mx-auto px-4 py-16 sm:py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight text-balance">Create your first escrow</h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed text-pretty">
            Connect a wallet, set the terms, and your funds sit on-chain until the deal closes. 0.5% on release, nothing on refunds. Your keys never leave your wallet.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={handleGetStarted} className="gap-2 shadow-glow-md hover:shadow-glow-lg transition-shadow">
              {isConnected ? 'Open Dashboard' : 'Connect & Create'} <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="ghost" onClick={() => scrollTo('faq')} className="gap-2 text-muted-foreground hover:text-foreground">
              Still have questions?
            </Button>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      {/* The "Built on Stacks · network" signal lives here, not in the hero:
          a first-time visitor cares what the product does before which chain
          it runs on. The chain/security context is reassurance for the bottom
          of the page, where someone evaluating trust will look for it. */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="col-span-2 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Logo size="sm" className="text-accent-warm" />
                <span className="font-bold tracking-tight">sBTC Escrow</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                Non-custodial escrow on Bitcoin. Funds release only when both sides agree.
              </p>
              <div className="flex items-center gap-4">
                <a href="https://x.com/sbtcescrow" target="_blank" rel="noopener noreferrer" aria-label="sBTC Escrow on X" className="text-muted-foreground hover:text-foreground transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="sBTC Escrow on GitHub" className="text-muted-foreground hover:text-foreground transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
                </a>
              </div>
            </div>

            {/* Product */}
            <nav aria-label="Product" className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Product</h3>
              <button onClick={() => navigate('/dashboard')} className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</button>
              <button onClick={() => navigate('/create')} className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors">Create Escrow</button>
              <button onClick={() => navigate('/escrows')} className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors">My Escrows</button>
              <button onClick={() => navigate('/activity')} className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors">Activity</button>
            </nav>

            {/* Resources */}
            <nav aria-label="Resources" className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Resources</h3>
              <button onClick={() => navigate('/how-it-works')} className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors">How it Works</button>
              <button onClick={() => navigate('/docs')} className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors">Docs</button>
              <button onClick={() => scrollTo('faq')} className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</button>
              <a href="https://explorer.stacks.co" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Explorer</a>
            </nav>
          </div>

          {/* Bottom bar — provenance + live-network status, the signal moved
              down from the hero. */}
          <div className="mt-12 border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} sBTC Escrow. Built on Stacks, secured by Bitcoin.</p>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-warm" />
              {STACKS_NETWORK === 'mainnet' ? 'Mainnet' : 'Testnet'} Live
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
