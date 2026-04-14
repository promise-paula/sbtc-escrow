import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { EscrowStatus } from '@/lib/types';
import { TrendingUp, Hash, Coins, Calculator } from 'lucide-react';
import { cardVariants } from '@/lib/motion';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
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
          buckets.set(key, { month: label, volumeStx: 0, volumeSbtc: 0, escrowCount: 0, feesStx: 0, feesSbtc: 0, released: 0, refunded: 0, disputed: 0 });
        }
        const b = buckets.get(key)!;
        const isSbtc = (row.token_type ?? 0) === 1;
        if (isSbtc) {
          b.volumeSbtc += (row.amount ?? 0) / 1e8;
          b.feesSbtc += (row.fee_amount ?? 0) / 1e8;
        } else {
          b.volumeStx += (row.amount ?? 0) / 1e6;
          b.feesStx += (row.fee_amount ?? 0) / 1e6;
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
  released: 'oklch(62% 0.17 155)',
  refunded: 'oklch(55% 0.2 285)',
  disputed: 'oklch(55% 0.22 27)',
};

const tooltipStyle = {
  backgroundColor: 'oklch(var(--card))',
  border: '1px solid oklch(var(--border))',
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
      (acc, m) => ({ released: acc.released + m.released, refunded: acc.refunded + m.refunded, disputed: acc.disputed + m.disputed }),
      { released: 0, refunded: 0, disputed: 0 }
    );
    return [
      { name: 'Released', value: totals.released, color: STATUS_COLORS.released },
      { name: 'Refunded', value: totals.refunded, color: STATUS_COLORS.refunded },
      { name: 'Disputed', value: totals.disputed, color: STATUS_COLORS.disputed },
    ];
  }, [monthlyData]);

  const totalVolumeStx = monthlyData.reduce((s, m) => s + m.volumeStx, 0);
  const totalVolumeSbtc = monthlyData.reduce((s, m) => s + m.volumeSbtc, 0);
  const totalEscrows = monthlyData.reduce((s, m) => s + m.escrowCount, 0);
  const totalFeesStx = monthlyData.reduce((s, m) => s + m.feesStx, 0);
  const totalFeesSbtc = monthlyData.reduce((s, m) => s + m.feesSbtc, 0);
  const avgEscrowStx = totalEscrows > 0 ? totalVolumeStx / totalEscrows : 0;

  const summaryCards = [
    { title: 'Volume (STX)', value: `${totalVolumeStx.toFixed(2)} STX`, icon: TrendingUp },
    ...(totalVolumeSbtc > 0 ? [{ title: 'Volume (sBTC)', value: `${totalVolumeSbtc.toFixed(6)} sBTC`, icon: TrendingUp }] : []),
    { title: 'Total Escrows', value: totalEscrows.toLocaleString(), icon: Hash },
    { title: 'Avg Escrow Size', value: `${avgEscrowStx.toFixed(2)} STX`, icon: Calculator },
    { title: 'Platform Fees', value: `${totalFeesStx.toFixed(4)} STX`, icon: Coins },
    ...(totalFeesSbtc > 0 ? [{ title: 'Fees (sBTC)', value: `${totalFeesSbtc.toFixed(8)} sBTC`, icon: Coins }] : []),
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-6">
      <h1 className="text-xl font-bold text-foreground tracking-tight">Analytics</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card, i) => (
          <motion.div key={card.title} custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="hover:shadow-glow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <card.icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{card.title}</span>
                </div>
                <p className="text-2xl font-mono font-bold">
                  {card.value}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Volume Bar Chart */}
      <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Volume Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="stx" name="STX" fill="oklch(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sbtc" name="sBTC" fill="oklch(var(--accent-warm))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Escrow Count Trend + Status Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Escrow Count Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={countData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="count" name="Escrows" stroke="oklch(var(--primary))" strokeWidth={2} dot={{ fill: 'oklch(var(--primary))' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusTotals} cx="50%" cy="45%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {statusTotals.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend verticalAlign="bottom" formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Fee Revenue */}
      <motion.div custom={7} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Fee Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={feeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="stx" name="STX Fees" stroke="oklch(var(--primary))" fill="oklch(var(--primary) / 0.15)" strokeWidth={2} />
                  <Area type="monotone" dataKey="sbtc" name="sBTC Fees" stroke="oklch(var(--accent-warm))" fill="oklch(var(--accent-warm) / 0.15)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
