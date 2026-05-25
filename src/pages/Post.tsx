import { useEffect, useMemo, useState, useRef, Suspense, lazy } from "react";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SEO } from "@/components/SEO";
import { Layout } from "@/components/Layout";
import { PostCard, type PostCardData } from "@/components/PostCard";
import { AdSlot } from "@/components/AdSlot";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { type MarkdownChartSpec } from "@/components/MarkdownChart";
import { normalizeImageUrl } from "@/lib/image";
import NotFound from "./NotFound";

const MarkdownRenderer = lazy(() => import("@/components/MarkdownRenderer"));

interface FullPost extends PostCardData {
  id: string;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  keywords: string[] | null;
  author_name: string | null;
  category: { name: string; slug: string } | null;
}

interface ChartTokenPayload {
  chartId?: string;
}

interface AdTokenPayload {
  slot?: string;
}

// ---------------------------------------------------------------------------
// Markdown component helpers
// ---------------------------------------------------------------------------

function normalizeChartJson(raw: string): string {
  return raw.trim().replace(/^[`]+|[`]+$/g, "");
}

function extractEmbedsFromMarkdown(markdown: string): {
  content: string;
  charts: Record<string, MarkdownChartSpec>;
  ads: Record<string, { slot: string }>;
} {
  const chartRegex = /```chart\s*([\s\S]*?)```/g;
  const adRegex = /```ad\s*([\s\S]*?)```/g;
  const charts: Record<string, MarkdownChartSpec> = {};
  const ads: Record<string, { slot: string }> = {};

  const withCharts = markdown.replace(chartRegex, (_match, rawPayload: string) => {
    try {
      const parsed = JSON.parse(normalizeChartJson(rawPayload)) as ChartTokenPayload & Partial<MarkdownChartSpec>;
      if (parsed.chartId) {
        return `@@CHART:${parsed.chartId}@@`;
      }

      if (parsed.id && parsed.title && parsed.xKey && Array.isArray(parsed.series) && Array.isArray(parsed.data)) {
        charts[parsed.id] = parsed as MarkdownChartSpec;
        return `@@CHART:${parsed.id}@@`;
      }
    } catch {
      // leave invalid blocks alone so the reader still sees the raw markdown
    }

    return _match;
  });

  const content = withCharts.replace(adRegex, (_match, rawPayload: string) => {
    try {
      const parsed = JSON.parse(normalizeChartJson(rawPayload)) as AdTokenPayload;
      const slot = parsed.slot?.trim();
      if (slot) {
        ads[slot] = { slot };
        return `@@AD:${slot}@@`;
      }
    } catch {
      // leave invalid blocks alone so the reader still sees the raw markdown
    }

    return _match;
  });

  return { content, charts, ads };
}

const Post = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = useQuery(api.posts.getBySlug, slug ? { slug } : "skip") as FullPost | null | undefined;
  const related = useQuery(api.posts.listRelated, slug ? { slug, limit: 3 } : "skip") as PostCardData[] | undefined;
  const loading = slug !== undefined && (post === undefined || related === undefined);

  const url = typeof window !== "undefined" ? window.location.href : "";
  const featuredImage = normalizeImageUrl(post?.featured_image);

  const { content: contentWithTokens, charts, ads } = useMemo(
    () => extractEmbedsFromMarkdown(post?.content || ""),
    [post?.content]
  );

  useEffect(() => {
    if (post) window.scrollTo(0, 0);
  }, [slug]);

  if (loading) return <Layout><div className="container py-24 text-center text-muted-foreground">Loading…</div></Layout>;
  if (!post) return <NotFound />;

  return (
    <Layout>
      <SEO
        title={post.meta_title || post.title}
        description={post.meta_description || post.excerpt || ""}
        canonical={url}
        image={featuredImage || undefined}
        type="article"
        publishedTime={post.published_at || undefined}
        author={post.author_name || undefined}
        keywords={post.keywords || []}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          image: featuredImage,
          datePublished: post.published_at,
          dateModified: post.published_at,
          author: { "@type": "Person", name: post.author_name || "PassivePress Editorial" },
          publisher: { "@type": "Organization", name: "PassivePress" },
          description: post.meta_description || post.excerpt,
          mainEntityOfPage: url,
          articleSection: post.category?.name,
          keywords: post.keywords?.join(", "),
        }}
      />

      <article className="container max-w-3xl py-12">
        {post.category && (
          <Link to={`/category/${post.category.slug}`} className="inline-block text-xs font-semibold uppercase tracking-widest text-accent-foreground bg-accent px-2 py-1 mb-6">
            {post.category.name}
          </Link>
        )}
        <h1 className="font-display text-4xl md:text-6xl font-extrabold leading-[1.05] tracking-tight text-balance mb-6">
          {post.title}
        </h1>
        {post.excerpt && <p className="text-xl text-muted-foreground leading-relaxed mb-6">{post.excerpt}</p>}
        <div className="flex items-center gap-4 text-sm text-muted-foreground border-y border-border py-4 mb-10">
          <span className="font-medium text-foreground">{post.author_name || "PassivePress Editorial"}</span>
          <span>·</span>
          <time dateTime={post.published_at || undefined}>
            {post.published_at && format(new Date(post.published_at), "MMMM d, yyyy")}
          </time>
          <span>·</span>
          <span>{post.reading_time ?? 5} min read</span>
        </div>

        {featuredImage && (
          <figure className="mb-10 -mx-4 md:-mx-12">
            <img
              src={featuredImage}
              alt={post.featured_image_alt || post.title}
              loading="eager"
              width={1600}
              height={900}
              className="w-full rounded-sm shadow-editorial"
            />
            {post.featured_image_alt && (
              <figcaption className="text-xs text-muted-foreground text-center mt-2 italic">{post.featured_image_alt}</figcaption>
            )}
          </figure>
        )}

        <div className="editorial-prose">
          <AffiliateDisclosure />
          <Suspense fallback={<div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Formatting content...</div>}>
            <MarkdownRenderer
              content={contentWithTokens}
              charts={charts}
              ads={ads}
              postSlug={post.slug}
            />
          </Suspense>
        </div>

        {post.keywords && post.keywords.length > 0 && (
          <div className="mt-12 pt-6 border-t border-border">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {post.keywords.map((k) => (
                <span key={k} className="px-2 py-1 bg-muted text-xs rounded-sm">{k}</span>
              ))}
            </div>
          </div>
        )}
      </article>

      {(related?.length ?? 0) > 0 && (
        <section className="container py-16 border-t border-border">
          <h2 className="font-display text-3xl font-bold mb-8">Continue reading</h2>
          <div className="grid md:grid-cols-3 gap-10">
            {related?.map((p) => <PostCard key={p.slug} post={p} />)}
          </div>
        </section>
      )}
    </Layout>
  );
};

export default Post;
