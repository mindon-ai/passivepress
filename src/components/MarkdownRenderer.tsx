import { useState, useRef, ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "@/styles/hljs-passivepress.css";

import { AdSlot } from "@/components/AdSlot";
import { AffiliateCta } from "@/components/AffiliateCta";
import { AffiliateTable } from "@/components/AffiliateTable";
import { MarkdownChart, type MarkdownChartSpec } from "@/components/MarkdownChart";

interface AffiliateCtaTokenPayload {
  asin: string;
  label: string;
  href: string;
}

interface MarkdownRendererProps {
  content: string;
  charts: Record<string, MarkdownChartSpec>;
  ads: Record<string, { slot: string }>;
  affiliateCtas: Record<string, AffiliateCtaTokenPayload>;
  postSlug?: string;
}

/** Flatten React children to plain text — used for emoji detection & anchor slugs. */
function extractRawText(node: ReactNode): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractRawText).join("");
  if (typeof node === "object" && "props" in (node as object)) {
    return extractRawText((node as React.ReactElement<{ children?: ReactNode }>).props.children);
  }
  return "";
}

/** Convert heading text to a URL anchor — must match slugifyHeading() in 4-writer.ts. */
function slugifyHeading(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

const CALLOUT_CONFIG: Record<string, { border: string; bg: string; label: string }> = {
  "💡": { border: "border-accent",     bg: "bg-accent/10",                           label: "Key Insight" },
  "⚠️": { border: "border-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/30",     label: "Warning"     },
  "📌": { border: "border-blue-400",   bg: "bg-blue-50 dark:bg-blue-950/30",         label: "Note"        },
  "✅": { border: "border-green-400",  bg: "bg-green-50 dark:bg-green-950/30",       label: "Tip"         },
};

/** Code block with hover-revealed copy button. */
function CodeBlock({ children }: { children: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available (e.g. http) — silently ignore
    }
  };

  return (
    <div className="relative group my-6 not-prose">
      <button
        onClick={handleCopy}
        aria-label="Copy code"
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono font-medium bg-muted/90 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
      <pre ref={preRef} className="overflow-x-auto rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

/** ReactMarkdown component map — callouts, copy buttons, internal links, heading anchors. */
function createMarkdownComponents(
  charts: Record<string, MarkdownChartSpec>,
  ads: Record<string, { slot: string }>,
  affiliateCtas: Record<string, AffiliateCtaTokenPayload>,
  postSlug?: string,
): Components {
  return {
    // Headings with stable IDs for ToC anchor links
    h2: ({ children }) => {
      const id = slugifyHeading(extractRawText(children as ReactNode));
      return <h2 id={id} className="scroll-mt-28">{children}</h2>;
    },
    h3: ({ children }) => {
      const id = slugifyHeading(extractRawText(children as ReactNode));
      return <h3 id={id} className="scroll-mt-28">{children}</h3>;
    },

    // Blockquote: detect emoji prefix → styled callout; otherwise → pull-quote
    blockquote: ({ children }) => {
      const raw = extractRawText(children as ReactNode).trimStart();
      for (const [emoji, cfg] of Object.entries(CALLOUT_CONFIG)) {
        if (raw.startsWith(emoji)) {
          return (
            <div className={`not-prose ${cfg.bg} border-l-4 ${cfg.border} rounded-sm px-5 py-4 my-6`}>
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground/50 mb-1">{cfg.label}</p>
              <div className="text-foreground/85 text-base leading-relaxed [&_strong]:text-foreground [&_p]:m-0">
                {children}
              </div>
            </div>
          );
        }
      }
      // Pull quote — plain blockquote
      return (
        <blockquote className="not-prose border-l-4 border-accent pl-5 my-8 text-xl font-display italic text-foreground/70 leading-snug">
          {children}
        </blockquote>
      );
    },

    p: ({ children }) => {
      const raw = extractRawText(children as ReactNode).trim();
      const chartTokenMatch = raw.match(/^@@CHART:([^@]+)@@$/);
      if (chartTokenMatch) {
        const chart = charts[chartTokenMatch[1]];
        if (chart) return <MarkdownChart chart={chart} />;
      }

      const adTokenMatch = raw.match(/^@@AD:([^@]+)@@$/);
      if (adTokenMatch) {
        const ad = ads[adTokenMatch[1]];
        if (ad) return <AdSlot slot={ad.slot} className="my-8" />;
      }

      const ctaTokenMatch = raw.match(/^@@AFFILIATE_CTA:([^@]+)@@$/);
      if (ctaTokenMatch) {
        const cta = affiliateCtas[ctaTokenMatch[1]];
        if (cta) return <AffiliateCta href={cta.href} asin={cta.asin} postSlug={postSlug}>{cta.label}</AffiliateCta>;
      }

      return <p>{children}</p>;
    },

    table: ({ children }) => {
      const raw = extractRawText(children as ReactNode).toLowerCase();
      if (raw.includes("product") && raw.includes("price") && raw.includes("buy")) {
        return <AffiliateTable><table>{children}</table></AffiliateTable>;
      }
      return <table>{children}</table>;
    },

    // Code blocks with copy button
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,

    // Links: hash anchors + internal posts stay same-tab; external links open in new tab
    a: ({ href, children, ...props }) => {
      const className = typeof props.className === "string" ? props.className : "";
      const asin = typeof props["data-asin" as keyof typeof props] === "string" ? props["data-asin" as keyof typeof props] as string : href?.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
      if (className.includes("affiliate-cta")) {
        return <AffiliateCta href={href} asin={asin} postSlug={postSlug}>{children}</AffiliateCta>;
      }

      if (href?.startsWith("#")) {
        return (
          <a href={href} {...props}>
            {children}
          </a>
        );
      }
      if (href && !href.startsWith("http") && !href.startsWith("mailto") && !href.startsWith("tel")) {
        return (
          <Link
            to={href}
            className="text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:bg-accent/20 transition-colors rounded-sm px-0.5"
          >
            {children}
          </Link>
        );
      }
      return (
        <a href={href} target="_blank" rel={href?.includes("amazon.") ? "sponsored noopener noreferrer" : "noopener noreferrer"} {...props}>
          {children}
        </a>
      );
    },
  };
}

export default function MarkdownRenderer({ content, charts, ads, affiliateCtas, postSlug }: MarkdownRendererProps) {
  const components = createMarkdownComponents(charts, ads, affiliateCtas, postSlug);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}
