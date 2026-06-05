import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { EscrowStatus } from '@/lib/types';
import { TrendingUp, Hash, Coins, Calculator } from 'lucide-react';
import { cardVariants } from '@/lib/motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line, AreaChart, Area,
} from 'recharts';

interface MonthlyBucket {
  month: string;
  volumeStx: number;
  volumeSbtc: number;
  escrowCount: number;
  // Per-token counts so per-token averages don't divide a single token's
  // volume by the combined escrow count.
  stxCount: number;
  sbtcCount: number;
  feesStx: number;
  feesSbtc: number;
  released: number;
  refunded: number;
  disputed: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function useMonthlyAnalytics() {
  return useQuery({
    queryKey: ['monthly-analytics'],
    queryFn: async (): Promise<MonthlyBucket[]> => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from('escrows')
        .select('amount, fee_amount, status, indexed_at, token_type');
      if (error || !data?.length) return [];

      const buckets = new Map<string, MonthlyBucket>();
      for (const row of data) {
        const d = new Date(row.indexed_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
        if (!buckets.has(key)) {
          buckets.set(key, { month: label, volumeStx: 0, volumeSbtc: 0, escrowCount: 0, stxCount: 0, sbtcCount: 0, feesStx: 0, feesSbtc: 0, released: 0, refunded: 0, disputed: 0 });
        }
        const b = buckets.get(key)!;
        const isSbtc = (row.token_type ?? 0) === 1;
        if (isSbtc) {
          b.volumeSbtc += (row.amount ?? 0) / 1e8;
          b.feesSbtc += (row.fee_amount ?? 0) / 1e8;
          b.sbtcCount += 1;
        } else {
          b.volumeStx += (row.amount ?? 0) / 1e6;
          b.feesStx += (row.fee_amount ?? 0) / 1e6;
          b.stxCount += 1;
        }
        b.escrowCount += 1;
        if (row.status === EscrowStatus.Released) b.released += 1;
        else if (row.status === EscrowStatus.Refunded) b.refunded += 1;
        else if (row.status === EscrowStatus.Disputed) b.disputed += 1;
      }

      return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => v);
    },
    staleTime: 60_000,
  });
}

const STATUS_COLORS = {
  pending: 'oklch(68% 0.14 75)',
  released: 'oklch(62% 0.17 155)',
  refunded: 'oklch(55% 0.2 285)',
  disputed: 'oklch(55% 0.22 27)',
};

const tooltipStyle = {
  backgroundColor: 'oklch(var(--card))',
  border: '1px solid oklch(var(--border))',
  color: 'oklch(var(--card-foreground))',
  borderRadius: 8,
  fontSize: 12,
};

export default function Analytics() {
  const { data: monthlyData = [] } = useMonthlyAnalytics();

  const volumeData = useMemo(() =>
    monthlyData.map(m => ({ month: m.month, stx: Number(m.volumeStx.toFixed(2)), sbtc: Number(m.volumeSbtc.toFixed(6)) })), [monthlyData]);

  const countData = useMemo(() =>
    monthlyData.map(m => ({ month: m.month, count: m.escrowCount })), [monthlyData]);

  const feeData = useMemo(() =>
    monthlyData.map(m => ({ month: m.month, stx: Number(m.feesStx.toFixed(4)), sbtc: Number(m.feesSbtc.toFixed(8)) })), [monthlyData]);

  const statusTotals = useMemo(() => {
    const totals = monthlyData.reduce(
      (acc, m) => ({ released: acc.released + m.released, refunded: acc.refunded + m.refunded, disputed: acc.disputed + m.disputed, total: acc.total + m.escrowCount }),
      { released: 0, refunded: 0, disputed: 0, total: 0 }
    );
    const pending = totals.total - totals.released - totals.refunded - totals.disputed;
    return [
      { name: 'Pending', value: pending, color: STATUS_COLORS.pending },
      { name: 'Released', value: totals.released, color: STATUS_COLORS.released },
      { name: 'Refunded', value: totals.refunded, color: STATUS_COLORS.refunded },
      { name: 'Disputed', value: totals.disputed, color: STATUS_COLORS.disputed },
    ].filter(s => s.value > 0);
  }, [monthlyData]);

  const totalVolumeStx = monthlyData.reduce((s, m) => s + m.volumeStx, 0);
  const totalVolumeSbtc = monthlyData.reduce((s, m) => s + m.volumeSbtc, 0);
  const totalEscrows = monthlyData.reduce((s, m) => s + m.escrowCount, 0);
  const totalFeesStx = monthlyData.reduce((s, m) => s + m.feesStx, 0);
  const totalFeesSbtc = monthlyData.reduce((s, m) => s + m.feesSbtc, 0);
  const totalStxCount = monthlyData.reduce((s, m) => s + m.stxCount, 0);
  // Avg STX escrow size = STX volume / STX-escrow count (not the combined
  // count, which would dilute the average with sBTC escrows).
  const avgEscrowStx = totalStxCount > 0 ? totalVolumeStx / totalStxCount : 0;

  // Time-series are only meaningful with at least two months of history. Below
  // that the "over time" charts render a single point and look broken, so we
  // gate them and show current-state views (totals + outcome mix) instead.
  const hasTrends = monthlyData.length >= 2;
  const onlyMonth = monthlyData[0]?.month ?? 'this month';
  const hasSbtcVolume = totalVolumeSbtc > 0;
  const hasSbtcFees = totalFeesSbtc > 0;

  const summaryCards = [
    { title: 'Volume (STX)', value: `${totalVolumeStx.toFixed(2)} STX`, icon: TrendingUp },
    ...(totalVolumeSbtc > 0 ? [{ title: 'Volume (sBTC)', value: `${totalVolumeSbtc.toFixed(6)} sBTC`, icon: TrendingUp }] : []),
    { title: 'Total Escrows', value: totalEscrows.toLocaleString(), icon: Hash },
    { title: 'Avg Escrow Size', value: `${avgEscrowStx.toFixed(2)} STX`, icon: Calculator },
    { title: 'Platform Fees', value: `${totalFeesStx.toFixed(4)} STX`, icon: Coins },
    ...(totalFeesSbtc > 0 ? [{ title: 'Fees (sBTC)', value: `${totalFeesSbtc.toFixed(8)} sBTC`, icon: Coins }] : []),
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">

      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform-wide performance across all escrows</p>
      </div>

      {/* ── Totals ──────────────────────────────────────────── */}
      {/* Headline numbers — meaningful at any data volume, so always shown. */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        {summaryCards.map((card, i) => (
          <motion.div key={card.title} custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="hover:shadow-glow-sm transition-shadow">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-3">
                  <card.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs font-medium truncate">{card.title}</span>
                </div>
                <p className="text-xl sm:text-2xl font-mono font-bold text-foreground leading-none">
                  {card.value}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ── Outcome breakdown ───────────────────────────────── */}
      {/* Where escrows end up — donut paired with an enumerated legend that
          carries the actual counts and percentages (a donut alone can't be
          read precisely at low volume). Meaningful with a single escrow. */}
      <motion.div custom={summaryCards.length} variants={cardVariants} initial="hidden" animate="visible" className="mb-8">
        <Card>
          <CardHeader className="pb-2 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Outcome breakdown</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {statusTotals.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No escrow data yet.</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-6 items-center">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusTotals} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                        {statusTotals.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2.5">
                  {statusTotals.map((s) => {
                    const pct = totalEscrows > 0 ? (s.value / totalEscrows) * 100 : 0;
                    return (
                      <div key={s.name} className="flex items-center gap-3">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-sm text-foreground flex-1">{s.name}</span>
                        <span className="font-mono text-sm text-foreground tabular-nums">{s.value}</span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Trends over time ────────────────────────────────── */}
      {/* Gated behind ≥2 months of history. STX and sBTC sit on separate axes
          (their magnitudes differ by orders of magnitude, so on one axis the
          smaller series is always invisible); the sBTC axis/series only appear
          when there's sBTC data to show. */}
      <motion.div custom={summaryCards.length + 1} variants={cardVariants} initial="hidden" animate="visible">
        {hasTrends ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 pt-5 px-5"><CardTitle className="text-sm font-semibold">Volume over time</CardTitle></CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={volumeData} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" axisLine={false} tickLine={false} />
                      <YAxis yAxisId="stx" tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} width={44} />
                      {hasSbtcVolume && <YAxis yAxisId="sbtc" orientation="right" tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} width={56} />}
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
                      <Bar yAxisId="stx" dataKey="stx" name="STX" fill="oklch(var(--primary))" radius={[4, 4, 0, 0]} />
                      {hasSbtcVolume && <Bar yAxisId="sbtc" dataKey="sbtc" name="sBTC" fill="oklch(var(--accent-warm))" radius={[4, 4, 0, 0]} />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-5 px-5"><CardTitle className="text-sm font-semibold">Escrows created per month</CardTitle></CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={countData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="count" name="Escrows" stroke="oklch(var(--primary))" strokeWidth={2} dot={{ fill: 'oklch(var(--primary))', r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-5 px-5"><CardTitle className="text-sm font-semibold">Fee revenue over time</CardTitle></CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={feeData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" axisLine={false} tickLine={false} />
                      <YAxis yAxisId="stx" tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} width={44} />
                      {hasSbtcFees && <YAxis yAxisId="sbtc" orientation="right" tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} width={60} />}
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
                      <Area yAxisId="stx" type="monotone" dataKey="stx" name="STX Fees" stroke="oklch(var(--primary))" fill="oklch(var(--primary) / 0.12)" strokeWidth={2} />
                      {hasSbtcFees && <Area yAxisId="sbtc" type="monotone" dataKey="sbtc" name="sBTC Fees" stroke="oklch(var(--accent-warm))" fill="oklch(var(--accent-warm) / 0.12)" strokeWidth={2} />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-2 pt-5 px-5"><CardTitle className="text-sm font-semibold">Trends over time</CardTitle></CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="flex flex-col items-center justify-center text-center py-14 gap-3">
                <div className="rounded-full bg-muted p-3"><TrendingUp className="h-5 w-5 text-muted-foreground" /></div>
                <p className="text-sm font-medium text-foreground">Not enough history yet</p>
                <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                  Volume, activity, and fee trends appear here once there are at least two months of escrow activity. So far everything falls within {onlyMonth}.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

    </div>
  );
}
