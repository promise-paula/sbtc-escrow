import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SignInNote } from '@/components/shared/SignInNote';
import {
  getDisputeReasonsForRole,
  useSubmitDisputeReason,
  type DisputeReason,
  type DisputeReasonCategory,
  type DisputerRole,
} from '@/hooks/use-dispute-reason';

export interface PendingDisputeReason {
  category: DisputeReasonCategory;
  details: string;
}

interface DisputeReasonPickerProps {
  role: DisputerRole;
  value: DisputeReasonCategory | '';
  onChange: (value: DisputeReasonCategory) => void;
  details: string;
  onDetailsChange: (value: string) => void;
}

/**
 * Reason chips + optional details. Shared by the dispute form and the
 * follow-up card so both offer the same role-specific reasons.
 */
export function DisputeReasonPicker({ role, value, onChange, details, onDetailsChange }: DisputeReasonPickerProps) {
  return (
    <>
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">
          Reason <span className="text-destructive">*</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {/* Reasons are role-specific: "Seller unresponsive" makes no sense
              from a seller, and mixing them makes admin triage harder. */}
          {getDisputeReasonsForRole(role).map((cat) => (
            <button
              key={cat.value}
              type="button"
              aria-pressed={value === cat.value}
              onClick={() => onChange(cat.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                value === cat.value
                  ? 'bg-destructive text-destructive-foreground border-destructive'
                  : 'border-border bg-background text-foreground hover:border-destructive/50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">
          Additional details <span className="text-muted-foreground font-normal">(optional)</span>
        </p>
        <Textarea
          placeholder="Describe the issue in more detail…"
          value={details}
          onChange={(e) => onDetailsChange(e.target.value)}
          maxLength={1000}
          rows={3}
          className="text-sm resize-none"
        />
        {details.length > 800 && (
          <p className="text-xs text-muted-foreground text-right">{details.length}/1000</p>
        )}
      </div>
    </>
  );
}

interface DisputeReasonCardProps {
  /** The escrow's own contract — reasons are stored and read per contract. */
  contractId: string;
  escrowId: number;
  viewerAddress: string | null | undefined;
  /** Address from the on-chain escrow-disputed event. */
  disputedBy: string | null | undefined;
  disputerRole: DisputerRole;
  existingReason: DisputeReason | null | undefined;
  /** Reason picked in the dispute form, if it couldn't be saved then. */
  initialReason?: PendingDisputeReason | null;
  isAuthenticated: boolean;
  isSigningIn: boolean;
  onSignIn: () => void;
}

/**
 * The reason behind a dispute. The dispute itself is on-chain; the reason is
 * stored off-chain and saving it needs a wallet sign-in. If the disputer
 * wasn't signed in when they disputed, this card lets them attach it after.
 */
export function DisputeReasonCard({
  contractId,
  escrowId,
  viewerAddress,
  disputedBy,
  disputerRole,
  existingReason,
  initialReason,
  isAuthenticated,
  isSigningIn,
  onSignIn,
}: DisputeReasonCardProps) {
  const [category, setCategory] = useState<DisputeReasonCategory | ''>(initialReason?.category ?? '');
  const [details, setDetails] = useState(initialReason?.details ?? '');
  const submit = useSubmitDisputeReason();
  const isDisputer = !!viewerAddress && viewerAddress === disputedBy;

  if (!existingReason && !isDisputer) return null;

  const save = () => {
    if (!category || !viewerAddress) return;
    submit.mutate(
      { contractId, escrowId, reasonCategory: category, details, submittedBy: viewerAddress },
      {
        onSuccess: () => toast.success('Reason saved', { description: 'The arbiter can now see why this was disputed.' }),
        onError: () => toast.error('Reason not saved', { description: 'Please try again.' }),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          Dispute reason
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {existingReason ? (
          <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-1">
            <p className="text-xs font-semibold text-foreground">{existingReason.reasonLabel}</p>
            {existingReason.details && (
              <p className="text-xs text-muted-foreground italic">"{existingReason.details}"</p>
            )}
            {disputedBy && (
              <p className="text-[11px] text-muted-foreground pt-1">
                Raised by the {disputerRole}{isDisputer ? ' (you)' : ''}
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Your dispute is on-chain, but no reason is attached yet. Add one so the
              arbiter knows what went wrong.
            </p>
            <DisputeReasonPicker
              role={disputerRole}
              value={category}
              onChange={setCategory}
              details={details}
              onDetailsChange={setDetails}
            />
            {isAuthenticated ? (
              <Button size="sm" onClick={save} disabled={!category || submit.isPending}>
                {submit.isPending ? 'Saving…' : 'Save reason'}
              </Button>
            ) : (
              <SignInNote isSigningIn={isSigningIn} onSignIn={onSignIn}>
                Saving needs a one-time sign-in: a wallet signature, no gas, no on-chain tx.
              </SignInNote>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
