import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { EscrowStatus } from '@/lib/types';
import { usePlatformStats } from '@/hooks/use-admin';
import { TrendingUp, Hash, Coins, Calculator } from 'lucide-react';
import { cardVariants } from '@/lib/motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';

interface MonthlyBucket {
  month: string;
  volume: number;
  escrowCount: number;
  feesCollected: number;
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
          buckets.set(key, { month: label, volume: 0, escrowCount: 0, feesCollected: 0, released: 0, refunded: 0, disputed: 0 });
        }
        const b = buckets.get(key)!;
        b.volume += row.amount ?? 0;
        b.feesCollected += row.fee_amount ?? 0;
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
  released: 'hsl(142 71% 45%)',
  refunded: 'hsl(220 9% 46%)',
  disputed: 'hsl(0 84% 60%)',
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
};

export default function Analytics() {
  const { data: stats } = usePlatformStats();
  const { data: monthlyData = [] } = useMonthlyAnalytics();

  const volumeData = useMemo(() =>
    monthlyData.map(m => ({ month: m.month, volume: m.volume / 1_000_000 })), [monthlyData]);

  const feeData = useMemo(() =>
    monthlyData.map(m => ({ month: m.month, fees: m.feesCollected / 1_000_000 })), [monthlyData]);

  const countData = useMemo(() =>
    monthlyData.map(m => ({ month: m.month, count: m.escrowCount })), [monthlyData]);

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

  const totalVolume = monthlyData.reduce((s, m) => s + m.volume, 0);
  const totalEscrows = monthlyData.reduce((s, m) => s + m.escrowCount, 0);
  const totalFees = monthlyData.reduce((s, m) => s + m.feesCollected, 0);
  const avgSize = totalEscrows > 0 ? totalVolume / totalEscrows : 0;

  const summaryCards = [
    { title: 'Total Volume', value: totalVolume, icon: TrendingUp, isAmount: true },
    { title: 'Total Escrows', value: totalEscrows, icon: Hash, isAmount: false },
    { title: 'Fees Collected', value: totalFees, icon: Coins, isAmount: true },
    { title: 'Avg Escrow Size', value: avgSize, icon: Calculator, isAmount: true },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {summaryCards.map((card, i) => (
          <motion.div key={card.title} custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <card.icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{card.title}</span>
                </div>
                <p className="text-xl font-mono font-semibold">
                  {card.isAmount ? <AmountDisplay micro={card.value} showUsd={false} /> : card.value.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Volume Bar Chart */}
      <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Volume Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `${v} STX`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value.toLocaleString()} STX`, 'Volume']} />
                  <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Escrow Count Trend */}
      <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Escrow Count Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={countData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value, 'Escrows']} />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--primary))' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Fee Revenue + Status Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Fee Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={feeData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `${v} STX`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value.toLocaleString()} STX`, 'Fees']} />
                    <Area type="monotone" dataKey="fees" stroke="hsl(var(--accent-warm))" fill="hsl(var(--accent-warm))" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={7} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Status Breakdown</CardTitle>
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
    </div>
  );
}
