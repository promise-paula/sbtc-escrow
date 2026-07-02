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
import { isValidStacksAddress, formatSTX, formatSBTC, formatAmount, tokenLabel, calculateFee, toSmallestUnit, blockToEstimatedDate, blocksToTime, getExplorerUrl, truncateAddress, getAddressNetwork } from '@/lib/utils';
import { useBlockHeight } from '@/hooks/use-block-height';
import { useBlockRate, timeToBlocks } from '@/hooks/use-block-rate';
import { useAddressBook } from '@/hooks/use-address-book';
import { useUsdEstimate, useUsdValue } from '@/hooks/use-usd-estimate';
import { useWalletBalance, useStxGasBalance } from '@/hooks/use-wallet-balance';
import { CONTRACT_PRINCIPAL, MIN_DURATION_BLOCKS, MIN_AMOUNT_STX, MAX_AMOUNT_STX, MIN_AMOUNT_SBTC, MAX_AMOUNT_SBTC, DEFAULT_MINUTES_PER_BLOCK, STACKS_NETWORK, supportsV3Features, durationToBlocks, maxDurationBlocks, effectiveMinutesPerBlock, MIN_DURATION_BURN_BLOCKS, usesBurnBlockClock } from '@/lib/stacks-config';
import { createEscrow } from '@/lib/escrow-service';
import { TokenType } from '@/lib/types';
import { TransactionPending } from '@/components/shared/TransactionPending';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { cardVariants, dur, scaleIn, shake } from '@/lib/motion';
import { Check, ArrowRight, ArrowLeft, ExternalLink, User, Coins, FileCheck, AlertCircle, AlertTriangle, BookUser } from 'lucide-react';

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
  const [beneficiary, setBeneficiary] = useState('');
  const [showBeneficiary, setShowBeneficiary] = useState(false);
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
  // v3+ contracts (burn-block clock) and legacy contracts (stacks-block clock)
  // count duration differently. Compute the right block count for whichever
  // clock the target contract uses; the rest of the form (presets, display,
  // validation) reads from the same helpers so the math stays consistent.
  const isBurnBlockContract = usesBurnBlockClock(CONTRACT_PRINCIPAL);
  const effMinutesPerBlock = effectiveMinutesPerBlock(CONTRACT_PRINCIPAL, minutesPerBlock);
  const effMaxDuration = maxDurationBlocks(CONTRACT_PRINCIPAL);
  const effMinDuration = isBurnBlockContract ? MIN_DURATION_BURN_BLOCKS : MIN_DURATION_BLOCKS;
  const duration = customDuration
    ? parseInt(customDuration, 10)
    : durationToBlocks(CONTRACT_PRINCIPAL, durationMinutes, minutesPerBlock);
  const token = tokenLabel(tokenType);

  const amountUsd = useUsdEstimate(smallestUnit, tokenType);
  const feeUsd = useUsdEstimate(fee, tokenType);
  const totalUsd = useUsdEstimate(total, tokenType);
  // Contextual USD on the amount input — shown regardless of the global
  // "Show USD" toggle so the buyer always knows the value of what they're entering.
  const amountUsdInput = useUsdValue(smallestUnit, tokenType);
  const feeUsdInput = useUsdValue(fee, tokenType);
  const totalUsdInput = useUsdValue(total, tokenType);

  // Network-aware recipient validation. The contract will reject a
  // mainnet-shaped address on testnet (and vice versa), but a clear UI
  // error catches it before the user signs anything.
  const recipientShapeValid = isValidStacksAddress(recipient);
  const recipientNetwork = recipientShapeValid ? getAddressNetwork(recipient) : null;
  const recipientNetworkMismatch =
    recipientShapeValid && recipientNetwork !== null && recipientNetwork !== STACKS_NETWORK;
  const recipientValid = recipientShapeValid && !recipientNetworkMismatch;
  const expectedPrefixes = STACKS_NETWORK === 'mainnet' ? 'SP / SM' : 'ST / SN';
  const addressPlaceholder = STACKS_NETWORK === 'mainnet' ? 'SP...' : 'ST...';
  const selfEscrow = recipient === address;

  // Beneficiary is v3+ only — gate the input on contract capabilities so the
  // UI is automatically silent on legacy contracts that don't accept the param.
  const supportsBeneficiary = supportsV3Features(CONTRACT_PRINCIPAL);
  const beneficiaryTrimmed = beneficiary.trim();
  const beneficiaryShapeValid = isValidStacksAddress(beneficiaryTrimmed);
  const beneficiaryNetwork = beneficiaryShapeValid
    ? getAddressNetwork(beneficiaryTrimmed)
    : null;
  const beneficiaryNetworkMismatch =
    beneficiaryShapeValid &&
    beneficiaryNetwork !== null &&
    beneficiaryNetwork !== STACKS_NETWORK;
  // Contract enforces these too, but failing fast in the UI saves a tx.
  const beneficiarySameAsBuyer = beneficiaryTrimmed === address;
  const beneficiarySameAsSeller =
    beneficiaryTrimmed.length > 0 && beneficiaryTrimmed === recipient;
  const beneficiaryValid =
    !showBeneficiary ||
    beneficiaryTrimmed.length === 0 ||
    (beneficiaryShapeValid &&
      !beneficiaryNetworkMismatch &&
      !beneficiarySameAsBuyer &&
      !beneficiarySameAsSeller);
  const amountValid = smallestUnit >= minAmt && smallestUnit <= maxAmt;
  const descValid = description.trim().length > 0 && description.length <= 256;
  const durationValid = duration >= effMinDuration && duration <= effMaxDuration;

  // Pre-flight balance check. Gas is always paid in STX, so for sBTC escrows
  // we need both the sBTC for the deposit AND a small STX buffer for gas.
  // GAS_BUFFER (microSTX) is a conservative ceiling for a single contract
  // call — actual cost is typically a fraction of this.
  const GAS_BUFFER = 10_000n; // 0.01 STX
  const { data: tokenBalance, isLoading: tokenBalLoading } = useWalletBalance(tokenType);
  const { data: stxBalance, isLoading: stxBalLoading } = useStxGasBalance();
  const balancesLoading = tokenBalLoading || (tokenType === TokenType.SBTC && stxBalLoading);
  const totalNeeded = BigInt(total);
  const hasTokenBalance = tokenBalance === undefined ? true : tokenBalance >= totalNeeded;
  const hasStxForGas =
    tokenType === TokenType.STX
      ? tokenBalance === undefined
        ? true
        : tokenBalance >= totalNeeded + GAS_BUFFER
      : stxBalance === undefined
        ? true
        : stxBalance >= GAS_BUFFER;
  const balanceSufficient = hasTokenBalance && hasStxForGas;
  const balanceShortfall =
    !amountValid || balancesLoading
      ? null
      : !hasTokenBalance
        ? {
            kind: 'token' as const,
            need: formatAmount(Number(totalNeeded - (tokenBalance ?? 0n)), tokenType),
          }
        : !hasStxForGas
          ? { kind: 'gas' as const, need: '0.01 STX' }
          : null;

  const step1Valid = recipientValid && !selfEscrow && beneficiaryValid;
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
      // New escrows always target the currently active contract — legacy
      // contracts are read/act-on only for escrows that already live there.
      const hash = await createEscrow({
        contractId: CONTRACT_PRINCIPAL,
        buyer: address,
        seller: recipient,
        amount: smallestUnit,
        description: description.trim(),
        duration,
        tokenType,
        feeBps: cfg.platformFeeBps,
        beneficiary:
          supportsBeneficiary && showBeneficiary && beneficiaryTrimmed.length > 0
            ? beneficiaryTrimmed
            : undefined,
      });
      setTxHash(hash);
      setTxStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const low = msg.toLowerCase();
      if (low.includes('reject') || low.includes('denied') || low.includes('cancel') || low.includes('dismissed') || low.includes('closed')) {
        setTxError({ title: 'Wallet signature declined', hint: 'You closed or rejected the wallet prompt. Approve the transaction in your wallet to continue.' });
      } else if (low.includes('insufficient') || low.includes('balance')) {
        setTxError({ title: 'Insufficient balance', hint: `You need ${formatAmount(total, tokenType)} ${token} plus network fees in your wallet.`, detail: msg });
      } else if (low.includes('u1002') || low.includes('contract_paused') || low.includes('contract paused')) {
        // ERR_CONTRACT_PAUSED — race between our pre-flight isPaused read and
        // the broadcast (admin paused in between). Better message than
        // "transaction failed" so the user knows it's not a wallet issue.
        setTxError({ title: 'Contract is paused', hint: 'Admin paused the contract while you were confirming. Try again once it resumes.', detail: msg });
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

      {/* Pause banner — pre-flight check against on-chain `is-paused` so the
          user doesn't burn a wallet round-trip + tx fee just to discover the
          contract isn't accepting new escrows. usePlatformConfig reads
          directly from the chain so this is always current truth. */}
      {config?.isPaused && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2 text-sm text-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Contract is paused</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Admin has temporarily halted normal operations. New escrows,
              releases, refunds, disputes, and deadline extensions are all
              blocked until the pause lifts. Admin dispute resolutions and
              seller self-rescue (for delivered escrows past timeout) still
              work. Check back shortly or contact the operator.
            </p>
          </div>
        </div>
      )}

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
                    <Label htmlFor="recipient" className="text-xs">Recipient Address</Label>
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
                    id="recipient"
                    placeholder={addressPlaceholder}
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {STACKS_NETWORK === 'mainnet'
                      ? 'Mainnet addresses start with SP (or SM for contracts).'
                      : 'Testnet addresses start with ST (or SN for contracts).'}
                  </p>
                  {matchedContact && (
                    <p className="text-xs text-muted-foreground">
                      From contacts: <span className="text-foreground font-medium">{matchedContact.name}</span>
                    </p>
                  )}
                  {recipient && !recipientShapeValid && (
                    <p className="text-xs text-destructive" role="alert">Invalid Stacks address</p>
                  )}
                  {recipientNetworkMismatch && (
                    <p className="text-xs text-destructive" role="alert">
                      This is a {recipientNetwork} address. You're on {STACKS_NETWORK} —
                      use an address starting with {expectedPrefixes}.
                    </p>
                  )}
                  {selfEscrow && (
                    <p className="text-xs text-destructive" role="alert">Cannot escrow to yourself</p>
                  )}
                </div>

                {supportsBeneficiary && (
                  <div className="space-y-1.5">
                    {!showBeneficiary ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1.5 -ml-2"
                        onClick={() => setShowBeneficiary(true)}
                      >
                        + Add a co-buyer (beneficiary)
                      </Button>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="beneficiary" className="text-xs">Beneficiary <span className="text-muted-foreground font-normal">(optional)</span></Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] -mr-2 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setShowBeneficiary(false);
                              setBeneficiary('');
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                        <Input
                          id="beneficiary"
                          placeholder={addressPlaceholder}
                          value={beneficiary}
                          onChange={e => setBeneficiary(e.target.value)}
                          className="font-mono text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Co-buyer with the same release / refund / dispute rights as you.
                          Useful when an intermediary (marketplace, agent) is signing this
                          escrow on behalf of an end user — pass the end user here so they
                          keep control. Leave blank for a standard one-buyer escrow.
                        </p>
                        {beneficiaryTrimmed && !beneficiaryShapeValid && (
                          <p className="text-xs text-destructive" role="alert">Invalid Stacks address</p>
                        )}
                        {beneficiaryNetworkMismatch && (
                          <p className="text-xs text-destructive" role="alert">
                            This is a {beneficiaryNetwork} address. You're on {STACKS_NETWORK} —
                            use an address starting with {expectedPrefixes}.
                          </p>
                        )}
                        {beneficiarySameAsBuyer && (
                          <p className="text-xs text-destructive" role="alert">Beneficiary can't be your own address</p>
                        )}
                        {beneficiarySameAsSeller && (
                          <p className="text-xs text-destructive" role="alert">Beneficiary can't be the recipient</p>
                        )}
                      </>
                    )}
                  </div>
                )}

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
                    <Label htmlFor="amount" className="text-xs">Amount ({token})</Label>
                    {amountValid && amountUsdInput && (
                      <span className="text-xs text-muted-foreground tabular-nums">≈ {amountUsdInput}</span>
                    )}
                  </div>
                  <Input
                    id="amount"
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
                  {balanceShortfall && (
                    <p className="text-xs text-destructive flex items-start gap-1.5" role="alert">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        {balanceShortfall.kind === 'token' ? (
                          <>Your wallet is short <span className="font-medium tabular-nums">{balanceShortfall.need} {token}</span> for this escrow.</>
                        ) : (
                          <>You need at least <span className="font-medium tabular-nums">{balanceShortfall.need}</span> in your wallet for network fees, in addition to the {token} being escrowed.</>
                        )}
                      </span>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the goods or services..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    maxLength={256}
                    rows={3}
                    aria-describedby="desc-counter desc-disclosure"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground" id="desc-counter">
                    <span>{!descValid && description.trim().length === 0 ? 'Required' : ''}</span>
                    <span>{description.length}/256</span>
                  </div>
                  {/* The description is stored on-chain in plaintext and is
                      readable by anyone with the Stacks API. Surface this
                      clearly before the user types something they'd regret. */}
                  <div
                    id="desc-disclosure"
                    className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2 text-[11px] text-muted-foreground"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
                    <span>
                      This description is stored <span className="font-medium text-foreground">on-chain in plaintext</span> and is
                      permanently visible to anyone — including future viewers. Avoid personal
                      info, contact details, or anything sensitive. Use the in-app
                      messages thread for private context after the escrow is created.
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Duration</Label>
                  <div className="flex gap-2 flex-wrap">
                    {durationPresets.map(p => {
                      // Hide any preset that would exceed the contract's max
                      // duration cap on its native clock (stacks blocks for
                      // v2/v7; burn blocks for v3+). v3+ presets fit easily;
                      // legacy contracts at fast Stacks rates may need to
                      // hide larger presets.
                      const presetBlocks = durationToBlocks(CONTRACT_PRINCIPAL, p.minutes, minutesPerBlock);
                      const exceedsCap = presetBlocks > effMaxDuration;
                      if (exceedsCap) return null;
                      return (
                        <Button
                          key={p.label}
                          type="button"
                          variant={!customDuration && durationMinutes === p.minutes ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => { setDurationMinutes(p.minutes); setCustomDuration(''); }}
                        >
                          {p.label}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Maximum: {effMaxDuration.toLocaleString()} {isBurnBlockContract ? 'burn blocks' : 'blocks'}
                    {' '}(~{blocksToTime(effMaxDuration, effMinutesPerBlock)}
                    {isBurnBlockContract ? ' at Bitcoin’s ~10 min/block target' : ` at current ~${minutesPerBlock.toFixed(2)} min/block`}).
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      type="number"
                      aria-label={`Custom duration in ${isBurnBlockContract ? 'burn blocks' : 'blocks'}`}
                      placeholder={`Min ${effMinDuration} ${isBurnBlockContract ? 'burn blocks' : 'blocks'}`}
                      value={customDuration}
                      onChange={e => setCustomDuration(e.target.value)}
                      className="font-mono text-sm w-40"
                      min={effMinDuration}
                      max={effMaxDuration}
                    />
                    <span className="text-xs text-muted-foreground">{isBurnBlockContract ? 'burn blocks' : 'blocks'}</span>
                  </div>
                  {customDuration && !durationValid && (
                    <p className="text-xs text-destructive">
                      Minimum {effMinDuration} {isBurnBlockContract ? 'burn blocks' : 'blocks'}
                      {' '}(~{blocksToTime(effMinDuration, effMinutesPerBlock)}). Short durations may expire before the seller can act.
                    </p>
                  )}
                  {durationValid && (
                    <p className="text-xs text-muted-foreground">
                      Expires: ~{blockToEstimatedDate(currentBlock + duration, currentBlock, effMinutesPerBlock).toLocaleDateString()} ({blocksToTime(duration, effMinutesPerBlock)})
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!step2Valid || !balanceSufficient} className="flex-1 gap-1.5">
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
                  {supportsBeneficiary && showBeneficiary && beneficiaryTrimmed && (
                    <div className="flex justify-between gap-3 p-3">
                      <span className="text-muted-foreground shrink-0">Beneficiary</span>
                      <span className="font-mono text-xs truncate">{beneficiaryTrimmed}</span>
                    </div>
                  )}
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
                    <span>{blocksToTime(duration, effMinutesPerBlock)} ({duration.toLocaleString()} {isBurnBlockContract ? 'burn blocks' : 'blocks'})</span>
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
                  <Button onClick={handleSubmit} disabled={!consent || !balanceSufficient || !!config?.isPaused} className="flex-1 shadow-glow-md hover:shadow-glow-lg transition-shadow">
                    {config?.isPaused ? 'Contract Paused' : 'Confirm & Deposit'}
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
