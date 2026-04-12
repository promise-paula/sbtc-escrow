import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { usePlatformConfig } from '@/hooks/use-admin';
import { CONTRACT_ADDRESS, CONTRACT_NAME, MAX_FEE_BPS, MIN_DISPUTE_TIMEOUT, MAX_DISPUTE_TIMEOUT, BLOCKS_PER_DAY, BLOCKS_PER_WEEK, STACKS_NETWORK } from '@/lib/stacks-config';
import { isValidStacksAddress, formatSTX, blocksToTime } from '@/lib/utils';
import { pauseContract, unpauseContract, setPlatformFee, setFeeRecipient, setDisputeTimeout, initiateOwnershipTransfer } from '@/lib/admin-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardSkeleton } from '@/components/shared/PageSkeletons';
import { cardVariants } from '@/lib/motion';
import { AlertTriangle, DollarSign, Clock, UserCheck, Info } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

const timeoutPresets = [
  { label: '5 blocks (testing)', blocks: 5 },
  { label: '1 day', blocks: BLOCKS_PER_DAY },
  { label: '1 week', blocks: BLOCKS_PER_WEEK },
  { label: '30 days', blocks: BLOCKS_PER_DAY * 30 },
];

export default function ContractControls() {
  const { data: config, isLoading, isError } = usePlatformConfig();
  const [isPaused, setIsPaused] = useState(false);
  const [feeBps, setFeeBps] = useState('');
  const [feeRecip, setFeeRecip] = useState('');
  const [timeout, setTimeoutVal] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  if (config && !initialized) {
    setIsPaused(config.isPaused);
    setFeeBps(config.platformFeeBps.toString());
    setTimeoutVal(config.disputeTimeout.toString());
    setInitialized(true);
  }

  if (isLoading) return <DashboardSkeleton />;

  const cfg = config!;
  const feeValue = parseInt(feeBps) || 0;
  const timeoutValue = parseInt(timeout) || 0;
  const feeOnHundred = (100 * feeValue / 10000).toFixed(2);

  const handleTogglePause = async () => {
    setLoading('pause');
    try {
      if (isPaused) await unpauseContract();
      else await pauseContract();
      setIsPaused(!isPaused);
    } finally {
      setLoading(null);
    }
  };

  const sections = [
    {
      key: 'emergency',
      icon: AlertTriangle,
      title: 'Emergency Controls',
      content: (
        <Card className={`border-l-4 ${isPaused ? 'border-l-destructive' : 'border-l-success'}`}>
          <CardContent className="p-4 space-y-4">
            {!isPaused && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 flex items-start gap-2 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Pausing the contract will prevent all new escrows and actions.
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${isPaused ? 'bg-destructive' : 'bg-success'}`} />
                <div>
                  <p className="text-sm font-medium">{isPaused ? 'Contract Paused' : 'Contract Active'}</p>
                  <p className="text-xs text-muted-foreground">Toggle to {isPaused ? 'resume' : 'pause'} all operations</p>
                </div>
              </div>
              <Switch checked={isPaused} onCheckedChange={handleTogglePause} disabled={loading === 'pause'} />
            </div>
          </CardContent>
        </Card>
      ),
    },
    {
      key: 'fees',
      icon: DollarSign,
      title: 'Fee Management',
      content: (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Platform Fee (BPS)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={feeBps} onChange={e => setFeeBps(e.target.value)} className="font-mono text-sm w-32" min={0} max={MAX_FEE_BPS} />
                <span className="text-xs text-muted-foreground">{(feeValue / 100).toFixed(2)}% (max {MAX_FEE_BPS / 100}%)</span>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Fee preview:</span> On a 100 STX escrow → {feeOnHundred} STX fee
            </div>
            <Button size="sm" disabled={feeValue < 0 || feeValue > MAX_FEE_BPS || loading === 'fee'} onClick={async () => { setLoading('fee'); await setPlatformFee(feeValue); setLoading(null); }}>
              Update Fee
            </Button>
            <div className="border-t border-border pt-4 space-y-1.5">
              <Label className="text-xs">Fee Recipient</Label>
              <Input placeholder="ST... or SP..." value={feeRecip} onChange={e => setFeeRecip(e.target.value)} className="font-mono text-sm" />
              <Button size="sm" disabled={!isValidStacksAddress(feeRecip) || loading === 'recipient'} onClick={async () => { setLoading('recipient'); await setFeeRecipient(feeRecip); setLoading(null); }}>
                Update Recipient
              </Button>
            </div>
          </CardContent>
        </Card>
      ),
    },
    {
      key: 'timeout',
      icon: Clock,
      title: 'Dispute Timeout',
      content: (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2 flex-wrap">
              {timeoutPresets.map(p => (
                <Button key={p.label} variant={timeoutValue === p.blocks ? 'default' : 'outline'} size="sm" onClick={() => setTimeoutVal(p.blocks.toString())} className="text-xs">
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input type="number" value={timeout} onChange={e => setTimeoutVal(e.target.value)} className="font-mono text-sm w-40" min={MIN_DISPUTE_TIMEOUT} max={MAX_DISPUTE_TIMEOUT} />
              <span className="text-xs text-muted-foreground">blocks (~{blocksToTime(timeoutValue)})</span>
            </div>
            <Button size="sm" disabled={timeoutValue < MIN_DISPUTE_TIMEOUT || timeoutValue > MAX_DISPUTE_TIMEOUT || loading === 'timeout'} onClick={async () => { setLoading('timeout'); await setDisputeTimeout(timeoutValue); setLoading(null); }}>
              Update Timeout
            </Button>
          </CardContent>
        </Card>
      ),
    },
    {
      key: 'ownership',
      icon: UserCheck,
      title: 'Ownership Transfer',
      content: (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">New Owner Address</Label>
              <Input placeholder="ST... or SP..." value={newOwner} onChange={e => setNewOwner(e.target.value)} className="font-mono text-sm" />
            </div>
            <Button size="sm" variant="outline" disabled={!isValidStacksAddress(newOwner) || loading === 'transfer'} onClick={async () => { setLoading('transfer'); await initiateOwnershipTransfer(newOwner); setLoading(null); }}>
              Initiate Transfer
            </Button>
            <p className="text-[10px] text-muted-foreground">2-step process: initiate, then the new owner must accept.</p>
          </CardContent>
        </Card>
      ),
    },
    {
      key: 'info',
      icon: Info,
      title: 'Contract Information',
      content: (
        <Card>
          <CardContent className="p-0">
            {[
              { label: 'Address', value: `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`, mono: true },
              { label: 'Version', value: 'v3.0.0', mono: true },
              { label: 'Network', value: STACKS_NETWORK, capitalize: true },
              { label: 'Dispute Timeout', value: `${cfg.disputeTimeout.toLocaleString()} blocks` },
              { label: 'Min Amount', value: `${formatSTX(cfg.minAmount)} STX`, mono: true },
              { label: 'Max Amount', value: `${formatSTX(cfg.maxAmount)} STX`, mono: true },
              { label: 'Max Duration', value: `${cfg.maxDuration.toLocaleString()} blocks (~${blocksToTime(cfg.maxDuration)})` },
            ].map((row, idx) => (
              <div key={row.label} className={`flex justify-between items-center p-3 text-sm ${idx % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <span className="text-muted-foreground">{row.label}</span>
                <span className={`${row.mono ? 'font-mono text-xs' : ''} ${row.capitalize ? 'capitalize' : ''}`}>{row.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Contract Controls</h1>

      {isError && <ErrorBanner message="Failed to load configuration. Showing cached data." />}

      {sections.map((section, i) => {
        const Icon = section.icon;
        return (
          <motion.div key={section.key} custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                {section.title}
              </h2>
              {section.content}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
