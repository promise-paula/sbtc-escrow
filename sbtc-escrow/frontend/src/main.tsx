import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { installChunkReloadHandler } from "./lib/chunk-reload";
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
