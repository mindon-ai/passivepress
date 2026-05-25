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
