import { useEffect } from "react";

const DEFAULT_TITLE = "sBTC Escrow — Secure Bitcoin-Backed Escrow";
const DEFAULT_DESCRIPTION =
  "Enterprise-grade escrow platform powered by sBTC. Secure, trustless transactions backed by Bitcoin.";

interface DocumentHeadOptions {
  title?: string;
  description?: string;
}

export function useDocumentHead({ title, description }: DocumentHeadOptions = {}) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title || DEFAULT_TITLE;

    const metaDescription = document.querySelector('meta[name="description"]');
    const prevDescription = metaDescription?.getAttribute("content") || "";
    if (metaDescription) {
      metaDescription.setAttribute("content", description || DEFAULT_DESCRIPTION);
    }

    return () => {
      document.title = prevTitle;
      if (metaDescription) {
        metaDescription.setAttribute("content", prevDescription);
      }
    };
  }, [title, description]);
}
