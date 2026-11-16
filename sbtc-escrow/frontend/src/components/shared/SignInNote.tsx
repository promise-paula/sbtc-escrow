import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SignInNoteProps {
  /** Why signing in matters here. */
  children: React.ReactNode;
  isSigningIn: boolean;
  onSignIn: () => void;
  /** Outline when another button on the same form is the primary action. */
  variant?: 'default' | 'outline';
}

/**
 * Inline prompt for the one-time wallet sign-in that off-chain writes
 * (notes, dispute reasons) need. Same look as the Messages sign-in prompt.
 */
export function SignInNote({ children, isSigningIn, onSignIn, variant = 'default' }: SignInNoteProps) {
  return (
    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-3 flex items-center justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <LogIn className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <p className="text-[11px] text-muted-foreground">{children}</p>
      </div>
      <Button size="sm" variant={variant} onClick={onSignIn} disabled={isSigningIn} className="gap-1.5 shrink-0">
        <LogIn className="h-3.5 w-3.5" />
        {isSigningIn ? 'Signing…' : 'Sign in'}
      </Button>
    </div>
  );
}
