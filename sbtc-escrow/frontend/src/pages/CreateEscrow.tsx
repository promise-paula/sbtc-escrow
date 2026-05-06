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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isValidStacksAddress, formatSTX, formatSBTC, formatAmount, tokenLabel, calculateFee, toSmallestUnit, blockToEstimatedDate, blocksToTime, getExplorerUrl, truncateAddress } from '@/lib/utils';
import { useBlockHeight } from '@/hooks/use-block-height';
import { useBlockRate, timeToBlocks } from '@/hooks/use-block-rate';
import { useAddressBook } from '@/hooks/use-address-book';
import { useUsdEstimate, useUsdValue } from '@/hooks/use-usd-estimate';
import { MIN_DURATION_BLOCKS, MAX_DURATION_BLOCKS, MIN_AMOUNT_STX, MAX_AMOUNT_STX, MIN_AMOUNT_SBTC, MAX_AMOUNT_SBTC, DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';
import { createEscrow } from '@/lib/escrow-service';
import { TokenType } from '@/lib/types';
import { TransactionPending } from '@/components/shared/TransactionPending';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { cardVariants, dur, scaleIn, shake } from '@/lib/motion';
import { Check, ArrowRight, ArrowLeft, ExternalLink, User, Coins, FileCheck, AlertCircle, BookUser } from 'lucide-react';

/** Time-based duration presets (in minutes) */
const durationPresets = [
  { label: '10 Min', minutes: 10 },
  { label: '1 Hour', minutes: 60 },
  { label: '6 Hours', minutes: 60 * 6 },
  { label: '1 Day', minutes: 60 * 24 },
  { label: '1 Week', minutes: 60 * 24 * 7 },
  { label: '30 Days', minutes: 60 * 24 * 30 },
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
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;
  const [step, setStep] = useState(1);

  const [recipient, setRecipient] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60 * 24 * 7); // default 1 week
  const [customDuration, setCustomDuration] = useState('');
  const [consent, setConsent] = useState(false);
  const [tokenType, setTokenType] = useState<TokenType>(TokenType.STX);

  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState('');
  const [txError, setTxError] = useState<{ title: string; hint: string; detail?: string } | null>(null);

  const { entries: contacts, findByAddress, add: addContact } = useAddressBook();
  const matchedContact = recipient ? findByAddress(recipient) : undefined;
  const [contactName, setContactName] = useState('');
  const [contactSaved, setContactSaved] = useState(false);

  const handleSaveContact = () => {
    const name = contactName.trim();
    if (!name) return;
    addContact(name, recipient);
    setContactSaved(true);
    setContactName('');
    toast.success('Contact saved');
  };

  const cfg = config || { platformFeeBps: 50, minAmount: MIN_AMOUNT_STX, maxAmount: MAX_AMOUNT_STX, minAmountSbtc: MIN_AMOUNT_SBTC, maxAmountSbtc: MAX_AMOUNT_SBTC };
  const amount = parseFloat(amountStr) || 0;
  const decimals = tokenType === TokenType.SBTC ? 8 : 6;
  const smallestUnit = Math.floor(amount * (10 ** decimals));
  const minAmt = tokenType === TokenType.SBTC ? (cfg.minAmountSbtc ?? MIN_AMOUNT_SBTC) : cfg.minAmount;
  const maxAmt = tokenType === TokenType.SBTC ? (cfg.maxAmountSbtc ?? MAX_AMOUNT_SBTC) : cfg.maxAmount;
  const fee = calculateFee(smallestUnit, cfg.platformFeeBps);
  const total = smallestUnit + fee;
  const duration = customDuration
    ? parseInt(customDuration, 10)
    : timeToBlocks(durationMinutes, minutesPerBlock);
  const token = tokenLabel(tokenType);

  const amountUsd = useUsdEstimate(smallestUnit, tokenType);
  const feeUsd = useUsdEstimate(fee, tokenType);
  const totalUsd = useUsdEstimate(total, tokenType);
  // Contextual USD on the amount input — shown regardless of the global
  // "Show USD" toggle so the buyer always knows the value of what they're entering.
  const amountUsdInput = useUsdValue(smallestUnit, tokenType);
  const feeUsdInput = useUsdValue(fee, tokenType);
  const totalUsdInput = useUsdValue(total, tokenType);

  const recipientValid = isValidStacksAddress(recipient);
  const selfEscrow = recipient === address;
  const amountValid = smallestUnit >= minAmt && smallestUnit <= maxAmt;
  const descValid = description.trim().length > 0 && description.length <= 256;
  const durationValid = duration >= MIN_DURATION_BLOCKS && duration <= MAX_DURATION_BLOCKS;

  const step1Valid = recipientValid && !selfEscrow;
  const step2Valid = amountValid && descValid && durationValid;

  const progressPercent = step === 1 ? 33 : step === 2 ? 66 : 100;

  const handleSubmit = async () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }
    setTxStatus('pending');
    setTxError(null);
    try {
      const hash = await createEscrow({ buyer: address, seller: recipient, amount: smallestUnit, description: description.trim(), duration, tokenType, feeBps: cfg.platformFeeBps });
      setTxHash(hash);
      setTxStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const low = msg.toLowerCase();
      if (low.includes('reject') || low.includes('denied') || low.includes('cancel') || low.includes('dismissed') || low.includes('closed')) {
        setTxError({ title: 'Wallet signature declined', hint: 'You closed or rejected the wallet prompt. Approve the transaction in your wallet to continue.' });
      } else if (low.includes('insufficient') || low.includes('balance')) {
        setTxError({ title: 'Insufficient balance', hint: `You need ${formatAmount(total, tokenType)} ${token} plus network fees in your wallet.`, detail: msg });
      } else if (low.includes('network') || low.includes('fetch') || low.includes('timeout')) {
        setTxError({ title: 'Network error', hint: 'Could not reach the Stacks network. Check your connection and try again.', detail: msg });
      } else {
        setTxError({ title: 'Transaction failed', hint: 'The transaction could not be submitted.', detail: msg });
      }
      setTxStatus('error');
    }
  };

  if (txStatus === 'pending') {
    return (
      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-6">Create Escrow</h1>
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <TransactionPending txHash={txHash || undefined} message="Creating escrow…" />
        </motion.div>
      </div>
    );
  }

  if (txStatus === 'success') {
    const offerSave = !matchedContact && !contactSaved && recipientValid;
    return (
      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-6">Create Escrow</h1>
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible" className="flex flex-col items-center py-12 text-center">
          <motion.div variants={scaleIn} initial="initial" animate="animate" className="rounded-full bg-success/10 p-3 mb-4"><Check className="h-6 w-6 text-success" /></motion.div>
          <h3 className="text-sm font-medium">Escrow Created Successfully</h3>
          <p className="text-xs text-muted-foreground mt-1">Your escrow has been created and funds are locked.</p>
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={() => navigate('/escrows')}>View Escrows</Button>
            <Button size="sm" variant="outline" asChild>
              <a href={getExplorerUrl('tx', txHash)} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Explorer
              </a>
            </Button>
          </div>

          {offerSave && (
            <div className="mt-8 pt-6 border-t border-border w-full max-w-sm text-left">
              <p className="text-xs text-muted-foreground mb-2">Save this seller for next time?</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Name (e.g. Alice)"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  className="text-sm"
                  maxLength={64}
                />
                <Button
                  size="sm"
                  onClick={handleSaveContact}
                  disabled={!contactName.trim()}
                  className="gap-1.5 shrink-0"
                >
                  <BookUser className="h-3.5 w-3.5" /> Save
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-2 font-mono truncate">
                {truncateAddress(recipient, 8)}
              </p>
            </div>
          )}
          {contactSaved && (
            <p className="text-xs text-muted-foreground mt-6 inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-success" /> Saved to your address book
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  if (txStatus === 'error') {
    return (
      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-6">Create Escrow</h1>
        <motion.div variants={shake} initial="initial" animate="animate" className="flex flex-col items-center py-12 text-center">
          <div className="rounded-full bg-destructive/10 p-3 mb-4">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-sm font-medium text-destructive">{txError?.title ?? 'Transaction failed'}</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">{txError?.hint ?? 'The transaction could not be submitted.'}</p>
          {txError?.detail && (
            <p className="text-[11px] font-mono text-muted-foreground/70 mt-3 max-w-sm break-words">{txError.detail}</p>
          )}
          <Button size="sm" onClick={() => { setTxStatus('idle'); setTxError(null); }} className="mt-4">Try Again</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Create Escrow</h1>

      {/* Step indicator */}
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          {steps.map((s, i) => {
            const num = i + 1;
            const StepIcon = s.icon;
            return (
              <React.Fragment key={num}>
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-medium transition-all ${
                    num < step ? 'bg-primary text-primary-foreground' :
                    num === step ? 'bg-primary text-primary-foreground shadow-glow-sm' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {num < step ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                  </div>
                  <span className={`text-xs font-medium truncate ${
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
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <User className="h-4 w-4 text-primary" /> Counterparty
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Recipient Address</Label>
                    {contacts.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1.5 -mr-2">
                            <BookUser className="h-3.5 w-3.5" /> Pick from contacts
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-72" align="end">
                          <div className="max-h-64 overflow-y-auto py-1">
                            {contacts.map(c => (
                              <button
                                key={c.address}
                                type="button"
                                onClick={() => setRecipient(c.address)}
                                className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                              >
                                <p className="text-sm font-medium truncate">{c.name}</p>
                                <p className="text-xs font-mono text-muted-foreground truncate">
                                  {truncateAddress(c.address, 8)}
                                </p>
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  <Input
                    placeholder="ST... or SP..."
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    className="font-mono text-sm"
                  />
                  {matchedContact && (
                    <p className="text-xs text-muted-foreground">
                      From contacts: <span className="text-foreground font-medium">{matchedContact.name}</span>
                    </p>
                  )}
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
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Coins className="h-4 w-4 text-primary" /> Asset Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Token</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={tokenType === TokenType.STX ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => { setTokenType(TokenType.STX); setAmountStr(''); }}
                    >
                      STX
                    </Button>
                    <Button
                      type="button"
                      variant={tokenType === TokenType.SBTC ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => { setTokenType(TokenType.SBTC); setAmountStr(''); }}
                    >
                      sBTC
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label className="text-xs">Amount ({token})</Label>
                    {amountValid && amountUsdInput && (
                      <span className="text-xs text-muted-foreground tabular-nums">≈ {amountUsdInput}</span>
                    )}
                  </div>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amountStr}
                    onChange={e => setAmountStr(e.target.value)}
                    className="font-mono text-sm"
                    min={0}
                    step={tokenType === TokenType.SBTC ? 0.0001 : 0.01}
                  />
                  {amountStr && !amountValid && (
                    <p className="text-xs text-destructive" role="alert">
                      Amount must be between {formatAmount(minAmt, tokenType)} and {formatAmount(maxAmt, tokenType)} {token}
                    </p>
                  )}
                  {amountValid && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>
                        Fee: {formatAmount(fee, tokenType)} {token} ({cfg.platformFeeBps / 100}%)
                        {feeUsdInput && <span className="ml-1">· ≈ {feeUsdInput}</span>}
                      </p>
                      <p>
                        Total: {formatAmount(total, tokenType)} {token}
                        {totalUsdInput && <span className="ml-1">· ≈ {totalUsdInput}</span>}
                      </p>
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
                    <span>{!descValid && description.trim().length === 0 ? 'Required' : ''}</span>
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
                        variant={!customDuration && durationMinutes === p.minutes ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setDurationMinutes(p.minutes); setCustomDuration(''); }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      type="number"
                      placeholder={`Min ${MIN_DURATION_BLOCKS} blocks`}
                      value={customDuration}
                      onChange={e => setCustomDuration(e.target.value)}
                      className="font-mono text-sm w-40"
                      min={MIN_DURATION_BLOCKS}
                      max={MAX_DURATION_BLOCKS}
                    />
                    <span className="text-xs text-muted-foreground">blocks</span>
                  </div>
                  {customDuration && !durationValid && (
                    <p className="text-xs text-destructive">
                      Minimum {MIN_DURATION_BLOCKS} blocks (~{blocksToTime(MIN_DURATION_BLOCKS, minutesPerBlock)}). Short durations may expire before the seller can act.
                    </p>
                  )}
                  {durationValid && (
                    <p className="text-xs text-muted-foreground">
                      Expires: ~{blockToEstimatedDate(currentBlock + duration, currentBlock, minutesPerBlock).toLocaleDateString()} ({blocksToTime(duration, minutesPerBlock)})
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
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <FileCheck className="h-4 w-4 text-primary" /> Review & Confirm
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border divide-y divide-border text-sm">
                  <div className="flex justify-between gap-3 p-3">
                    <span className="text-muted-foreground shrink-0">Recipient</span>
                    <span className="font-mono text-xs truncate">{recipient}</span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Token</span>
                    <span className="font-mono">{token}</span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-mono text-right">
                      {formatAmount(smallestUnit, tokenType)} {token}
                      {amountUsd && <span className="block text-xs text-muted-foreground">{amountUsd}</span>}
                    </span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Fee ({cfg.platformFeeBps / 100}%)</span>
                    <span className="font-mono text-right">
                      {formatAmount(fee, tokenType)} {token}
                      {feeUsd && <span className="block text-xs text-muted-foreground">{feeUsd}</span>}
                    </span>
                  </div>
                  <div className="flex justify-between p-3 font-medium">
                    <span>Total</span>
                    <span className="font-mono text-right">
                      {formatAmount(total, tokenType)} {token}
                      {totalUsd && <span className="block text-xs text-muted-foreground font-normal">{totalUsd}</span>}
                    </span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{blocksToTime(duration, minutesPerBlock)} ({duration.toLocaleString()} blocks)</span>
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
                  <Button onClick={handleSubmit} disabled={!consent} className="flex-1 shadow-glow-md hover:shadow-glow-lg transition-shadow">
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
