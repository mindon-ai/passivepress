import type { PipelineContext, ResearchData } from "../../types/pipeline.ts";
import type { PublishedPostDetail } from "../convex-client.ts";
import type { SocialContentInput, SocialRuntimeConfig } from "../../types/social.ts";
import { buildCanonicalArticleUrl } from "./url.ts";

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripMarkdown(value: string): string {
  return collapseWhitespace(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#+\s+/gm, "")
      .replace(/^>\s+/gm, "")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/\n{2,}/g, "\n")
  );
}

function truncateSentences(value: string, maxSentences: number): string[] {
  const parts = collapseWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.slice(0, maxSentences);
}

function fallbackExcerptFromContent(content: string): string {
  return truncateSentences(stripMarkdown(content), 2).join(" ").slice(0, 260).trim();
}

function buildSnippets(content: string): string[] {
  const sentences = truncateSentences(stripMarkdown(content), 6);
  return sentences.filter((sentence) => sentence.length >= 40).slice(0, 3);
}

function buildResearchHighlights(research?: ResearchData): string[] {
  if (!research) return [];
  return research.keyFindings.filter(Boolean).slice(0, 3);
}

export function buildSocialInputFromPipeline(ctx: PipelineContext, config: SocialRuntimeConfig): SocialContentInput {
  const canonicalUrl = buildCanonicalArticleUrl(config.siteUrl, ctx.draft.slug);
  return {
    postId: ctx.convexPostId,
    slug: ctx.draft.slug,
    title: ctx.draft.title,
    excerpt: ctx.draft.excerpt?.trim() || fallbackExcerptFromContent(ctx.draft.content),
    canonicalUrl,
    keywords: ctx.draft.keywords?.length ? ctx.draft.keywords : ctx.chosen.keywords,
    categoryName: ctx.chosen.category,
    categorySlug: ctx.chosen.category,
    featuredImageUrl: ctx.image.publicUrl || undefined,
    featuredImageAlt: ctx.image.altText || undefined,
    snippets: buildSnippets(ctx.draft.content),
    researchHighlights: buildResearchHighlights(ctx.research),
    brandName: config.brandName,
    brandFooter: config.brandFooter,
    hashtagGuidance: config.hashtagGuidance,
  };
}

export function buildSocialInputFromPublishedPost(post: PublishedPostDetail, config: SocialRuntimeConfig): SocialContentInput {
  return {
    postId: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt?.trim() || fallbackExcerptFromContent(post.content),
    canonicalUrl: buildCanonicalArticleUrl(config.siteUrl, post.slug),
    keywords: post.keywords?.length ? post.keywords : [],
    categoryName: post.category?.name ?? undefined,
    categorySlug: post.category?.slug ?? undefined,
    featuredImageUrl: post.featured_image ?? undefined,
    featuredImageAlt: post.featured_image_alt ?? undefined,
    snippets: buildSnippets(post.content),
    researchHighlights: [],
    brandName: config.brandName,
    brandFooter: config.brandFooter,
    hashtagGuidance: config.hashtagGuidance,
  };
}
