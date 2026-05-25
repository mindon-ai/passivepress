/**
 * Agent 5 — Publisher
 * Validates the full pipeline context and writes to Convex DB.
 * Output: PublishResult
 */

import "dotenv/config";
import fs from "fs";
import { getPublisherConfig, uploadImageToConvexStorage, agentPublish, listExistingSlugs } from "../lib/convex-client.ts";
import {
  MAX_META_DESCRIPTION_CHARS,
  MAX_META_TITLE_CHARS,
  MIN_ARTICLE_WORDS,
  MIN_META_DESCRIPTION_CHARS,
  MIN_META_TITLE_CHARS,
} from "../lib/content-rules.ts";
import { countWords } from "../lib/reading-time.ts";
import type { PipelineContext, PublisherConfig, PublishResult } from "../types/pipeline.ts";

interface ValidationError {
  field: string;
  message: string;
}

const DEFAULT_PUBLISHER_CONFIG: PublisherConfig = {
  validation: {
    requireValidSlug: true,
    minTitleChars: 10,
    minWords: MIN_ARTICLE_WORDS,
    maxExcerptChars: 300,
    minMetaTitleChars: MIN_META_TITLE_CHARS,
    maxMetaTitleChars: MAX_META_TITLE_CHARS,
    minMetaDescriptionChars: MIN_META_DESCRIPTION_CHARS,
    maxMetaDescriptionChars: MAX_META_DESCRIPTION_CHARS,
    requireImageFile: true,
  },
  slug: {
    verifyUniqueness: true,
    failOnDuplicate: true,
  },
  image: {
    uploadToConvexStorage: true,
    requireStorageUrl: true,
    allowExistingStorageId: true,
  },
  publish: {
    enabled: true,
    dryRun: false,
    fallbackToChosenKeywords: true,
    requireCategoryId: false,
  },
};

function validate(ctx: PipelineContext, config: PublisherConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const { draft, image } = ctx;

  // Slug
  if (config.validation.requireValidSlug && (!draft.slug || !/^[a-z0-9-]+$/.test(draft.slug))) {
    errors.push({ field: "slug", message: `Invalid slug: "${draft.slug}"` });
  }

  // Title
  if (!draft.title || draft.title.length <= config.validation.minTitleChars) {
    errors.push({
      field: "title",
      message: `Title too short: "${draft.title}" (minimum ${config.validation.minTitleChars + 1})`,
    });
  }

  // Content length
  const wordCount = countWords(draft.content);
  if (wordCount < config.validation.minWords) {
    errors.push({
      field: "content",
      message: `Content too short: ${wordCount} words (minimum ${config.validation.minWords})`,
    });
  }

  // Excerpt
  if (draft.excerpt && draft.excerpt.length > config.validation.maxExcerptChars) {
    errors.push({
      field: "excerpt",
      message: `Excerpt too long: ${draft.excerpt.length} chars (max ${config.validation.maxExcerptChars})`,
    });
  }

  // Meta title
  if (draft.metaTitle && draft.metaTitle.length < config.validation.minMetaTitleChars) {
    errors.push({
      field: "metaTitle",
      message: `metaTitle too short: ${draft.metaTitle.length} chars (min ${config.validation.minMetaTitleChars})`,
    });
  }
  if (draft.metaTitle && draft.metaTitle.length > config.validation.maxMetaTitleChars) {
    errors.push({
      field: "metaTitle",
      message: `metaTitle too long: ${draft.metaTitle.length} chars (max ${config.validation.maxMetaTitleChars})`,
    });
  }

  // Meta description
  if (draft.metaDescription && draft.metaDescription.length < config.validation.minMetaDescriptionChars) {
    errors.push({
      field: "metaDescription",
      message: `metaDescription too short: ${draft.metaDescription.length} chars (min ${config.validation.minMetaDescriptionChars})`,
    });
  }
  if (draft.metaDescription && draft.metaDescription.length > config.validation.maxMetaDescriptionChars) {
    errors.push({
      field: "metaDescription",
      message: `metaDescription too long: ${draft.metaDescription.length} chars (max ${config.validation.maxMetaDescriptionChars})`,
    });
  }

  // Image file on disk
  if (config.validation.requireImageFile && !fs.existsSync(image.localPath)) {
    errors.push({
      field: "image.localPath",
      message: `Image file not found on disk: "${image.localPath}"`,
    });
  }

  return errors;
}

export async function run(ctx: PipelineContext): Promise<PublishResult> {
  console.log("[Publisher] Starting validation...");

  let config = DEFAULT_PUBLISHER_CONFIG;
  try {
    config = await getPublisherConfig();
    console.log("[Publisher] Loaded settings from Convex");
  } catch (err) {
    console.warn("[Publisher] Could not load Convex settings; using code defaults:", (err as Error).message);
  }

  // Validate context
  const errors = validate(ctx, config);
  if (errors.length > 0) {
    const errorMessages = errors.map((e) => `  ✗ ${e.field}: ${e.message}`).join("\n");
    throw new Error(`[Publisher] Validation failed:\n${errorMessages}`);
  }
  console.log("[Publisher] Validation passed ✓");

  if (config.publish.requireCategoryId && !ctx.chosen.categoryId) {
    throw new Error("[Publisher] Category ID is required by settings but missing from chosen topic.");
  }

  // Check slug uniqueness against Convex (final check before write)
  if (config.slug.verifyUniqueness) {
    let existingSlugs: string[] = [];
    try {
      existingSlugs = (await listExistingSlugs()) ?? [];
    } catch (err) {
      console.warn("[Publisher] Could not verify slug uniqueness:", (err as Error).message);
    }

    if (existingSlugs.includes(ctx.draft.slug)) {
      const message = `[Publisher] Slug "${ctx.draft.slug}" already exists in Convex. Writer should have deduplicated.`;
      if (config.slug.failOnDuplicate) throw new Error(message);
      console.warn(message);
    }
  }

  let featuredImageStorageId = ctx.image.storageId ?? null;
  let featuredImageUrl = ctx.image.publicUrl || null;

  if ((!config.image.allowExistingStorageId || !featuredImageStorageId || !featuredImageUrl) && config.image.uploadToConvexStorage) {
    console.log("[Publisher] Uploading featured image to Convex storage...");
    const uploadResult = await uploadImageToConvexStorage(ctx.image.localPath);
    featuredImageStorageId = uploadResult.storageId;
    featuredImageUrl = uploadResult.url;
    ctx.image.storageId = uploadResult.storageId;
    ctx.image.publicUrl = uploadResult.url;
  }

  if (config.image.requireStorageUrl && (!featuredImageStorageId || !featuredImageUrl)) {
    throw new Error("[Publisher] Featured image storage URL is required by settings but unavailable.");
  }

  // Write to Convex
  console.log(`[Publisher] Publishing "${ctx.draft.title}" to Convex...`);

  // Fall back to chosen topic keywords if draft keywords are missing or empty
  const finalKeywords = (ctx.draft.keywords && ctx.draft.keywords.length > 0)
    ? ctx.draft.keywords
    : (config.publish.fallbackToChosenKeywords ? (ctx.chosen.keywords || []) : []);

  if (!config.publish.enabled || config.publish.dryRun) {
    console.log(`[Publisher] ${config.publish.enabled ? "Dry run" : "Disabled by settings"} — skipping Convex write.`);
    return {
      convexPostId: "dry-run",
      slug: ctx.draft.slug,
      url: `/${ctx.draft.slug}`,
    };
  }

  const result = await agentPublish({
    slug: ctx.draft.slug,
    title: ctx.draft.title,
    excerpt: ctx.draft.excerpt || null,
    content: ctx.draft.content,
    featured_image: featuredImageUrl,
    featured_image_storage_id: featuredImageStorageId,
    featured_image_alt: ctx.image.altText,
    meta_title: ctx.draft.metaTitle || null,
    meta_description: ctx.draft.metaDescription || null,
    keywords: finalKeywords,
    category_id: ctx.chosen.categoryId || null,
    reading_time: ctx.draft.readingTime,
    affiliateLinks: ctx.affiliateLinks || [],
  });
  const publishedUrl = `/${ctx.draft.slug}`;

  console.log(`[Publisher] ✓ Published successfully!`);
  console.log(`[Publisher] Convex post ID: ${result.postId}`);
  console.log(`[Publisher] URL: ${publishedUrl}`);

  return {
    convexPostId: result.postId,
    slug: ctx.draft.slug,
    url: publishedUrl,
  };
}
