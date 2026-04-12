import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';
import { usePlatformConfig } from '@/hooks/use-admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { isValidStacksAddress, formatSTX, calculateFee, blockToEstimatedDate, blocksToTime } from '@/lib/utils';
import { useBlockHeight } from '@/hooks/use-block-height';
import { BLOCKS_PER_DAY, BLOCKS_PER_WEEK, MAX_DURATION_BLOCKS } from '@/lib/stacks-config';
import { createEscrow } from '@/lib/escrow-service';
import { TransactionPending } from '@/components/shared/TransactionPending';
import { motion, AnimatePresence } from 'framer-motion';
import { cardVariants, dur } from '@/lib/motion';
import { Check, ArrowRight, ArrowLeft, ExternalLink, User, Coins, FileCheck } from 'lucide-react';

const durationPresets = [
  { label: '1 Day', blocks: BLOCKS_PER_DAY },
  { label: '1 Week', blocks: BLOCKS_PER_WEEK },
  { label: '2 Weeks', blocks: BLOCKS_PER_WEEK * 2 },
  { label: '30 Days', blocks: BLOCKS_PER_DAY * 30 },
];

const steps = [
  { label: 'Counterparty', icon: User },
  { label: 'Asset Details', icon: Coins },
  { label: 'Review', icon: FileCheck },
];

const stepTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { duration: dur(300), ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -20, transition: { duration: dur(200) } },
};

export default function CreateEscrow() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const { data: config } = usePlatformConfig();
  const { data: currentBlock = 0 } = useBlockHeight();
  const [step, setStep] = useState(1);

  const [recipient, setRecipient] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [durationBlocks, setDurationBlocks] = useState(BLOCKS_PER_WEEK);
  const [customDuration, setCustomDuration] = useState('');
  const [consent, setConsent] = useState(false);

  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState('');

  const cfg = config || { platformFeeBps: 50, minAmount: 1_000_000, maxAmount: 100_000_000_000 };
  const amount = parseFloat(amountStr) || 0;
  const microAmount = Math.floor(amount * 1_000_000);
  const fee = calculateFee(microAmount, cfg.platformFeeBps);
  const total = microAmount + fee;
  const duration = customDuration ? parseInt(customDuration) : durationBlocks;

  const recipientValid = isValidStacksAddress(recipient);
  const selfEscrow = recipient === address;
  const amountValid = microAmount >= cfg.minAmount && microAmount <= cfg.maxAmount;
  const descValid = description.trim().length > 0 && description.length <= 256;
  const durationValid = duration >= 1 && duration <= MAX_DURATION_BLOCKS;

  const step1Valid = recipientValid && !selfEscrow;
  const step2Valid = amountValid && descValid && durationValid;

  const progressPercent = step === 1 ? 33 : step === 2 ? 66 : 100;

  const handleSubmit = async () => {
    setTxStatus('pending');
    try {
      const hash = await createEscrow({ seller: recipient, amount: microAmount, description: description.trim(), duration });
      setTxHash(hash);
      setTxStatus('success');
    } catch {
      setTxStatus('error');
    }
  };

  if (txStatus === 'pending') {
    return (
      <div className="p-4 sm:p-6 max-w-lg">
        <h1 className="text-lg font-semibold text-foreground mb-6">Create Escrow</h1>
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <TransactionPending txHash={txHash || undefined} message="Creating escrow…" />
        </motion.div>
      </div>
    );
  }

  if (txStatus === 'success') {
    return (
      <div className="p-4 sm:p-6 max-w-lg">
        <h1 className="text-lg font-semibold text-foreground mb-6">Create Escrow</h1>
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible" className="flex flex-col items-center py-12 text-center">
          <div className="rounded-full bg-success/10 p-3 mb-4"><Check className="h-6 w-6 text-success" /></div>
          <h3 className="text-sm font-medium">Escrow Created Successfully</h3>
          <p className="text-xs text-muted-foreground mt-1">Your escrow has been created and funds are locked.</p>
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={() => navigate('/escrows')}>View Escrows</Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`https://explorer.stacks.co/txid/${txHash}?chain=testnet`} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Explorer
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (txStatus === 'error') {
    return (
      <div className="p-4 sm:p-6 max-w-lg">
        <h1 className="text-lg font-semibold text-foreground mb-6">Create Escrow</h1>
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible" className="flex flex-col items-center py-12 text-center">
          <h3 className="text-sm font-medium text-destructive">Transaction Failed</h3>
          <p className="text-xs text-muted-foreground mt-1">Something went wrong. Please try again.</p>
          <Button size="sm" onClick={() => setTxStatus('idle')} className="mt-4">Retry</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Create Escrow</h1>

      {/* Step indicator */}
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          {steps.map((s, i) => {
            const num = i + 1;
            const StepIcon = s.icon;
            return (
              <React.Fragment key={num}>
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-medium transition-colors ${
                    num < step ? 'bg-primary text-primary-foreground' :
                    num === step ? 'bg-primary text-primary-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {num < step ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                  </div>
                  <span className={`text-[11px] font-medium truncate ${
                    num <= step ? 'text-foreground' : 'text-muted-foreground'
                  }`}>{s.label}</span>
                </div>
                {num < 3 && (
                  <div className={`flex-1 h-px mt-4 ${num < step ? 'bg-primary' : 'bg-border'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <Progress value={progressPercent} className="h-1" />
      </div>

      {/* Animated step content */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" {...stepTransition}>
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <User className="h-4 w-4 text-primary" /> Counterparty
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Recipient Address</Label>
                  <Input
                    placeholder="ST... or SP..."
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    className="font-mono text-sm"
                  />
                  {recipient && !recipientValid && (
                    <p className="text-xs text-destructive" role="alert">Invalid Stacks address</p>
                  )}
                  {selfEscrow && (
                    <p className="text-xs text-destructive" role="alert">Cannot escrow to yourself</p>
                  )}
                </div>
                <Button onClick={() => setStep(2)} disabled={!step1Valid} className="w-full gap-1.5">
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" {...stepTransition}>
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Coins className="h-4 w-4 text-primary" /> Asset Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount (STX)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amountStr}
                    onChange={e => setAmountStr(e.target.value)}
                    className="font-mono text-sm"
                    min={0}
                    step={0.01}
                  />
                  {amountStr && !amountValid && (
                    <p className="text-xs text-destructive" role="alert">
                      Amount must be between {formatSTX(cfg.minAmount)} and {formatSTX(cfg.maxAmount)} STX
                    </p>
                  )}
                  {amountValid && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Fee: {formatSTX(fee)} STX ({cfg.platformFeeBps / 100}%)</p>
                      <p>Total: {formatSTX(total)} STX</p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    placeholder="Describe the goods or services..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    maxLength={256}
                    rows={3}
                    aria-describedby="desc-counter"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground" id="desc-counter">
                    <span>{!descValid && description.length === 0 ? 'Required' : ''}</span>
                    <span>{description.length}/256</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Duration</Label>
                  <div className="flex gap-2 flex-wrap">
                    {durationPresets.map(p => (
                      <Button
                        key={p.label}
                        type="button"
                        variant={!customDuration && durationBlocks === p.blocks ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setDurationBlocks(p.blocks); setCustomDuration(''); }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      type="number"
                      placeholder="Custom blocks"
                      value={customDuration}
                      onChange={e => setCustomDuration(e.target.value)}
                      className="font-mono text-sm w-40"
                      min={1}
                      max={MAX_DURATION_BLOCKS}
                    />
                    <span className="text-xs text-muted-foreground">blocks</span>
                  </div>
                  {durationValid && (
                    <p className="text-xs text-muted-foreground">
                      Expires: ~{blockToEstimatedDate(currentBlock + duration, currentBlock).toLocaleDateString()} ({blocksToTime(duration)})
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!step2Valid} className="flex-1 gap-1.5">
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3" {...stepTransition}>
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <FileCheck className="h-4 w-4 text-primary" /> Review & Confirm
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border divide-y divide-border text-sm">
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Recipient</span>
                    <span className="font-mono text-xs">{recipient}</span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-mono">{formatSTX(microAmount)} STX</span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Fee ({cfg.platformFeeBps / 100}%)</span>
                    <span className="font-mono">{formatSTX(fee)} STX</span>
                  </div>
                  <div className="flex justify-between p-3 font-medium">
                    <span>Total</span>
                    <span className="font-mono">{formatSTX(total)} STX</span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{blocksToTime(duration)} ({duration.toLocaleString()} blocks)</span>
                  </div>
                  <div className="p-3">
                    <span className="text-muted-foreground text-xs">Description</span>
                    <p className="mt-0.5 text-sm">{description}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox id="consent" checked={consent} onCheckedChange={(c) => setConsent(!!c)} />
                  <label htmlFor="consent" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                    I understand that funds will be locked in a smart contract until released, refunded, or resolved through dispute.
                  </label>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="gap-1.5">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button onClick={handleSubmit} disabled={!consent} className="flex-1">
                    Confirm & Deposit
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
