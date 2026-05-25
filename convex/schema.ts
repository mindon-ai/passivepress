import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  categories: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_name", ["name"]),

  posts: defineTable({
    slug: v.string(),
    title: v.string(),
    excerpt: v.optional(v.string()),
    content: v.string(),
    featuredImage: v.optional(v.string()),
    featuredImageStorageId: v.optional(v.id("_storage")),
    featuredImageAlt: v.optional(v.string()),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
    categoryId: v.optional(v.id("categories")),
    authorName: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    readingTime: v.optional(v.number()),
    viewCount: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_published_at", ["status", "publishedAt"])
    .index("by_category", ["categoryId"])
    .index("by_category_status", ["categoryId", "status", "publishedAt"]),

  newsletterSubscriptions: defineTable({
    email: v.string(),
    subscribedAt: v.number(),
    status: v.union(v.literal("active"), v.literal("unsubscribed")),
    metadata: v.optional(v.any()),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  agentSettings: defineTable({
    agentId: v.string(),
    config: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_agentId", ["agentId"])
    .index("by_updatedAt", ["updatedAt"]),

  adSlots: defineTable({
    slot: v.string(),
    name: v.string(),
    code: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_slot", ["slot"])
    .index("by_updatedAt", ["updatedAt"]),

  affiliateLinks: defineTable({
    postId: v.id("posts"),
    postSlug: v.string(),
    asin: v.string(),
    productTitle: v.string(),
    affiliateUrl: v.string(),
    placeholderType: v.union(
      v.literal("inline"),
      v.literal("table"),
      v.literal("cta"),
      v.literal("price"),
    ),
    positionInContent: v.optional(v.number()),
    priceAtPublish: v.optional(v.number()),
    currencyAtPublish: v.optional(v.string()),
    clickCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_postId", ["postId"])
    .index("by_asin", ["asin"])
    .index("by_postSlug", ["postSlug"]),

  productCache: defineTable({
    asin: v.string(),
    data: v.any(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_asin", ["asin"])
    .index("by_expiresAt", ["expiresAt"]),

  socialCampaigns: defineTable({
    postId: v.optional(v.id("posts")),
    postSlug: v.string(),
    postTitle: v.string(),
    canonicalUrl: v.string(),
    featuredImageUrl: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("partial"), v.literal("completed"), v.literal("failed")),
    trigger: v.union(v.literal("auto"), v.literal("manual"), v.literal("retry")),
    platformsRequested: v.array(v.string()),
    platformsSucceeded: v.array(v.string()),
    platformsFailed: v.array(v.string()),
    copyVersion: v.optional(v.string()),
    errorSummary: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_postId", ["postId"])
    .index("by_postSlug", ["postSlug"])
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  socialPlatformPosts: defineTable({
    campaignId: v.id("socialCampaigns"),
    postId: v.optional(v.id("posts")),
    postSlug: v.string(),
    platform: v.union(
      v.literal("x"),
    ),
    status: v.union(v.literal("pending"), v.literal("published"), v.literal("failed"), v.literal("skipped")),
    attemptNumber: v.number(),
    remotePostId: v.optional(v.string()),
    remoteUrl: v.optional(v.string()),
    requestPayload: v.optional(v.any()),
    responsePayload: v.optional(v.any()),
    generatedText: v.optional(v.string()),
    generatedHashtags: v.optional(v.array(v.string())),
    imageUrl: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_campaignId", ["campaignId"])
    .index("by_postId", ["postId"])
    .index("by_postSlug", ["postSlug"])
    .index("by_post_platform", ["postSlug", "platform"])
    .index("by_status", ["status"]),
});
