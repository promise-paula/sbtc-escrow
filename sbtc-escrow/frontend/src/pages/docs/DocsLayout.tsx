import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { docsNavigation, type DocSection} from "./docs-config";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Menu, X, ArrowLeft } from "lucide-react";

function SidebarSection({ section, currentSlug }: { section: DocSection; currentSlug: string }) {
  const isActive = section.pages.some((p) => p.slug === currentSlug);
  const [open, setOpen] = useState(isActive);

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-sm font-semibold text-foreground/80 hover:text-foreground rounded-md transition-colors"
      >
        {section.title}
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="ml-3 border-l border-border/50 pl-2 mt-0.5 space-y-0.5">
          {section.pages.map((page) => (
            <Link
              key={page.slug}
              to={`/docs/${page.slug}`}
              className={cn(
                "block px-3 py-1.5 text-sm rounded-md transition-colors",
                currentSlug === page.slug
                  ? "text-primary font-medium bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {page.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocsSidebar({ className }: { className?: string }) {
  const { "*": slug } = useParams();
  const currentSlug = slug || "introduction";

  return (
    <nav className={cn("space-y-1", className)}>
      {docsNavigation.map((section) => (
        <SidebarSection key={section.title} section={section} currentSlug={currentSlug} />
      ))}
    </nav>
  );
}

export function DocsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-[90rem] mx-auto flex items-center h-14 px-4 gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link to="/" className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-[#F7931A] to-[#D97706] flex items-center justify-center">
              <svg viewBox="0 0 32 32" className="h-4 w-4" fill="none">
                <path d="M16 2L4 7v9c0 7.73 5.12 14.95 12 17 6.88-2.05 12-9.27 12-17V7L16 2z" fill="currentColor" opacity="0" />
                <path d="M12.5 15v-2.5a3.5 3.5 0 1 1 7 0V15" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <rect x="10" y="14.5" width="12" height="9" rx="2" fill="white" />
              </svg>
            </div>
            <span className="font-semibold text-lg">sBTC Escrow</span>
          </Link>

          <span className="text-muted-foreground/50 hidden sm:inline">|</span>
          <span className="text-sm text-muted-foreground hidden sm:inline">Documentation</span>

          <div className="flex-1" />

          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to App</span>
          </Link>

          <a
            href="https://github.com/promise-paula/sbtc-escrow"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
        </div>
      </header>

      <div className="max-w-[90rem] mx-auto flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-border/50">
          <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-6 px-3">
            <DocsSidebar />
          </div>
        </aside>

        {/* Sidebar - Mobile Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
            <aside className="absolute left-0 top-14 bottom-0 w-72 bg-background border-r border-border overflow-y-auto py-6 px-3">
              <DocsSidebar />
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0 px-4 sm:px-8 py-8 lg:py-12">
          <div className="max-w-3xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
