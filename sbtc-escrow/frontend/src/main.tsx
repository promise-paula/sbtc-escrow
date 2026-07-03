import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { installChunkReloadHandler } from "./lib/chunk-reload";
// Self-hosted fonts (was a Google Fonts @import in index.css). The @import
// made first paint wait on a serial third-party chain — css bundle → Google
// CSS → gstatic woff2 — worth ~2s of blocked render on throttled mobile.
// Bundling @font-face here serves the woff2 same-origin with immutable
// caching. Load only the weights actually used. Besley is the landing display
// face; see index.css.
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/besley/700.css";
import "@fontsource/besley/800.css";
import "./index.css";

// Redirect docs.* subdomain visitors to the canonical /docs path on the apex
// domain, before React boots, so users don't see a flash of the landing page.
// Keeps a single canonical URL for SEO and deep-link stability.
(() => {
  const { hostname, pathname, search, hash } = window.location;
  if (!hostname.startsWith("docs.")) return;
  const apex = hostname.slice("docs.".length);
  // Avoid double-prefixing /docs if a deep link already includes it.
  const target = pathname.startsWith("/docs")
    ? pathname
    : `/docs${pathname === "/" ? "" : pathname}`;
  window.location.replace(`https://${apex}${target}${search}${hash}`);
  // Stop further bootstrapping while the browser navigates.
  throw new Error("Redirecting to canonical docs URL");
})();

installChunkReloadHandler();

createRoot(document.getElementById("root")!).render(<App />);
