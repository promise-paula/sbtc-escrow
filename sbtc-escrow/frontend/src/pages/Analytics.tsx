import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { mockMonthlyAnalytics } from '@/lib/mock-data';
import { usePlatformStats } from '@/hooks/use-admin';
import { TrendingUp, Hash, Coins, Calculator } from 'lucide-react';
import { cardVariants } from '@/lib/motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';

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

  const volumeData = useMemo(() =>
    mockMonthlyAnalytics.map(m => ({ month: m.month, volume: m.volume / 1_000_000 })), []);

  const feeData = useMemo(() =>
    mockMonthlyAnalytics.map(m => ({ month: m.month, fees: m.feesCollected / 1_000_000 })), []);

  const countData = useMemo(() =>
    mockMonthlyAnalytics.map(m => ({ month: m.month, count: m.escrowCount })), []);

  const statusTotals = useMemo(() => {
    const totals = mockMonthlyAnalytics.reduce(
      (acc, m) => ({ released: acc.released + m.released, refunded: acc.refunded + m.refunded, disputed: acc.disputed + m.disputed }),
      { released: 0, refunded: 0, disputed: 0 }
    );
    return [
      { name: 'Released', value: totals.released, color: STATUS_COLORS.released },
      { name: 'Refunded', value: totals.refunded, color: STATUS_COLORS.refunded },
      { name: 'Disputed', value: totals.disputed, color: STATUS_COLORS.disputed },
    ];
  }, []);

  const totalVolume = mockMonthlyAnalytics.reduce((s, m) => s + m.volume, 0);
  const totalEscrows = mockMonthlyAnalytics.reduce((s, m) => s + m.escrowCount, 0);
  const totalFees = mockMonthlyAnalytics.reduce((s, m) => s + m.feesCollected, 0);
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
