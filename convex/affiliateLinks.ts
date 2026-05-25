import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByPostSlug = query({
  args: { postSlug: v.string() },
  handler: async (ctx, { postSlug }) => {
    return await ctx.db
      .query("affiliateLinks")
      .withIndex("by_postSlug", (q) => q.eq("postSlug", postSlug))
      .collect();
  },
});

export const listTop = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query("affiliateLinks").collect();
    return rows
      .sort((a, b) => (b.clickCount ?? 0) - (a.clickCount ?? 0))
      .slice(0, limit ?? 50);
  },
});

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("affiliateLinks").collect();
    const totalLinks = rows.length;
    const totalClicks = rows.reduce((sum, row) => sum + (row.clickCount ?? 0), 0);
    const uniquePosts = new Set(rows.map((row) => row.postSlug)).size;
    const uniqueProducts = new Set(rows.map((row) => row.asin)).size;
    const topLinks = rows
      .sort((a, b) => (b.clickCount ?? 0) - (a.clickCount ?? 0))
      .slice(0, 10)
      .map((row) => ({
        id: row._id,
        postSlug: row.postSlug,
        asin: row.asin,
        productTitle: row.productTitle,
        placeholderType: row.placeholderType,
        clickCount: row.clickCount ?? 0,
        affiliateUrl: row.affiliateUrl,
      }));
    return { totalLinks, totalClicks, uniquePosts, uniqueProducts, topLinks };
  },
});

export const trackClick = mutation({
  args: {
    asin: v.string(),
    postSlug: v.string(),
    referrer: v.optional(v.string()),
  },
  handler: async (ctx, { asin, postSlug }) => {
    const link = await ctx.db
      .query("affiliateLinks")
      .withIndex("by_postSlug", (q) => q.eq("postSlug", postSlug))
      .filter((q) => q.eq(q.field("asin"), asin))
      .first();

    if (!link) return { ok: false, reason: "not_found" };
    await ctx.db.patch(link._id, { clickCount: (link.clickCount ?? 0) + 1 });
    return { ok: true };
  },
});
