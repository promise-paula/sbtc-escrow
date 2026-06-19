/**
 * EscrowMock — animated hero widget showing escrow's core metaphor: funds held
 * by a contract between two parties, moving only on settlement.
 *
 * Deliberately NOT a browser-framed product card (that's the common SaaS-landing
 * pattern). The centerpiece is a lock holding the amount, sitting on the line
 * between Buyer and Seller; on settlement the funds-flow lights up toward the
 * recipient (seller on release, buyer on refund) and the lock opens. It cycles
 * through all five on-chain states using the platform's real status colors.
 *
 * Decorative + aria-hidden: the real app lives behind the CTAs.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, LockOpen, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUsdValue } from '@/hooks/use-usd-estimate';
import { TokenType } from '@/lib/types';

type Status = 'pending' | 'delivered' | 'released' | 'refunded' | 'disputed';

interface Scenario {
  id: string;
  title: string;
  escrowId: string;
  buyer: string;
  seller: string;
  token: 'STX' | 'sBTC';
  amount: string;
  /** On-chain base units (microSTX / sats) used to compute the live USD value. */
  micro: number;
  status: Status;
}

// One scenario per on-chain state — the cycle walks the whole lifecycle.
// `micro` is base units (1 STX = 1e6 µSTX, 1 sBTC = 1e8 sats); USD is live.
const SCENARIOS: Scenario[] = [
  { id: 'freelance', title: 'Freelance milestone', escrowId: '#1042', buyer: 'ST1A…9XF', seller: 'ST2K…D3M', token: 'STX',  amount: '500.00', micro: 500_000_000,   status: 'released' },
  { id: 'market',    title: 'Marketplace order',   escrowId: '#1051', buyer: 'ST7M…2V8', seller: 'ST4C…B6N', token: 'STX',  amount: '1,200',  micro: 1_200_000_000, status: 'delivered' },
  { id: 'otc',       title: 'OTC trade',           escrowId: '#1038', buyer: 'SP3R…7Q2', seller: 'SP9F…1KD', token: 'sBTC', amount: '0.0500', micro: 5_000_000,     status: 'pending' },
  { id: 'returns',   title: 'Returned order',      escrowId: '#1033', buyer: 'ST5H…0PA', seller: 'ST8J…7RC', token: 'STX',  amount: '320.00', micro: 320_000_000,   status: 'refunded' },
  { id: 'design',    title: 'Design contract',     escrowId: '#1027', buyer: 'SP2D…8WJ', seller: 'SP6T…4HQ', token: 'sBTC', amount: '0.0120', micro: 1_200_000,     status: 'disputed' },
];

type Flow = 'hold' | 'toSeller' | 'toBuyer' | 'frozen';

const META: Record<Status, {
  label: string; tone: string; lock: typeof Lock; flow: Flow; blurb: string; step: number; terminal: string;
}> = {
  pending:   { label: 'Pending',   tone: 'pending',   lock: Lock,        flow: 'hold',     blurb: 'Held in contract',          step: 1, terminal: 'Released' },
  delivered: { label: 'Delivered', tone: 'delivered', lock: Lock,        flow: 'hold',     blurb: 'Delivered · awaiting release', step: 2, terminal: 'Released' },
  released:  { label: 'Released',  tone: 'released',  lock: LockOpen,    flow: 'toSeller', blurb: 'Released to seller',         step: 3, terminal: 'Released' },
  refunded:  { label: 'Refunded',  tone: 'refunded',  lock: LockOpen,    flow: 'toBuyer',  blurb: 'Refunded to buyer',          step: 3, terminal: 'Refunded' },
  disputed:  { label: 'Disputed',  tone: 'disputed',  lock: ShieldAlert, flow: 'frozen',   blurb: 'In dispute · admin resolving', step: 3, terminal: 'Disputed' },
};

// Tailwind classes per status tone (the platform's real status palette).
const TONE: Record<string, { text: string; dot: string; tint: string; border: string }> = {
  pending:   { text: 'text-status-pending',   dot: 'bg-status-pending',   tint: 'bg-status-pending/12',   border: 'border-status-pending/30' },
  delivered: { text: 'text-status-delivered', dot: 'bg-status-delivered', tint: 'bg-status-delivered/12', border: 'border-status-delivered/30' },
  released:  { text: 'text-status-released',  dot: 'bg-status-released',  tint: 'bg-status-released/12',  border: 'border-status-released/30' },
  refunded:  { text: 'text-status-refunded',  dot: 'bg-status-refunded',  tint: 'bg-status-refunded/12',  border: 'border-status-refunded/30' },
  disputed:  { text: 'text-status-disputed',  dot: 'bg-status-disputed',  tint: 'bg-status-disputed/12',  border: 'border-status-disputed/30' },
};

function Party({ side, label, addr, active }: { side: 'l' | 'r'; label: string; addr: string; active: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1', side === 'l' ? 'items-start' : 'items-end')}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-xs transition-colors', active ? 'text-foreground' : 'text-muted-foreground')}>{addr}</span>
    </div>
  );
}

function EscrowCard({ s, usd }: { s: Scenario; usd: string | null }) {
  const m = META[s.status];
  const tone = TONE[m.tone];
  const LockIcon = m.lock;
  const steps = ['Funded', 'Delivered', m.terminal];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full max-w-[380px] rounded-2xl border border-border bg-card p-6 shadow-xl shadow-glow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="font-mono text-xs text-muted-foreground">escrow · {s.escrowId}</span>
        <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border', tone.tint, tone.border, tone.text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
          {m.label}
        </span>
      </div>
      <p className="text-sm font-semibold text-foreground mb-6">{s.title}</p>

      {/* Parties row */}
      <div className="flex items-start justify-between mb-1">
        <Party side="l" label="Buyer" addr={s.buyer} active={m.flow === 'toBuyer'} />
        <Party side="r" label="Seller" addr={s.seller} active={m.flow === 'toSeller'} />
      </div>

      {/* Connector + lock centerpiece */}
      <div className="relative flex items-center justify-center h-[88px]">
        {/* base track */}
        <div className="absolute left-3 right-3 top-[34px] h-px bg-border" />
        {/* flowing segment toward the recipient */}
        {(m.flow === 'toSeller' || m.flow === 'toBuyer') && (
          <motion.div
            key={`${s.id}-flow`}
            className={cn('absolute top-[34px] h-[2px] rounded-full', tone.dot, m.flow === 'toSeller' ? 'left-1/2 origin-left' : 'right-1/2 origin-right')}
            style={{ width: 'calc(50% - 12px)' }}
            initial={{ scaleX: 0, opacity: 0.4 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
          />
        )}
        {/* travelling pulse on the flowing segment */}
        {(m.flow === 'toSeller' || m.flow === 'toBuyer') && (
          <motion.span
            key={`${s.id}-pulse`}
            className={cn('absolute top-[31px] h-2 w-2 rounded-full', tone.dot)}
            initial={{ left: '50%', opacity: 0 }}
            animate={{ left: m.flow === 'toSeller' ? ['50%', 'calc(100% - 14px)'] : ['50%', '14px'], opacity: [0, 1, 0] }}
            transition={{ duration: 1.1, delay: 0.4, ease: 'easeOut' }}
          />
        )}
        {/* end dots */}
        <span className="absolute left-3 top-[30px] h-2 w-2 rounded-full bg-muted-foreground/40" />
        <span className={cn('absolute right-3 top-[30px] h-2 w-2 rounded-full', m.flow === 'toSeller' ? tone.dot : 'bg-muted-foreground/40')} />

        {/* lock disc */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative">
            <motion.span
              key={`${s.id}-glow`}
              className={cn('absolute inset-0 rounded-2xl blur-xl', tone.tint)}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: [0, 0.9, 0.6], scale: [0.7, 1.25, 1.1] }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
            />
            <AnimatePresence mode="wait">
              <motion.div
                key={`${s.id}-lock`}
                initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.34, 1.4, 0.64, 1] }}
                className={cn('relative grid place-items-center h-16 w-16 rounded-2xl border bg-card', tone.tint, tone.border)}
              >
                <LockIcon className={cn('h-7 w-7', tone.text)} strokeWidth={2} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Amount */}
      <div className="text-center mt-2 mb-6">
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="font-mono text-2xl font-bold text-foreground leading-none">{s.amount}</span>
          <span className="text-sm text-muted-foreground">{s.token}</span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {usd && <>≈ {usd} <span className="text-muted-foreground/40">·</span> </>}
          <span className={tone.text}>{m.blurb}</span>
        </p>
      </div>

      {/* Lifecycle rail */}
      <div className="flex items-center">
        {steps.map((label, i) => {
          const filled = i < m.step;
          const isTerminal = i === steps.length - 1;
          const dotCls = filled ? (isTerminal ? tone.dot : 'bg-primary') : 'bg-muted-foreground/25';
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', dotCls)} />
                <span className={cn('text-[10px] whitespace-nowrap', filled ? (isTerminal ? tone.text : 'text-muted-foreground') : 'text-muted-foreground/40')}>{label}</span>
              </div>
              {!isTerminal && <span className={cn('h-px flex-1 mx-1 mb-4', i < m.step - 1 ? 'bg-primary/50' : 'bg-border')} />}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

const INTERVAL_MS = 3800;

export function EscrowMock() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const advance = useCallback(() => setActive((i) => (i + 1) % SCENARIOS.length), []);

  useEffect(() => {
    if (paused) return;
    // Respect prefers-reduced-motion: don't auto-advance. The scenario dots
    // still let a visitor step through manually.
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(advance, INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, advance]);

  const s = SCENARIOS[active];
  // Live USD for the visible scenario (CoinGecko via useStxPrice/useBtcPrice,
  // shared+cached with the rest of the app). useUsdValue ignores the user's
  // "Show USD" setting — correct for a marketing surface. Null until the price
  // feed loads, in which case the card just omits the "≈ $…" line.
  const usd = useUsdValue(s.micro, s.token === 'sBTC' ? TokenType.SBTC : TokenType.STX);

  return (
    <div
      aria-hidden="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="flex justify-center select-none"
    >
      <AnimatePresence mode="wait">
        <EscrowCard key={s.id} s={s} usd={usd} />
      </AnimatePresence>
    </div>
  );
}
