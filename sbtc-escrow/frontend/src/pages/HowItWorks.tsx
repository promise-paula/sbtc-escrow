import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '@/contexts/WalletContext';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shared/Logo';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { dur, revealVariants, staggerContainer } from '@/lib/motion';
import { REPO_URL } from '@/lib/stacks-config';
import {
  ArrowRight, Wallet, Lock, CheckCircle2, Scale,
  Bitcoin, Shield, ExternalLink,
} from 'lucide-react';

const heroVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: dur(500), ease: 'easeOut' as const } },
};

const steps = [
  {
    num: '1',
    icon: Lock,
    title: 'Lock the funds',
    body:
      "You create an escrow with the seller's wallet address, the amount, what you're paying for, and a deadline. Your sBTC moves out of your wallet and into a smart contract.",
    aside:
      'Until both sides agree — or the deadline passes — neither of you can spend it.',
  },
  {
    num: '2',
    icon: CheckCircle2,
    title: 'Seller delivers, you release',
    body:
      "The seller does their part of the deal — ships the product, completes the work, hands over the goods. When you're satisfied, one tap releases the funds to the seller automatically.",
    aside:
      'You stay in control. The platform never touches the money.',
  },
  {
    num: '3',
    icon: Scale,
    title: 'If something goes wrong',
    body:
      "If the seller doesn't deliver before the deadline, the escrow refunds you. If there's a real disagreement, either side can open a dispute and an independent arbiter decides who gets paid.",
    aside:
      'After ~30 days with no resolution, you can recover your money yourself — no one can lock you out.',
  },
];

const faq = [
  {
    q: "What if the seller doesn't deliver?",
    a: "Once the deadline passes, anyone can trigger a full refund — your money (plus the platform fee) returns to your wallet. If you'd rather wait, you can extend the deadline at any time before it expires.",
  },
  {
    q: 'What if the buyer never releases the funds?',
    a: "Sellers can refund the buyer voluntarily at any time. After the deadline, anyone can trigger a refund. If there's a genuine dispute, the seller can open one and an arbiter rules on it.",
  },
  {
    q: 'What if we disagree about whether the deal was fulfilled?',
    a: "Either side can open a dispute on the escrow. An independent arbiter reviews the case using whatever evidence you both share, then resolves it on-chain — funds go to the seller, or back to you. If the arbiter doesn't respond within ~30 days, the buyer can recover their funds themselves.",
  },
  {
    q: 'What if I lose access to my wallet?',
    a: 'Your wallet — not us — controls your funds. If you lose your seed phrase, your funds are gone. Back up your seed phrase in two separate places before creating your first escrow.',
  },
  {
    q: 'How much does it cost?',
    a: "A 0.5% platform fee, charged when funds are released. So if you escrow 1 sBTC, the fee is 0.005 sBTC. There's also a small Stacks network fee (a few cents) per transaction. No subscriptions, no hidden costs, no chargebacks.",
  },
  {
    q: 'Are my funds safe?',
    a: 'Funds are held by a Clarity smart contract on Stacks, not by us. The contract code is open source and verifiable on-chain — what you see is what runs. We never have custody of, or access to, your money at any point.',
  },
  {
    q: "What's sBTC, exactly?",
    a: "sBTC is Bitcoin you can use on the Stacks blockchain. It's backed 1:1 by real BTC, fully verifiable on-chain, and you can redeem it back to BTC whenever you want. You'll need some in your wallet before creating an escrow.",
  },
];

export default function HowItWorks() {
  const { connect, isConnected } = useWallet();
  const navigate = useNavigate();

  const handleGetStarted = async () => {
    if (isConnected) {
      navigate('/dashboard');
      return;
    }
    try {
      await connect();
      navigate('/dashboard');
    } catch {
      // User cancelled — stay on page
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            aria-label="Go to home"
          >
            <Logo size="sm" className="text-accent-warm" />
            <span className="font-bold tracking-tight">sBTC Escrow</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/docs')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-md hidden sm:inline-block"
            >
              Developer Docs
            </button>
            <ThemeToggle />
            {isConnected ? (
              <Button size="sm" onClick={() => navigate('/dashboard')}>Dashboard</Button>
            ) : (
              <Button size="sm" onClick={handleGetStarted} className="gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> Connect Wallet
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section style={{ background: 'var(--gradient-hero)' }}>
        <motion.div
          variants={heroVariants}
          initial="hidden"
          animate="visible"
          className="max-w-3xl mx-auto px-4 py-16 sm:py-24 text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground mb-5">
            <Shield className="h-3 w-3 text-accent-warm" />
            New to crypto? Start here.
          </div>
          <h1
            className="font-bold tracking-tight text-foreground leading-[1.1]"
            style={{ fontSize: 'clamp(2rem, 1.4rem + 2.5vw, 3.5rem)' }}
          >
            How sBTC Escrow protects your money
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
            When you pay someone online, you usually have to trust them. sBTC Escrow
            lets you skip that — your money sits in a smart contract until both sides
            agree the deal is done.
          </p>
        </motion.div>
      </section>

      {/* ── What is sBTC? ────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 py-14">
          <motion.div
            variants={revealVariants}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.3 }}
            className="rounded-xl border border-border/60 bg-surface-1 p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start"
          >
            <div className="shrink-0 inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 text-primary">
              <Bitcoin className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">First, what's sBTC?</h2>
              <p className="mt-2 text-sm text-foreground leading-relaxed">
                sBTC is Bitcoin you can use on the Stacks blockchain. It's backed
                1:1 by real BTC and you can redeem it back whenever you want.
                You'll need some in your wallet before creating an escrow.{' '}
                <a
                  href="https://www.stacks.co/learn/sbtc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  Learn more <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── The 3 steps ──────────────────────────────────────────── */}
      <section className="border-t border-border bg-surface-2">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24">
          <motion.div
            variants={revealVariants}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.3 }}
          >
            <h2 className="font-bold text-foreground tracking-tight" style={{ fontSize: 'clamp(1.5rem, 1.2rem + 1.2vw, 2.25rem)' }}>How it works</h2>
            <p className="mt-3 text-muted-foreground max-w-lg">
              Three steps — from setting up the deal to getting paid.
            </p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.1 }}
            className="mt-12 grid lg:grid-cols-3 gap-6"
          >
            {steps.map((s) => (
              <motion.div
                key={s.num}
                variants={revealVariants}
                className="relative rounded-xl border border-border/60 bg-card p-6 sm:p-7 flex flex-col gap-4 transition-all hover:shadow-glow-sm hover:border-primary/20"
              >
                <div className="flex items-center gap-3">
                  <div className="shrink-0 inline-flex items-center justify-center h-12 w-12 rounded-full border-2 border-primary bg-background text-primary font-bold font-mono text-lg shadow-glow-sm">
                    {s.num}
                  </div>
                  <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 text-primary">
                    <s.icon className="h-6 w-6" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{s.title}</h3>
                  <p className="mt-2 text-base text-foreground leading-relaxed">{s.body}</p>
                </div>
                <div className="mt-auto pt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground italic leading-relaxed">{s.aside}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">
          <motion.div
            variants={revealVariants}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.3 }}
          >
            <h2 className="font-bold text-foreground tracking-tight" style={{ fontSize: 'clamp(1.5rem, 1.2rem + 1.2vw, 2.25rem)' }}>What if something goes wrong?</h2>
            <p className="mt-3 text-muted-foreground">
              Real fears, real answers.
            </p>
          </motion.div>

          <motion.div
            variants={revealVariants}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.1 }}
            className="mt-8"
          >
            <Accordion type="single" collapsible className="space-y-2">
              {faq.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="rounded-lg border border-border/60 bg-surface-1 px-4 last:border-b border-b"
                >
                  <AccordionTrigger className="text-left font-medium text-foreground hover:no-underline py-4">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-foreground leading-relaxed pb-4">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-surface-2">
        <motion.div
          variants={revealVariants}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.4 }}
          className="max-w-3xl mx-auto px-4 py-16 sm:py-24 text-center"
        >
          <h2 className="font-bold text-foreground tracking-tight" style={{ fontSize: 'clamp(1.5rem, 1.2rem + 1.2vw, 2.25rem)' }}>Ready to start?</h2>

          {isConnected ? (
            <>
              <p className="mt-3 text-muted-foreground">
                Your wallet is connected. Create your first escrow when you're ready.
              </p>
              <Button
                size="lg"
                onClick={() => navigate('/dashboard')}
                className="mt-8 gap-2 shadow-glow-md hover:shadow-glow-lg transition-shadow"
              >
                Open Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <p className="mt-3 text-muted-foreground">
                You'll need a Stacks wallet first. Setup takes about a minute.
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-4 max-w-md mx-auto">
                <a
                  href="https://chromewebstore.google.com/detail/leather/ldinpeekobnhjjdofggfgjlcehhmanlj"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-border/60 bg-card p-5 hover:border-primary hover:shadow-glow-sm transition-all group text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Leather</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Browser extension</p>
                </a>
                <a
                  href="https://chromewebstore.google.com/detail/xverse-bitcoin-crypto-wal/idnnbdplmphpflfnlkomgpfbpcgelopg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-border/60 bg-card p-5 hover:border-primary hover:shadow-glow-sm transition-all group text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Xverse</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Mobile and browser</p>
                </a>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                Already have one?{' '}
                <button onClick={handleGetStarted} className="text-primary hover:underline font-medium">
                  Connect wallet
                </button>
              </p>
            </>
          )}
        </motion.div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <button onClick={() => navigate('/')} className="hover:text-foreground transition-colors">
            ← Back to home
          </button>
          <div className="flex flex-wrap justify-center sm:justify-end gap-4">
            <button onClick={() => navigate('/docs')} className="hover:text-foreground transition-colors">
              Developer Docs
            </button>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
