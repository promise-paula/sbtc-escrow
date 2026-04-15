export interface DocPage {
  title: string;
  slug: string;
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export const docsNavigation: DocSection[] = [
  {
    title: "Getting Started",
    pages: [
      { title: "Introduction", slug: "introduction" },
      { title: "Quickstart", slug: "quickstart" },
      { title: "Architecture", slug: "architecture" },
    ],
  },
  {
    title: "Concepts",
    pages: [
      { title: "Escrow Lifecycle", slug: "concepts/escrow-lifecycle" },
      { title: "Token Support", slug: "concepts/token-support" },
      { title: "Fees & Limits", slug: "concepts/fees-and-limits" },
      { title: "Security", slug: "concepts/security" },
    ],
  },
  {
    title: "Smart Contract",
    pages: [
      { title: "Overview", slug: "contract/overview" },
      { title: "Public Functions", slug: "contract/public-functions" },
      { title: "Read-Only Functions", slug: "contract/read-only-functions" },
      { title: "Admin Functions", slug: "contract/admin-functions" },
      { title: "Data Structures", slug: "contract/data-structures" },
    ],
  },
  {
    title: "SDK",
    pages: [
      { title: "Overview", slug: "sdk/overview" },
      { title: "Installation", slug: "sdk/installation" },
      { title: "Client", slug: "sdk/client" },
      { title: "Read Methods", slug: "sdk/read-methods" },
      { title: "Write Methods", slug: "sdk/write-methods" },
      { title: "Admin Methods", slug: "sdk/admin-methods" },
      { title: "Types", slug: "sdk/types" },
    ],
  },
  {
    title: "Frontend",
    pages: [
      { title: "Overview", slug: "frontend/overview" },
      { title: "Setup", slug: "frontend/setup" },
      { title: "Wallet Integration", slug: "frontend/wallet-integration" },
      { title: "Hooks", slug: "frontend/hooks" },
      { title: "Services", slug: "frontend/services" },
      { title: "Supabase", slug: "frontend/supabase" },
    ],
  },
  {
    title: "Guides",
    pages: [
      { title: "Testing", slug: "guides/testing" },
      { title: "Deployment", slug: "guides/deployment" },
      { title: "FAQ", slug: "guides/faq" },
    ],
  },
  {
    title: "Reference",
    pages: [
      { title: "Error Codes", slug: "reference/error-codes" },
    ],
  },
];

export function getAllPages(): DocPage[] {
  return docsNavigation.flatMap((s) => s.pages);
}

export function getAdjacentPages(slug: string): { prev?: DocPage; next?: DocPage } {
  const all = getAllPages();
  const idx = all.findIndex((p) => p.slug === slug);
  return {
    prev: idx > 0 ? all[idx - 1] : undefined,
    next: idx < all.length - 1 ? all[idx + 1] : undefined,
  };
}
