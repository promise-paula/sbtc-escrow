import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { usePlatformConfig } from '@/hooks/use-admin';
import { PlatformConfig } from '@/lib/types';
import { CONTRACT_ADDRESS, CONTRACT_NAME, CONTRACT_PRINCIPAL, MAX_FEE_BPS, MIN_DISPUTE_TIMEOUT, MAX_DISPUTE_TIMEOUT, SAFE_MIN_DISPUTE_TIMEOUT, STACKS_NETWORK, DEFAULT_MINUTES_PER_BLOCK, EXPLORER_BASE } from '@/lib/stacks-config';
import { isValidStacksAddress, formatSTX, formatSBTC, blocksToTime } from '@/lib/utils';
import { useBlockRate } from '@/hooks/use-block-rate';
import { useBurnBlockHeight } from '@/hooks/use-burn-block-height';
import { BURN_BLOCK_MINUTES } from '@/lib/stacks-config';
import { pauseContract, unpauseContract, setPlatformFee, setFeeRecipient, setDisputeTimeout, transferOwnership } from '@/lib/admin-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardSkeleton } from '@/components/shared/PageSkeletons';
import { cardVariants } from '@/lib/motion';
import { AlertTriangle, DollarSign, Clock, UserCheck, Info } from 'lucide-react';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

// Presets use fixed block counts (at 1.5 min/block) so the value sent on-chain
// is deterministic and doesn't fluctuate with the live block rate.
const timeoutPresets = [
  { label: '5 blocks (testing)', blocks: 5 },
  { label: '1 day (~960 blocks)', blocks: 960 },
  { label: '1 week (~6,720 blocks)', blocks: 6_720 },
  { label: '30 days (~28,800 blocks)', blocks: 28_800 },
];

// v3 pause is bounded by burn-block duration. Presets calibrated for testnet
// (~4 min/burn block) AND mainnet (~10 min/burn block) by anchoring on burn
// blocks, not wall-clock. The same `duration` value also becomes the
// anti-chaining cooldown after auto-unpause.
const pauseDurationPresets = [
  { label: '10 blocks (~40 min testnet / ~1.7h mainnet)', blocks: 10 },
  { label: '1 hour (6 blocks)', blocks: 6 },
  { label: '24 hours (144 blocks)', blocks: 144 },
  { label: '7 days (1,008 blocks)', blocks: 1_008 },
];

export default function ContractControls() {
  const { data: config, isLoading, isError } = usePlatformConfig();
  const queryClient = useQueryClient();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;
  const [feeBps, setFeeBps] = useState('');
  const [feeRecip, setFeeRecip] = useState('');
  const [timeout, setTimeoutVal] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [acknowledgeUnsafeTimeout, setAcknowledgeUnsafeTimeout] = useState(false);
  // Default to 24h. v3 mandates an explicit duration on pause; the same
  // value becomes the anti-chaining cooldown after the pause auto-lifts.
  const [pauseBlocks, setPauseBlocks] = useState('144');
  // Tracks a pause/unpause tx that's been broadcast but not yet reflected on
  // the chain read. Previously we optimistically flipped local state right
  // after the wallet returned a txid, which lied to the operator when the tx
  // later aborted (e.g. ERR_PAUSE_COOLDOWN_ACTIVE u4003). Now the UI shows
  // "Confirming…" until usePlatformConfig's chain read catches up, and only
  // then commits to the new label.
  const [pendingPauseTx, setPendingPauseTx] = useState<
    { txid: string; expectedPaused: boolean } | null
  >(null);

  if (config && !initialized) {
    setFeeBps(config.platformFeeBps.toString());
    setTimeoutVal(config.disputeTimeout.toString());
    setInitialized(true);
  }
  // Source of truth for the on-chain pause state. Read directly from the
  // platform-config query (which reads the contract) rather than a local
  // mirror — local state used to drift when the optimistic update lied.
  const chainIsPaused = config?.isPaused ?? false;

  // v3+ cooldown gate: if the cooldown window from a recent pause hasn't
  // elapsed yet, the contract will reject any new pause-contract call with
  // ERR_PAUSE_COOLDOWN_ACTIVE (u4003). Surfacing this BEFORE the admin
  // clicks "Pause" avoids a confusing failed-tx round-trip — the previous
  // UX showed the duration picker as if pausing were available.
  const { data: currentBurnBlock = 0 } = useBurnBlockHeight();
  const cooldownUntil = config?.pauseCooldownUntil ?? 0;
  const cooldownActive =
    !chainIsPaused && cooldownUntil > 0 && currentBurnBlock > 0 && currentBurnBlock < cooldownUntil;
  const cooldownBlocksRemaining = cooldownActive ? cooldownUntil - currentBurnBlock : 0;
  const cooldownMinutesRemaining = Math.ceil(cooldownBlocksRemaining * BURN_BLOCK_MINUTES);

  // Auto-clear the pending banner once the chain catches up, AND poll the
  // chain query while pending so we don't have to wait for the normal
  // refetch cadence.
  React.useEffect(() => {
    if (!pendingPauseTx) return;
    if (config?.isPaused === pendingPauseTx.expectedPaused) {
      setPendingPauseTx(null);
      return;
    }
    const tick = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['platform-config'] });
    }, 5000);
    // Give up after 2 min — by then either the tx aborted on-chain (and we
    // need to surface that via the explorer link) or Hiro's read API is
    // stuck. Either way, stop spinning and let the operator decide.
    const giveUp = setTimeout(() => setPendingPauseTx(null), 120_000);
    return () => {
      clearInterval(tick);
      clearTimeout(giveUp);
    };
  }, [pendingPauseTx, config?.isPaused, queryClient]);

  if (isLoading) return <DashboardSkeleton />;

  // Optimistically update the React Query cache so admin changes persist
  // across navigation while waiting for chainhook to index the on-chain event.
  const patchConfig = (patch: Partial<PlatformConfig>) => {
    queryClient.setQueryData<PlatformConfig>(['platform-config'], (old) =>
      old ? { ...old, ...patch } : old
    );
  };

  const cfg = config!;
  const feeValue = parseInt(feeBps, 10) || 0;
  const timeoutValue = parseInt(timeout, 10) || 0;
  const feeOnHundred = (100 * feeValue / 10000).toFixed(2);

  const handleUnpause = async () => {
    setLoading('pause');
    try {
      const txid = await unpauseContract(CONTRACT_PRINCIPAL);
      setPendingPauseTx({ txid, expectedPaused: false });
    } catch {
      // adminCall already showed a toast with the categorized error message
      // (including u4003 cooldown / u1002 paused). Nothing more to do here.
    } finally {
      setLoading(null);
    }
  };

  const handlePause = async () => {
    const blocks = parseInt(pauseBlocks, 10);
    if (!Number.isFinite(blocks) || blocks <= 0) return;
    setLoading('pause');
    try {
      // ContractControls always targets the currently active contract — admin
      // operations on legacy contracts (if ever needed) go through a separate
      // path that requires explicitly opting into a non-default contract.
      const txid = await pauseContract(CONTRACT_PRINCIPAL, blocks);
      setPendingPauseTx({ txid, expectedPaused: true });
    } catch {
      // toasted upstream
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
        <Card className={`border-l-4 ${chainIsPaused ? 'border-l-destructive' : 'border-l-success'}`}>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${chainIsPaused ? 'bg-destructive' : 'bg-success'}`} />
                <div>
                  <p className="text-sm font-medium">{chainIsPaused ? 'Contract Paused' : 'Contract Active'}</p>
                  <p className="text-xs text-muted-foreground">
                    {chainIsPaused
                      ? 'New escrow creation is blocked. Unpause to resume.'
                      : 'New escrows accepted normally.'}
                  </p>
                </div>
              </div>
              {chainIsPaused && !pendingPauseTx && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleUnpause}
                  disabled={loading === 'pause'}
                >
                  {loading === 'pause' ? 'Unpausing…' : 'Unpause'}
                </Button>
              )}
            </div>

            {/* Confirming banner — visible from the moment the wallet returns
                a txid until either (a) the chain read flips to match what we
                expected, or (b) the 2-min timeout elapses. Replaces the old
                lying optimistic update where the UI said "Paused" instantly
                even when the tx aborted on-chain (e.g. cooldown active). */}
            {pendingPauseTx && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 flex items-start gap-2 text-xs">
                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    Confirming on-chain — {pendingPauseTx.expectedPaused ? 'pausing' : 'unpausing'}…
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Waiting for the next block. If this banner stays for more
                    than ~2 min the tx likely aborted —{' '}
                    <a
                      href={`${EXPLORER_BASE}/txid/${pendingPauseTx.txid}?chain=${STACKS_NETWORK}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      open in Explorer
                    </a>{' '}
                    to see the abort reason.
                  </p>
                </div>
              </div>
            )}

            {/* Cooldown gate — the contract will reject pause-contract with
                u4003 if the cooldown from the previous pause hasn't elapsed
                yet. Showing the duration picker in that state used to trick
                admins into a doomed tx; now we show a clear "wait" panel
                with the remaining time, computed from the on-chain
                pause-cooldown-until field. */}
            {!chainIsPaused && !pendingPauseTx && cooldownActive && (
              <div className="space-y-2 border-t border-border pt-4">
                <div className="rounded-md border border-warning/40 bg-warning/5 p-3 flex items-start gap-2 text-xs text-foreground">
                  <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" />
                  <div>
                    <p className="font-medium">Pause cooldown active</p>
                    <p className="text-muted-foreground mt-0.5">
                      Last pause's anti-chaining cooldown is still in effect.
                      Cooldown clears at burn block{' '}
                      <span className="font-mono">{cooldownUntil.toLocaleString()}</span>{' '}
                      — about{' '}
                      <strong>
                        {cooldownBlocksRemaining} block{cooldownBlocksRemaining === 1 ? '' : 's'}{' '}
                        (~{cooldownMinutesRemaining} min)
                      </strong>{' '}
                      from now. Any pause attempt before then will revert
                      with <span className="font-mono">u4003</span>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!chainIsPaused && !pendingPauseTx && !cooldownActive && (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 flex items-start gap-2 text-xs text-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground" />
                  <span>
                    Pause is <strong>time-bound</strong>. The same duration becomes
                    the anti-chaining cooldown — admin cannot re-pause until both
                    have elapsed. Pick a duration, then confirm.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Pause duration (burn blocks)</Label>
                  <div className="flex flex-wrap gap-2">
                    {pauseDurationPresets.map((p) => (
                      <Button
                        key={p.blocks}
                        type="button"
                        variant={pauseBlocks === p.blocks.toString() ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPauseBlocks(p.blocks.toString())}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="number"
                      min={1}
                      value={pauseBlocks}
                      onChange={(e) => setPauseBlocks(e.target.value)}
                      className="font-mono text-sm w-32"
                    />
                    <span className="text-xs text-muted-foreground">
                      burn blocks (custom)
                    </span>
                  </div>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handlePause}
                  disabled={loading === 'pause' || !!pendingPauseTx || !parseInt(pauseBlocks, 10)}
                >
                  {loading === 'pause' ? 'Pausing…' : 'Pause Contract'}
                </Button>
              </div>
            )}
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
            <Button size="sm" disabled={feeValue < 0 || feeValue > MAX_FEE_BPS || loading === 'fee'} onClick={async () => { setLoading('fee'); try { await setPlatformFee(CONTRACT_PRINCIPAL, feeValue); patchConfig({ platformFeeBps: feeValue }); } finally { setLoading(null); } }}>
              Update Fee
            </Button>
            <div className="border-t border-border pt-4 space-y-1.5">
              <Label className="text-xs">Fee Recipient</Label>
              <Input placeholder="ST... or SP..." value={feeRecip} onChange={e => setFeeRecip(e.target.value)} className="font-mono text-sm" />
              <Button size="sm" disabled={!isValidStacksAddress(feeRecip) || loading === 'recipient'} onClick={async () => { setLoading('recipient'); try { await setFeeRecipient(CONTRACT_PRINCIPAL, feeRecip); patchConfig({ feeRecipient: feeRecip }); } finally { setLoading(null); } }}>
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
                <Button
                  key={p.label}
                  variant={timeoutValue === p.blocks ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setTimeoutVal(p.blocks.toString()); setAcknowledgeUnsafeTimeout(false); }}
                  className="text-xs"
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={timeout}
                onChange={e => { setTimeoutVal(e.target.value); setAcknowledgeUnsafeTimeout(false); }}
                className="font-mono text-sm w-40"
                min={MIN_DISPUTE_TIMEOUT}
                max={MAX_DISPUTE_TIMEOUT}
              />
              <span className="text-xs text-muted-foreground">blocks (~{blocksToTime(timeoutValue)})</span>
            </div>
            {timeoutValue >= MIN_DISPUTE_TIMEOUT && timeoutValue < SAFE_MIN_DISPUTE_TIMEOUT && (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3 space-y-2">
                <div className="flex items-start gap-2 text-xs text-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Very short dispute window</p>
                    <p className="text-muted-foreground mt-0.5">
                      {timeoutValue} block{timeoutValue === 1 ? '' : 's'} (~{blocksToTime(timeoutValue, minutesPerBlock)}) is below {SAFE_MIN_DISPUTE_TIMEOUT} blocks. On mainnet this can let buyers self-recover before an admin can review a dispute. Use only for testing.
                    </p>
                  </div>
                </div>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledgeUnsafeTimeout}
                    onChange={e => setAcknowledgeUnsafeTimeout(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I understand and want to set this anyway.</span>
                </label>
              </div>
            )}
            <Button
              size="sm"
              disabled={
                timeoutValue < MIN_DISPUTE_TIMEOUT ||
                timeoutValue > MAX_DISPUTE_TIMEOUT ||
                loading === 'timeout' ||
                (timeoutValue < SAFE_MIN_DISPUTE_TIMEOUT && !acknowledgeUnsafeTimeout)
              }
              onClick={async () => {
                setLoading('timeout');
                try {
                  await setDisputeTimeout(CONTRACT_PRINCIPAL, timeoutValue);
                  patchConfig({ disputeTimeout: timeoutValue });
                  setAcknowledgeUnsafeTimeout(false);
                } finally {
                  setLoading(null);
                }
              }}
            >
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
            <Button size="sm" variant="outline" disabled={!isValidStacksAddress(newOwner) || loading === 'transfer'} onClick={async () => { setLoading('transfer'); await transferOwnership(CONTRACT_PRINCIPAL, newOwner); setLoading(null); }}>
              Initiate Transfer
            </Button>
            <p className="text-xs text-muted-foreground">2-step process: initiate, then the new owner must accept.</p>
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
              { label: 'Version', value: 'v5.0.0', mono: true },
              { label: 'Network', value: STACKS_NETWORK, capitalize: true },
              { label: 'Dispute Timeout', value: `${cfg.disputeTimeout.toLocaleString()} blocks` },
              { label: 'Min Amount (STX)', value: `${formatSTX(cfg.minAmount)} STX`, mono: true },
              { label: 'Max Amount (STX)', value: `${formatSTX(cfg.maxAmount)} STX`, mono: true },
              { label: 'Min Amount (sBTC)', value: `${formatSBTC(cfg.minAmountSbtc)} sBTC`, mono: true },
              { label: 'Max Amount (sBTC)', value: `${formatSBTC(cfg.maxAmountSbtc)} sBTC`, mono: true },
              { label: 'Max Duration', value: `${cfg.maxDuration.toLocaleString()} blocks (~${blocksToTime(cfg.maxDuration)})` },
            ].map((row, idx) => (
              <div key={row.label} className={`flex justify-between items-center gap-3 p-3 text-sm ${idx % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <span className="text-muted-foreground shrink-0">{row.label}</span>
                <span className={`truncate ${row.mono ? 'font-mono text-xs' : ''} ${row.capitalize ? 'capitalize' : ''}`}>{row.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 pb-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Contract Controls</h1>

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
