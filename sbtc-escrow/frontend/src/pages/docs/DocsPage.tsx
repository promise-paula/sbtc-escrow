import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { DocsLayout } from "./DocsLayout";
import { getAdjacentPages, getAllPages } from "./docs-config";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";

const contentModules = import.meta.glob("./content/**/*.md", {
  query: "?raw",
  import: "default",
});

function CodeBlock({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const isInline = !match;

  if (isInline) {
    return (
      <code className="px-1.5 py-0.5 rounded-md bg-muted text-sm font-mono text-primary" {...props}>
        {children}
      </code>
    );
  }

  const handleCopy = () => {
    const text = String(children).replace(/\n$/, "");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {match && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-mono">
            {match[1]}
          </span>
        )}
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-muted-foreground/20 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <code className={cn("block text-sm", className)} {...props}>
        {children}
      </code>
    </div>
  );
}

function DocsMarkdown({ content }: { content: string }) {
  return (
    <div className="docs-prose">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        code: CodeBlock,
        a: ({ href, children, ...props }) => {
          if (href?.startsWith("/")) {
            return (
              <Link to={href.replace(/^\//, "/docs/")} className="text-primary hover:underline" {...props}>
                {children}
              </Link>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" {...props}>
              {children}
            </a>
          );
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="text-left px-3 py-2 border-b-2 border-border font-semibold text-foreground">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 border-b border-border/50 text-muted-foreground">{children}</td>
        ),
        blockquote: ({ children }) => (
          <div className="border-l-4 border-primary/50 bg-primary/5 rounded-r-lg px-4 py-3 my-4 text-sm [&>p]:m-0">
            {children}
          </div>
        ),
        h1: ({ children }) => <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">{children}</h1>,
        h2: ({ children }) => <h2 className="text-2xl font-semibold mt-10 mb-4 pb-2 border-b border-border/50 text-foreground">{children}</h2>,
        h3: ({ children }) => <h3 className="text-lg font-semibold mt-8 mb-3 text-foreground">{children}</h3>,
        h4: ({ children }) => <h4 className="text-base font-semibold mt-6 mb-2 text-foreground">{children}</h4>,
        p: ({ children }) => <p className="text-muted-foreground leading-7 mb-4">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1 text-muted-foreground">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1 text-muted-foreground">{children}</ol>,
        li: ({ children }) => <li className="leading-7">{children}</li>,
        pre: ({ children }) => (
          <pre className="bg-[#1a1a2e] text-gray-200 rounded-lg p-4 my-4 overflow-x-auto text-sm leading-relaxed">
            {children}
          </pre>
        ),
        hr: () => <hr className="my-8 border-border/50" />,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}

export default function DocsPage() {
  const { "*": slug } = useParams();
  const currentSlug = slug || "introduction";
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);

    const path = `./content/${currentSlug}.md`;
    const loader = contentModules[path];

    if (!loader) {
      setError(true);
      setLoading(false);
      return;
    }

    loader().then((raw) => {
      let text = raw as string;
      // Strip YAML frontmatter
      text = text.replace(/^---[\s\S]*?---\n*/, "");
      setContent(text);
      setLoading(false);
    });
  }, [currentSlug]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentSlug]);

  const currentPage = getAllPages().find((p) => p.slug === currentSlug);
  const { prev, next } = getAdjacentPages(currentSlug);

  return (
    <DocsLayout>
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {error && (
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
          <p className="text-muted-foreground mb-4">
            The documentation page <code className="px-1.5 py-0.5 bg-muted rounded text-sm">{currentSlug}</code> doesn't exist.
          </p>
          <Link to="/docs" className="text-primary hover:underline">Go to Introduction</Link>
        </div>
      )}

      {content && !loading && (
        <>
          <DocsMarkdown content={content} />

          {/* Prev/Next Navigation */}
          <div className="mt-16 pt-6 border-t border-border/50 flex justify-between gap-4">
            {prev ? (
              <Link
                to={`/docs/${prev.slug}`}
                className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                <div>
                  <div className="text-xs text-muted-foreground/60 mb-0.5">Previous</div>
                  <div className="font-medium">{prev.title}</div>
                </div>
              </Link>
            ) : <div />}
            {next ? (
              <Link
                to={`/docs/${next.slug}`}
                className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors text-right"
              >
                <div>
                  <div className="text-xs text-muted-foreground/60 mb-0.5">Next</div>
                  <div className="font-medium">{next.title}</div>
                </div>
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : <div />}
          </div>
        </>
      )}
    </DocsLayout>
  );
}
