import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/shared/Logo';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Seo } from '@/components/shared/Seo';

/**
 * Shared frame for the legal documents (/privacy, /terms). A quiet document
 * surface in the ledger identity: Besley display heading, 65ch prose measure,
 * numbered sections with hairline rules. Marketing-surface page, so the
 * display face is allowed; the app chrome (sidebar, wallet state) is not.
 */

interface LegalShellProps {
  title: string;
  description: string;
  path: string;
  /** Human-readable effective date, e.g. "July 16, 2026". */
  effectiveDate: string;
  children: React.ReactNode;
}

export function LegalShell({ title, description, path, effectiveDate, children }: LegalShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Seo title={title} description={description} path={path} />

      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity">
            <Logo size="sm" className="text-accent-warm" />
            <span className="font-bold tracking-tight text-sm">sBTC Escrow</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground text-balance">{title}</h1>
        <p className="mt-3 font-mono text-xs text-muted-foreground">Effective {effectiveDate}</p>

        <div className="mt-10 space-y-10">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} sBTC Escrow</p>
          <nav aria-label="Legal" className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Numbered legal section: mono two-digit index, hairline rule, prose body.
 *  Same numbering dialect as the landing's features ledger. */
export function LegalSection({ num, heading, children }: { num: string; heading: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`s-${num}`}>
      <div className="border-t border-border/70 pt-5 grid grid-cols-[2.5rem_1fr] gap-x-3 sm:gap-x-6">
        <span aria-hidden="true" className="font-mono text-sm text-muted-foreground/60 pt-1">{num}</span>
        <div>
          <h2 id={`s-${num}`} className="text-lg font-bold text-foreground tracking-tight">{heading}</h2>
          <div className="mt-3 space-y-3 text-sm text-muted-foreground leading-relaxed max-w-[65ch] [&_strong]:text-foreground [&_a]:text-primary [&_a:hover]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
