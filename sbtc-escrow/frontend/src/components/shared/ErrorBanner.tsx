import { AlertTriangle } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}
