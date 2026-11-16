import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessageCircleQuestion } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SignInNote } from '@/components/shared/SignInNote';
import {
  REFERRAL_SOURCES,
  useReferralAnswer,
  useSubmitReferralAnswer,
  type ReferralSource,
} from '@/hooks/use-referral-answer';

const QUESTION = 'How did you hear about sBTC Escrow?';

// Per-wallet "answered" / "skipped" marker so the question is asked once.
// Browser storage can be unavailable (private mode); then it may ask again.
const storageKey = (address: string) => `sbtc-escrow:how-heard:${address}`;
function readMarker(address: string): string | null {
  try {
    return localStorage.getItem(storageKey(address));
  } catch {
    return null;
  }
}
function writeMarker(address: string, value: 'answered' | 'skipped') {
  try {
    localStorage.setItem(storageKey(address), value);
  } catch {
    /* storage unavailable: the card just hides for this visit */
  }
}

interface HowDidYouHearCardProps {
  address: string | null | undefined;
  isAuthenticated: boolean;
  isSigningIn: boolean;
  onSignIn: () => void;
}

/**
 * Optional, one-time question for escrow parties. Never blocks anything:
 * skippable, and saving needs the same wallet sign-in as messages.
 */
export function HowDidYouHearCard({ address, isAuthenticated, isSigningIn, onSignIn }: HowDidYouHearCardProps) {
  const [marker, setMarker] = useState<string | null>(() => (address ? readMarker(address) : null));
  const [source, setSource] = useState<ReferralSource | ''>('');
  const [otherText, setOtherText] = useState('');
  const { data: existing, isLoading } = useReferralAnswer(address, isAuthenticated);
  const submit = useSubmitReferralAnswer();

  useEffect(() => {
    setMarker(address ? readMarker(address) : null);
  }, [address]);

  if (!address || marker || existing || isLoading) return null;

  const done = (value: 'answered' | 'skipped') => {
    writeMarker(address, value);
    setMarker(value);
  };

  const save = () => {
    if (!source) return;
    submit.mutate(
      { address, source, otherText: source === 'other' ? otherText.trim() || null : null },
      {
        onSuccess: () => {
          done('answered');
          toast.success('Thanks', { description: 'Your answer is saved.' });
        },
        onError: () => toast.error('Answer not saved', { description: 'Please try again.' }),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4 text-muted-foreground" />
          {QUESTION}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Optional, and asked once. Only you and the sBTC Escrow team can see your answer.
        </p>
        <div role="radiogroup" aria-label={QUESTION} className="flex flex-wrap gap-1.5">
          {REFERRAL_SOURCES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={source === option.value}
              onClick={() => setSource(option.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                source === option.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border bg-background text-foreground hover:border-primary/50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {source === 'other' && (
          <Input
            aria-label="Where did you hear about it?"
            placeholder="Where did you hear about it?"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            maxLength={100}
            className="text-sm"
          />
        )}
        {isAuthenticated ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={!source || submit.isPending}>
              {submit.isPending ? 'Saving…' : 'Save answer'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => done('skipped')}>
              Skip
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <SignInNote variant="outline" isSigningIn={isSigningIn} onSignIn={onSignIn}>
              Saving needs a one-time sign-in: a wallet signature, no gas, no on-chain tx.
            </SignInNote>
            <Button size="sm" variant="ghost" onClick={() => done('skipped')}>
              Skip
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
