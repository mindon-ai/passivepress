import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const platformValue = v.union(
  v.literal("x"),
);

const campaignStatusValue = v.union(
  v.literal("pending"),
  v.literal("partial"),
  v.literal("completed"),
  v.literal("failed"),
);

const platformStatusValue = v.union(
  v.literal("pending"),
  v.literal("published"),
  v.literal("failed"),
  v.literal("skipped"),
);

export const createCampaign = mutation({
  args: {
    postId: v.optional(v.id("posts")),
    postSlug: v.string(),
    postTitle: v.string(),
    canonicalUrl: v.string(),
    featuredImageUrl: v.optional(v.string()),
    trigger: v.union(v.literal("auto"), v.literal("manual"), v.literal("retry")),
    platformsRequested: v.array(platformValue),
    dryRun: v.boolean(),
    force: v.boolean(),
    retryFailed: v.boolean(),
    copyVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("socialCampaigns", {
      postId: args.postId,
      postSlug: args.postSlug,
      postTitle: args.postTitle,
      canonicalUrl: args.canonicalUrl,
      featuredImageUrl: args.featuredImageUrl,
      status: "pending",
      trigger: args.trigger,
      platformsRequested: args.platformsRequested,
      platformsSucceeded: [],
      platformsFailed: [],
      copyVersion: args.copyVersion,
      errorSummary: undefined,
      startedAt: now,
      completedAt: undefined,
      createdAt: now,
      updatedAt: now,
      metadata: {
        dryRun: args.dryRun,
        force: args.force,
        retryFailed: args.retryFailed,
      },
    });
  },
});

export const finalizeCampaign = mutation({
  args: {
    campaignId: v.id("socialCampaigns"),
    status: campaignStatusValue,
    platformsSucceeded: v.array(platformValue),
    platformsFailed: v.array(platformValue),
    errorSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId, {
      status: args.status,
      platformsSucceeded: args.platformsSucceeded,
      platformsFailed: args.platformsFailed,
      errorSummary: args.errorSummary,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const createPlatformAttempt = mutation({
  args: {
    campaignId: v.id("socialCampaigns"),
    postId: v.optional(v.id("posts")),
    postSlug: v.string(),
    platform: platformValue,
    generatedText: v.optional(v.string()),
    generatedHashtags: v.optional(v.array(v.string())),
    imageUrl: v.optional(v.string()),
    requestPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("socialPlatformPosts")
      .withIndex("by_post_platform", (q) => q.eq("postSlug", args.postSlug).eq("platform", args.platform))
      .collect();
    const attemptNumber = existing.reduce((max, entry) => Math.max(max, entry.attemptNumber), 0) + 1;
    const now = Date.now();
    const attemptId = await ctx.db.insert("socialPlatformPosts", {
      campaignId: args.campaignId,
      postId: args.postId,
      postSlug: args.postSlug,
      platform: args.platform,
      status: "pending",
      attemptNumber,
      requestPayload: args.requestPayload,
      generatedText: args.generatedText,
      generatedHashtags: args.generatedHashtags,
      imageUrl: args.imageUrl,
      createdAt: now,
      updatedAt: now,
    });

    return {
      attemptId,
      attemptNumber,
      generatedText: args.generatedText,
      generatedHashtags: args.generatedHashtags ?? [],
    };
  },
});

export const finalizePlatformAttempt = mutation({
  args: {
    attemptId: v.id("socialPlatformPosts"),
    status: platformStatusValue,
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
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.attemptId, {
      status: args.status,
      remotePostId: args.remotePostId,
      remoteUrl: args.remoteUrl,
      requestPayload: args.requestPayload,
      responsePayload: args.responsePayload,
      generatedText: args.generatedText,
      generatedHashtags: args.generatedHashtags,
      imageUrl: args.imageUrl,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      publishedAt: args.publishedAt,
      updatedAt: Date.now(),
    });
  },
});

export const getSuccessfulPlatformPost = query({
  args: {
    postSlug: v.string(),
    platform: platformValue,
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("socialPlatformPosts")
      .withIndex("by_post_platform", (q) => q.eq("postSlug", args.postSlug).eq("platform", args.platform))
      .collect();
    const success = entries
      .filter((entry) => entry.status === "published")
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];

    if (!success) return null;
    return {
      id: success._id,
      platform: success.platform,
      remotePostId: success.remotePostId ?? null,
      remoteUrl: success.remoteUrl ?? null,
      publishedAt: success.publishedAt ?? null,
    };
  },
});

export const getPlatformStatusForPost = query({
  args: { postSlug: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("socialPlatformPosts")
      .withIndex("by_postSlug", (q) => q.eq("postSlug", args.postSlug))
      .collect();

    const latestByPlatform = new Map<string, (typeof entries)[number]>();
    for (const entry of entries) {
      const current = latestByPlatform.get(entry.platform);
      if (!current || entry.updatedAt > current.updatedAt) {
        latestByPlatform.set(entry.platform, entry);
      }
    }

    return [...latestByPlatform.values()].map((entry) => ({
      platform: entry.platform,
      status: entry.status,
      attemptNumber: entry.attemptNumber,
      remoteUrl: entry.remoteUrl ?? null,
      errorCode: entry.errorCode ?? null,
      errorMessage: entry.errorMessage ?? null,
    }));
  },
});

export const getByPostSlug = query({
  args: { postSlug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("socialPlatformPosts")
      .withIndex("by_postSlug", (q) => q.eq("postSlug", args.postSlug))
      .order("desc")
      .collect();
  },
});

export const listCampaignsByPost = query({
  args: { postSlug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("socialCampaigns")
      .withIndex("by_postSlug", (q) => q.eq("postSlug", args.postSlug))
      .order("desc")
      .collect();
  },
});

export const listRecentCampaigns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("socialCampaigns")
      .withIndex("by_createdAt")
      .order("desc")
      .take(args.limit ?? 20);
  },
});
