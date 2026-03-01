import { useEffect } from "react";
import { useDocumentHead } from "@/hooks/use-document-head";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { staggerContainer, staggerChild, fadeInUp } from "@/lib/animations";
import { FeatureCard } from "@/components/escrow/FeatureCard";
import { GlassCard } from "@/components/escrow/GlassCard";
import { GradientDivider } from "@/components/landing/GradientDivider";
import { Footer } from "@/components/landing/Footer";
import { TestimonialCard } from "@/components/landing/TestimonialCard";
import { useWallet } from "@/contexts/WalletContext";
import { usePlatformStats } from "@/hooks/use-escrow";
import { microStxToStx } from "@/lib/stacks-config";
import { PageTransition } from "@/components/layout/PageTransition";
import { Shield, Lock, Zap, Users, ArrowRight, Wallet, FilePlus, LockKeyhole, CheckCircle } from "lucide-react";

const TESTIMONIALS = [
  { quote: "sBTC Escrow replaced our entire custody workflow. Settlement is instant and we sleep better knowing funds are Bitcoin-secured.", name: "Alex Chen", role: "DeFi Trader", company: "Meridian Capital", initials: "AC" },
  { quote: "As a freelancer, getting stiffed on payments was my biggest fear. Now every contract is locked in escrow before I write a single line of code.", name: "Priya Sharma", role: "Freelance Dev", company: "Independent", initials: "PS" },
  { quote: "Our DAO treasury needed trustless disbursement. sBTC Escrow's multi-party arbitration solved it out of the box.", name: "Marcus Webb", role: "DAO Treasurer", company: "NovusDAO", initials: "MW" },
];

const HOW_IT_WORKS = [
  { icon: <FilePlus className="h-5 w-5" />, title: "Create Escrow", description: "Define the terms, set the amount, and invite the counterparty." },
  { icon: <LockKeyhole className="h-5 w-5" />, title: "Lock Funds", description: "sBTC is locked in a Clarity smart contract — trustless and transparent." },
  { icon: <CheckCircle className="h-5 w-5" />, title: "Release on Completion", description: "Funds release automatically when conditions are met, or via arbitration." },
];

export default function Landing() {
  const { isConnected, connect } = useWallet();
  const location = useLocation();
  const { data: platformStats } = usePlatformStats();
  useDocumentHead({ title: "sBTC Escrow — Secure Bitcoin-Backed Escrow", description: "Enterprise-grade escrow platform powered by sBTC. Secure, trustless transactions backed by Bitcoin." });

  // Calculate stats from contract data
  const totalVolume = platformStats ? microStxToStx(platformStats.totalVolume) : 0;
  const activeEscrows = platformStats ? Number(platformStats.activeEscrows) : 0;
  const completedEscrows = platformStats 
    ? Number(platformStats.totalReleased) + Number(platformStats.totalRefunded) 
    : 0;
  const totalEscrows = platformStats ? Number(platformStats.totalEscrows) : 0;
  const successRate = totalEscrows > 0 
    ? ((Number(platformStats?.totalReleased ?? 0) / totalEscrows) * 100).toFixed(1)
    : '0.0';

  // Format large numbers
  const formatVolume = (amount: number): string => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
    return amount.toLocaleString();
  };

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
      }, 400);
    }
  }, [location]);

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="gradient-mesh min-h-[85vh] flex items-center">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24">
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="max-w-3xl">
                <motion.div variants={staggerChild} className="mb-4">
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary status-dot-pulse" />
                    Powered by Bitcoin
                  </span>
                </motion.div>

                <motion.h1 variants={staggerChild} className="text-display-xl mb-6">
                  Secure Escrow.{" "}
                  <span className="text-primary">Bitcoin Backed.</span>
                </motion.h1>

                <motion.p variants={staggerChild} className="text-body-lg text-muted-foreground max-w-xl mb-10">
                  Enterprise-grade escrow built on Stacks. Trustless, transparent, and secured by the most
                  decentralized blockchain in the world.
                </motion.p>

                <motion.div variants={staggerChild} className="flex flex-wrap gap-4">
                  {isConnected ? (
                    <Link to="/create">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        aria-label="Create a new escrow"
                        className="flex items-center gap-2 rounded-xl btn-gradient px-6 py-3 text-sm font-semibold glow-orange transition-shadow hover:glow-orange-strong"
                      >
                        Create Escrow <ArrowRight className="h-4 w-4" />
                      </motion.button>
                    </Link>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={connect}
                      aria-label="Connect your wallet"
                      className="flex items-center gap-2 rounded-xl btn-gradient px-6 py-3 text-sm font-semibold glow-orange transition-shadow hover:glow-orange-strong"
                    >
                      <Wallet className="h-4 w-4" /> Connect Wallet
                    </motion.button>
                  )}
                  <Link to="/dashboard">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      aria-label="View dashboard"
                      className="flex items-center gap-2 rounded-xl border border-border bg-surface-1 px-6 py-3 text-sm font-medium hover:bg-surface-2 transition-colors"
                    >
                      View Dashboard
                    </motion.button>
                  </Link>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </section>

        <GradientDivider variant="orange" />

        {/* Stats */}
        <section className="border-y border-border bg-surface-1/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <motion.div
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border"
            >
              {[
                { label: "Total Volume", value: `${formatVolume(totalVolume)} STX` },
                { label: "Active Escrows", value: String(activeEscrows) },
                { label: "Completed", value: String(completedEscrows) },
                { label: "Success Rate", value: `${successRate}%` },
              ].map((stat) => (
                <motion.div key={stat.label} variants={staggerChild} className="px-6 py-8 text-center">
                  <p className="text-2xl font-bold font-mono tracking-tight">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <GradientDivider variant="purple" />

        {/* Features */}
        <section id="features" className="py-24 scroll-mt-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <motion.div variants={fadeInUp} initial="initial" whileInView="animate" viewport={{ once: true }} className="text-center mb-16">
              <h2 className="text-display mb-4">Why sBTC Escrow?</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">Built for professionals who need trustless, secure transactions with the finality of Bitcoin.</p>
            </motion.div>
            <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true }} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <FeatureCard icon={<Shield className="h-5 w-5" />} title="Bitcoin Security" description="Every escrow is backed by sBTC, inheriting Bitcoin's unmatched security and finality." />
              <FeatureCard icon={<Lock className="h-5 w-5" />} title="Smart Contracts" description="Automated, trustless execution via Clarity smart contracts on the Stacks blockchain." />
              <FeatureCard icon={<Zap className="h-5 w-5" />} title="Instant Settlement" description="Near-instant escrow creation and settlement with minimal transaction fees." />
              <FeatureCard icon={<Users className="h-5 w-5" />} title="Dispute Resolution" description="Built-in dispute mechanism with multi-party arbitration for complex transactions." />
            </motion.div>
          </div>
        </section>

        <GradientDivider variant="blue" />

        {/* How It Works */}
        <section id="how-it-works" className="py-24 scroll-mt-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <motion.div variants={fadeInUp} initial="initial" whileInView="animate" viewport={{ once: true }} className="text-center mb-16">
              <h2 className="text-display mb-4">How It Works</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">Three simple steps to trustless, Bitcoin-backed transactions.</p>
            </motion.div>
            <motion.div
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              className="grid sm:grid-cols-3 gap-8 relative"
            >
              {/* Dashed connector lines (desktop only) */}
              <div className="hidden sm:block absolute top-16 left-[calc(33.33%_-_16px)] w-[calc(33.33%_+_32px)] border-t-2 border-dashed border-border" />
              <div className="hidden sm:block absolute top-16 left-[calc(66.66%_-_16px)] w-[calc(33.33%_+_32px)] border-t-2 border-dashed border-border" />

              {HOW_IT_WORKS.map((step, i) => (
                <motion.div key={step.title} variants={staggerChild} className="relative text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold font-mono text-lg relative z-10">
                    {i + 1}
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center mx-auto mb-3 text-muted-foreground">
                    {step.icon}
                  </div>
                  <h3 className="text-subheading mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <GradientDivider variant="orange" />

        {/* Testimonials */}
        <section id="testimonials" className="py-24 scroll-mt-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <motion.div variants={fadeInUp} initial="initial" whileInView="animate" viewport={{ once: true }} className="text-center mb-16">
              <h2 className="text-display mb-4">Trusted by Teams</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">Hear from professionals who rely on sBTC Escrow for their most critical transactions.</p>
            </motion.div>
            <motion.div
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              className="grid sm:grid-cols-3 gap-6"
            >
              {TESTIMONIALS.map((t) => (
                <TestimonialCard key={t.name} {...t} />
              ))}
            </motion.div>
          </div>
        </section>

        <GradientDivider variant="purple" />

        {/* CTA */}
        <section className="py-24 border-t border-border">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <motion.div variants={fadeInUp} initial="initial" whileInView="animate" viewport={{ once: true }}>
              <GlassCard className="text-center py-16 px-8">
                <h2 className="text-heading mb-4">Ready to get started?</h2>
                <p className="text-muted-foreground max-w-md mx-auto mb-8">Connect your wallet and create your first escrow in seconds.</p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={isConnected ? undefined : connect}
                  className="inline-flex items-center gap-2 rounded-xl btn-gradient px-8 py-3 text-sm font-semibold glow-orange hover:glow-orange-strong transition-shadow"
                >
                  {isConnected ? (
                    <Link to="/create" className="flex items-center gap-2">
                      Create Escrow <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <>
                      <Wallet className="h-4 w-4" /> Connect Wallet
                    </>
                  )}
                </motion.button>
              </GlassCard>
            </motion.div>
          </div>
        </section>

        <Footer />
      </div>
    </PageTransition>
  );
}
