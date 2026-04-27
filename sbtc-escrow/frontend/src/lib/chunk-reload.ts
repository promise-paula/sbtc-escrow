/**
 * Recovery for stale chunk references after a Vercel deploy.
 *
 * Lazy-loaded routes are content-hashed by Vite; when a new build ships,
 * users with a cached `index.html` still try to load the old hashes. Vercel's
 * SPA fallback returns `index.html` (text/html) which the browser can't
 * parse as a module, throwing "Failed to fetch dynamically imported module"
 * or "Failed to load module script".
 *
 * This handler detects those errors and force-reloads once, so the user
 * picks up the latest `index.html` (and fresh chunk hashes). Guarded by a
 * sessionStorage flag to prevent reload loops if the failure persists.
 */

const RELOAD_KEY = 'sbtc-escrow-chunk-reload';

const isChunkError = (message: string): boolean =>
  /Failed to fetch dynamically imported module/i.test(message) ||
  /Failed to load module script/i.test(message) ||
  /Loading chunk \d+ failed/i.test(message) ||
  /error loading dynamically imported module/i.test(message);

function attemptReload(): void {
  if (sessionStorage.getItem(RELOAD_KEY)) {
    // Already reloaded once and still failing — don't loop. The user has
    // a deeper problem (extension, network, corrupted cache); leave the
    // error visible so they can react.
    return;
  }
  sessionStorage.setItem(RELOAD_KEY, '1');
  window.location.reload();
}

export function installChunkReloadHandler(): void {
  if (typeof window === 'undefined') return;

  // Successful navigation clears the guard so future genuine deploys can
  // trigger a fresh recovery attempt.
  window.addEventListener('load', () => {
    sessionStorage.removeItem(RELOAD_KEY);
  });

  window.addEventListener('error', (event) => {
    if (isChunkError(event.message ?? '')) {
      attemptReload();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
    if (isChunkError(message)) {
      attemptReload();
    }
  });
}
