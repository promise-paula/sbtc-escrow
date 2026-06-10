import { Helmet } from 'react-helmet-async';

// Canonical production origin. Per-route <Seo> sets a unique title,
// description, and canonical/og:url so each page is distinct to search
// engines that render JS (e.g. Googlebot). Note: social scrapers and non-JS
// crawlers do NOT run this — they only see the static tags in index.html — so
// rich per-route link previews still require prerendering the public routes.
export const SITE_URL = 'https://sbtcescrow.com';

interface SeoProps {
  /** Page-specific title. The " | sBTC Escrow" brand suffix is appended
   *  automatically unless the title already contains "sBTC Escrow". */
  title: string;
  description?: string;
  /** Absolute path beginning with "/" for canonical + og:url. Omit on
   *  noindex pages (a canonical on a non-indexable page is meaningless). */
  path?: string;
  /** App/private pages pass this so search engines don't index them. */
  noindex?: boolean;
}

export function Seo({ title, description, path, noindex = false }: SeoProps) {
  const fullTitle = title.includes('sBTC Escrow') ? title : `${title} | sBTC Escrow`;
  const url = path ? `${SITE_URL}${path}` : undefined;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}

      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {url && !noindex && <link rel="canonical" href={url} />}
      {url && !noindex && <meta property="og:url" content={url} />}

      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
    </Helmet>
  );
}
