import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/authz";

type ConvexCtx = { db: any; storage: any };

function normalizeImageUrl(imageUrl?: string | null) {
if (!imageUrl) return undefined;

const trimmed = imageUrl.trim();
if (!trimmed) return undefined;

return trimmed;
}

async function resolveFeaturedImageUrl(
ctx: ConvexCtx,
post: { featuredImage?: string; featuredImageStorageId?: any },
) {
if (post.featuredImageStorageId) {
const storageUrl = await ctx.storage.getUrl(post.featuredImageStorageId);
if (storageUrl) return storageUrl;
}

return normalizeImageUrl(post.featuredImage) ?? null;
}

async function deleteFeaturedImageFromStorage(
ctx: ConvexCtx,
storageId?: any,
) {
if (!storageId) return;
await ctx.storage.delete(storageId);
}

function trimToWordBoundary(value: string, maxLength: number) {
if (value.length <= maxLength) return value;
return value.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
}

function normalizeMetaTitle(metaTitle: string | null | undefined, fallbackTitle: string) {
const candidate = (metaTitle ?? fallbackTitle).trim();
const cleanFallback = fallbackTitle.trim();
const cleanBase = candidate.replace(/\s*\|\s*PassivePress$/i, "").trim();

const variants = [
candidate,
`${cleanBase} | PassivePress`,
`${cleanBase} Buying Guide | PassivePress`,
`${cleanFallback} | PassivePress`,
`${cleanFallback} Buying Guide | PassivePress`,
].filter(Boolean);

for (const value of variants) {
if (value.length >= 50 && value.length <= 60) return value;
}

const longEnough = variants.find((value) => value.length > 60);
if (longEnough) return trimToWordBoundary(longEnough, 60);

return trimToWordBoundary(variants[0] ?? cleanFallback, 60);
}

function normalizeMetaDescription(
metaDescription: string | null | undefined,
fallbackExcerpt: string | null | undefined,
fallbackTitle: string,
) {
const candidate = (metaDescription ?? fallbackExcerpt ?? fallbackTitle).trim();
if (!candidate) return undefined;
if (candidate.length <= 155) return candidate;
return trimToWordBoundary(candidate, 155);
}

async function getCategorySummary(
ctx: ConvexCtx,
categoryId: any,
) {
if (!categoryId) return null;
const category = await ctx.db.get(categoryId);
if (!category) return null;
return { name: category.name, slug: category.slug };
}

async function toPostCardData(
ctx: ConvexCtx,
post: any,
categoryMap: Record<string, { name: string; slug: string } | null>,
) {
return {
slug: post.slug,
title: post.title,
excerpt: post.excerpt ?? null,
featured_image: await resolveFeaturedImageUrl(ctx, post),
featured_image_alt: post.featuredImageAlt ?? null,
published_at: post.publishedAt
? new Date(post.publishedAt).toISOString()
: null,
reading_time: post.readingTime ?? null,
category: post.categoryId ? (categoryMap[post.categoryId] ?? null) : null,
};
}

export const listPublished = query({
args: {
categorySlug: v.optional(v.string()),
limit: v.optional(v.number()),
},
handler: async (ctx, { categorySlug, limit }) => {
let categoryId;
if (categorySlug) {
const category = await ctx.db
.query("categories")
.withIndex("by_slug", (q) => q.eq("slug", categorySlug))
.unique();
if (!category) return [];
categoryId = category._id;
}

const posts = await ctx.db
.query("posts")
.withIndex("by_status_published_at", (q) => q.eq("status", "published"))
.order("desc")
.collect();

const filtered = categoryId
? posts.filter((post) => post.categoryId === categoryId)
: posts;

const sliced =
typeof limit === "number" ? filtered.slice(0, limit) : filtered;

// Batch-fetch unique categories once instead of N separate ctx.db.get() calls
const uniqueCategoryIds = [...new Set(sliced.map((p) => p.categoryId).filter(Boolean))] as Id<"categories">[];
const categoryEntries = await Promise.all(
uniqueCategoryIds.map(async (id) => {
const cat = await ctx.db.get(id);
return [String(id), cat ? { name: cat.name, slug: cat.slug } : null] as const;
})
);
const categoryMap = Object.fromEntries(categoryEntries);

return await Promise.all(sliced.map((post) => toPostCardData(ctx, post, categoryMap)));
},
});

export const listExistingSlugs = query({
args: {},
handler: async (ctx) => {
// Intentionally includes drafts — slug must be globally unique across all post statuses
const posts = await ctx.db.query("posts").collect();
return posts.map((p) => p.slug);
},
});

export const insertFromAgent = internalMutation({
args: {
slug: v.string(),
title: v.string(),
excerpt: v.union(v.string(), v.null()),
content: v.string(),
featured_image: v.union(v.string(), v.null()),
featured_image_storage_id: v.optional(v.union(v.id("_storage"), v.null())),
featured_image_alt: v.union(v.string(), v.null()),
meta_title: v.union(v.string(), v.null()),
meta_description: v.union(v.string(), v.null()),
keywords: v.array(v.string()),
category_id: v.union(v.id("categories"), v.null()),
reading_time: v.number(),
affiliateLinks: v.optional(v.array(v.object({
  asin: v.string(),
  productTitle: v.string(),
  affiliateUrl: v.string(),
  placeholderType: v.union(v.literal("inline"), v.literal("table"), v.literal("cta"), v.literal("price")),
  positionInContent: v.optional(v.number()),
  priceAtPublish: v.optional(v.number()),
  currencyAtPublish: v.optional(v.string()),
}))),
},
handler: async (ctx, args) => {
const now = Date.now();
const postId = await ctx.db.insert("posts", {
slug: args.slug,
title: args.title,
excerpt: args.excerpt ?? undefined,
content: args.content,
featuredImage: normalizeImageUrl(args.featured_image),
featuredImageStorageId: args.featured_image_storage_id ?? undefined,
featuredImageAlt: args.featured_image_alt ?? undefined,
metaTitle: normalizeMetaTitle(args.meta_title, args.title),
metaDescription: normalizeMetaDescription(args.meta_description, args.excerpt, args.title),
keywords: args.keywords,
categoryId: args.category_id ?? undefined,
authorName: "PassivePress",
status: "published",
readingTime: args.reading_time,
publishedAt: now,
updatedAt: now,
});

for (const link of args.affiliateLinks ?? []) {
await ctx.db.insert("affiliateLinks", {
postId,
postSlug: args.slug,
asin: link.asin,
productTitle: link.productTitle,
affiliateUrl: link.affiliateUrl,
placeholderType: link.placeholderType,
positionInContent: link.positionInContent,
priceAtPublish: link.priceAtPublish,
currencyAtPublish: link.currencyAtPublish,
clickCount: 0,
createdAt: now,
});
}

return postId;
},
});

export const getBySlug = query({
args: { slug: v.string() },
handler: async (ctx, { slug }) => {
const post = await ctx.db
.query("posts")
.withIndex("by_slug", (q) => q.eq("slug", slug))
.unique();

if (!post || post.status !== "published") return null;

return {
id: post._id,
slug: post.slug,
title: post.title,
excerpt: post.excerpt ?? null,
content: post.content,
featured_image: await resolveFeaturedImageUrl(ctx, post),
featured_image_alt: post.featuredImageAlt ?? null,
meta_title: post.metaTitle ?? null,
meta_description: post.metaDescription ?? null,
keywords: post.keywords ?? null,
author_name: post.authorName ?? null,
published_at: post.publishedAt
? new Date(post.publishedAt).toISOString()
: null,
reading_time: post.readingTime ?? null,
category: await getCategorySummary(ctx, post.categoryId),
};
},
});

export const getByIdForAgent = query({
args: { id: v.id("posts") },
handler: async (ctx, { id }) => {
const post = await ctx.db.get(id);
if (!post || post.status !== "published") return null;

return {
id: post._id,
slug: post.slug,
title: post.title,
excerpt: post.excerpt ?? null,
content: post.content,
featured_image: await resolveFeaturedImageUrl(ctx, post),
featured_image_alt: post.featuredImageAlt ?? null,
meta_title: post.metaTitle ?? null,
meta_description: post.metaDescription ?? null,
keywords: post.keywords ?? null,
author_name: post.authorName ?? null,
published_at: post.publishedAt
? new Date(post.publishedAt).toISOString()
: null,
reading_time: post.readingTime ?? null,
category: await getCategorySummary(ctx, post.categoryId),
};
},
});

export const listRelated = query({
args: { slug: v.string(), limit: v.optional(v.number()) },
handler: async (ctx, { slug, limit }) => {
const maxItems = limit ?? 3;
const current = await ctx.db
.query("posts")
.withIndex("by_slug", (q) => q.eq("slug", slug))
.unique();

const posts = await ctx.db
.query("posts")
.withIndex("by_status_published_at", (q) => q.eq("status", "published"))
.order("desc")
.collect();

const otherPosts = posts.filter((post) => post.slug !== slug);
const sameCategory = current?.categoryId
? otherPosts.filter((post) => post.categoryId === current.categoryId)
: [];

let selected = sameCategory.slice(0, maxItems);

if (selected.length < maxItems && current?.keywords?.length) {
const usedSlugs = new Set(selected.map((post) => post.slug));
const keywordMatches = otherPosts
.filter((post) => !usedSlugs.has(post.slug))
.filter((post) => {
const postKeywords = post.keywords ?? [];
return postKeywords.some((keyword) =>
current.keywords?.includes(keyword),
);
});

for (const post of keywordMatches) {
if (selected.length >= maxItems) break;
selected.push(post);
usedSlugs.add(post.slug);
}
}

if (selected.length < maxItems) {
const usedSlugs = new Set(selected.map((post) => post.slug));
const fallback = otherPosts.filter((post) => !usedSlugs.has(post.slug));
selected = [
...selected,
...fallback.slice(0, maxItems - selected.length),
];
}

return await Promise.all(
selected.slice(0, maxItems).map((post) => toPostCardData(ctx, post, {})),
);
},
});

export const listAdmin = query({
args: {},
handler: async (ctx) => {
await requireAdmin(ctx);
const posts = await ctx.db.query("posts").order("desc").collect();

return await Promise.all(
posts.map(async (post) => ({
id: post._id,
slug: post.slug,
title: post.title,
status: post.status,
published_at: post.publishedAt
? new Date(post.publishedAt).toISOString()
: null,
category: await getCategorySummary(ctx, post.categoryId),
})),
);
},
});

export const getById = query({
args: { id: v.id("posts") },
handler: async (ctx, { id }) => {
await requireAdmin(ctx);
const post = await ctx.db.get(id);
if (!post) return null;

return {
id: post._id,
title: post.title,
slug: post.slug,
excerpt: post.excerpt ?? "",
content: post.content,
featured_image: (await resolveFeaturedImageUrl(ctx, post)) ?? "",
featured_image_storage_id: post.featuredImageStorageId ?? null,
featured_image_alt: post.featuredImageAlt ?? "",
meta_title: post.metaTitle ?? "",
meta_description: post.metaDescription ?? "",
keywords: post.keywords ?? [],
category_id: post.categoryId ?? null,
author_name: post.authorName ?? "",
status: post.status,
reading_time: post.readingTime ?? 5,
};
},
});

export const upsert = mutation({
args: {
id: v.optional(v.id("posts")),
title: v.string(),
slug: v.string(),
excerpt: v.optional(v.union(v.string(), v.null())),
content: v.string(),
featured_image: v.optional(v.union(v.string(), v.null())),
featured_image_storage_id: v.optional(v.union(v.id("_storage"), v.null())),
featured_image_alt: v.optional(v.union(v.string(), v.null())),
meta_title: v.optional(v.union(v.string(), v.null())),
meta_description: v.optional(v.union(v.string(), v.null())),
keywords: v.optional(v.union(v.array(v.string()), v.null())),
category_id: v.optional(v.union(v.id("categories"), v.null())),
author_name: v.optional(v.union(v.string(), v.null())),
status: v.union(v.literal("draft"), v.literal("published")),
reading_time: v.number(),
},
handler: async (ctx, args) => {
const identity = await requireAdmin(ctx);
const existing = args.id ? await ctx.db.get(args.id) : null;
const nextFeaturedImageStorageId = args.featured_image_storage_id ?? undefined;

if (
existing?.featuredImageStorageId &&
existing.featuredImageStorageId !== nextFeaturedImageStorageId
) {
await deleteFeaturedImageFromStorage(ctx, existing.featuredImageStorageId);
}

const publishedAt =
args.status === "published"
? (existing?.publishedAt ?? Date.now())
: null;

const payload = {
title: args.title,
slug: args.slug,
excerpt: args.excerpt ?? undefined,
content: args.content,
featuredImage: normalizeImageUrl(args.featured_image),
featuredImageStorageId: nextFeaturedImageStorageId,
featuredImageAlt: args.featured_image_alt ?? undefined,
metaTitle: normalizeMetaTitle(args.meta_title, args.title),
metaDescription: normalizeMetaDescription(args.meta_description, args.excerpt, args.title),
keywords: args.keywords ?? undefined,
categoryId: args.category_id ?? undefined,
authorId: undefined,
authorName: args.author_name ?? identity.name ?? identity.email ?? "PassivePress Editorial",
status: args.status,
readingTime: args.reading_time,
publishedAt: publishedAt ?? undefined,
updatedAt: Date.now(),
};

if (args.id) {
await ctx.db.patch(args.id, payload);
return args.id;
}

return await ctx.db.insert("posts", payload);
},
});

export const remove = mutation({
args: { id: v.id("posts") },
handler: async (ctx, { id }) => {
await requireAdmin(ctx);
const post = await ctx.db.get(id);
if (!post) return;

await deleteFeaturedImageFromStorage(ctx, post.featuredImageStorageId);
await ctx.db.delete(id);
},
});

export const getCurrentUser = query({
args: {},
handler: async (ctx) => {
const identity = await ctx.auth.getUserIdentity();
if (!identity) return null;
return {
subject: identity.subject,
email: identity.email ?? null,
name: identity.name ?? null,
tokenIdentifier: identity.tokenIdentifier,
};
},
});

/**
* Returns the category slugs of the most recently published posts.
* Used by 2-topic-picker.ts to avoid repeating the same category — replaces
* the filesystem log scan, which was fragile and format-coupled.
*/
export const listRecentCategories = query({
args: { limit: v.optional(v.number()) },
handler: async (ctx, { limit }) => {
const maxItems = limit ?? 5;
const posts = await ctx.db
.query("posts")
.withIndex("by_status_published_at", (q) => q.eq("status", "published"))
.order("desc")
.take(maxItems);

const categoryIds = [...new Set(posts.map((p) => p.categoryId).filter(Boolean))];
const categories = await Promise.all(
categoryIds.map(async (id) => {
const cat = await ctx.db.get(id as any) as { slug?: string } | null;
return cat?.slug ?? null;
})
);
return categories.filter(Boolean) as string[];
},
});
