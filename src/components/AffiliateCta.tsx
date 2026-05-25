import React from "react";

interface AffiliateCtaProps {
  href?: string;
  asin?: string;
  postSlug?: string;
  children: React.ReactNode;
}

export function AffiliateCta({ href, asin, postSlug, children }: AffiliateCtaProps) {
  const trackClick = () => {
    if (!asin || !postSlug) return;
    const endpoint = import.meta.env.VITE_CONVEX_SITE_URL || "/api/track-click";
    const url = endpoint.startsWith("http") ? `${endpoint.replace(/\/$/, "")}/api/track-click` : endpoint;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asin, postSlug, referrer: document.referrer }),
      keepalive: true,
    }).catch(() => undefined);
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={trackClick}
      className="not-prose my-4 inline-flex items-center justify-center rounded-md bg-amber-500 px-5 py-3 text-sm font-bold text-amber-950 shadow-sm transition hover:bg-amber-400"
    >
      {children} <span aria-hidden className="ml-2">→</span>
    </a>
  );
}
