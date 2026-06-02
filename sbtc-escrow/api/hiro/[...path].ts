// Vercel Edge function that proxies sBTC Escrow's Hiro API traffic.
//
// Purpose: attach the server-side HIRO_API_KEY (lifts the anonymous ~50
// req/min/IP rate limit to the authenticated ~500 req/min tier) and cache
// safe-to-cache responses at Vercel's edge. The key stays server-side and
// is never shipped to the browser.
//
// Wired in via VITE_STACKS_API_URL=/api/hiro at build time. When that env
// is unset (local dev), the frontend calls Hiro directly — preserving the
// no-setup `npm run dev` path. Production sets it on Vercel.

export const config = { runtime: 'edge' };

const HIRO_MAINNET = 'https://api.mainnet.hiro.so';

// Per-endpoint cache policy. Hiro responses fall into three buckets:
//   1. Immutable past data (a specific burn block by its height) — safe to
//      cache for a year; the block can never re-mine under that height.
//   2. Chain-tip data (current heights, recent block lists) — cache 30s so
//      many concurrent users → one origin call per 30s window.
//   3. Mutable account/tx data — never cache.
function cacheControlForPath(path: string): string {
  // /extended/v2/burn-blocks/{height} where {height} is a number → immutable
  if (/^extended\/v2\/burn-blocks\/\d+$/.test(path)) {
    return 'public, s-maxage=31536000, immutable';
  }
  // /extended/v2/blocks/{height} → also immutable past data
  if (/^extended\/v2\/blocks\/\d+$/.test(path)) {
    return 'public, s-maxage=31536000, immutable';
  }
  // Latest burn-block / stacks-block listings — chain tip, cache briefly
  if (path === 'extended/v2/burn-blocks' || /^extended\/v2\/burn-blocks\?/.test(path)) {
    return 'public, s-maxage=30, stale-while-revalidate=60';
  }
  if (path === 'extended/v2/blocks' || /^extended\/v2\/blocks\?/.test(path)) {
    return 'public, s-maxage=30, stale-while-revalidate=60';
  }
  // /v2/info — current chain tip + burn tip. The single hottest endpoint.
  if (path === 'v2/info') {
    return 'public, s-maxage=30, stale-while-revalidate=60';
  }
  // Contract read-only calls. Most of ours are platform-config reads that
  // change rarely. 60s caches the read; the underlying state shifts on a
  // multi-minute cadence so staleness is tolerable. NOTE: call-read is a
  // POST with a body, and Vercel's edge cache only caches GET by default.
  // We forward the cache-control header anyway so downstream HTTP caches
  // (browser, CDN) can honor it.
  if (/^v2\/contracts\/call-read/.test(path)) {
    return 'public, s-maxage=60, stale-while-revalidate=120';
  }
  // Everything else — wallet balances, fresh tx lookups, account state.
  // Always go to origin so the user sees live data.
  return 'no-store';
}

// Hop-by-hop and unsafe-to-forward headers stripped from inbound requests
// before we send them upstream. Cookies in particular: even though the
// browser sends them on same-origin /api/hiro calls, we never want them
// leaving our origin.
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'cookie',
  'authorization',
  'x-vercel-id',
  'x-vercel-deployment-url',
  'x-real-ip',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]);

// Response headers we strip before relaying back to the browser, so that
// upstream cache-control / set-cookie / cors etc. don't override the
// behavior we configure here.
const STRIPPED_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'cache-control',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'x-frame-options',
  'content-security-policy',
]);

export default async function handler(req: Request): Promise<Response> {
  // Get the API key from the runtime env. Vercel injects process.env on
  // Edge functions, but accessing it requires the global guard because
  // some Edge runtimes still throw on bare process refs.
  const apiKey: string | undefined =
    typeof process !== 'undefined' ? process.env.HIRO_API_KEY : undefined;

  const url = new URL(req.url);
  const PREFIX = '/api/hiro/';
  if (!url.pathname.startsWith(PREFIX)) {
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  // Extract upstream path. URL constructor normalizes any '..' segments,
  // so path traversal can't escape our prefix.
  const path = url.pathname.slice(PREFIX.length);
  const upstream = `${HIRO_MAINNET}/${path}${url.search}`;

  // Build forwarded headers — strip the unsafe ones, attach the API key.
  const forwardHeaders = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  });
  if (apiKey) {
    forwardHeaders.set('x-api-key', apiKey);
  }

  // Body forwarding for POST (call-read mostly).
  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer();
  }

  try {
    const upstreamRes = await fetch(upstream, {
      method: req.method,
      headers: forwardHeaders,
      body,
    });

    // Build response headers, stripping the ones we want to control ourselves.
    const respHeaders = new Headers();
    upstreamRes.headers.forEach((value, key) => {
      if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        respHeaders.set(key, value);
      }
    });

    // Cache successful responses per our policy; never cache errors.
    if (upstreamRes.ok) {
      respHeaders.set('cache-control', cacheControlForPath(path));
    } else {
      respHeaders.set('cache-control', 'no-store');
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: respHeaders,
    });
  } catch (err) {
    // Network error reaching Hiro. Return 503 so the frontend's defensive
    // fallbacks (clockReady=false, indexer-time substitution) kick in
    // rather than the UI computing against a zero anchor.
    return new Response(
      JSON.stringify({ error: 'Upstream fetch failed', detail: String(err) }),
      {
        status: 503,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      },
    );
  }
}
