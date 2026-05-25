import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getManyFresh = query({
  args: { asins: v.array(v.string()), now: v.optional(v.number()) },
  handler: async (ctx, { asins, now }) => {
    const timestamp = now ?? Date.now();
    const rows = await Promise.all(
      [...new Set(asins.map((asin) => asin.toUpperCase()))].map(async (asin) => {
        const row = await ctx.db
          .query("productCache")
          .withIndex("by_asin", (q) => q.eq("asin", asin))
          .first();
        if (!row || row.expiresAt <= timestamp) return null;
        return row.data;
      }),
    );
    return rows.filter(Boolean);
  },
});

export const upsertMany = mutation({
  args: {
    products: v.array(v.any()),
    ttlHours: v.optional(v.number()),
  },
  handler: async (ctx, { products, ttlHours }) => {
    const now = Date.now();
    const ttlMs = Math.max(1, ttlHours ?? 24) * 60 * 60 * 1000;
    let count = 0;

    for (const product of products) {
      const asin = String(product?.asin ?? "").trim().toUpperCase();
      if (!asin) continue;
      const existing = await ctx.db
        .query("productCache")
        .withIndex("by_asin", (q) => q.eq("asin", asin))
        .first();
      const payload = { asin, data: { ...product, asin }, fetchedAt: now, expiresAt: now + ttlMs };
      if (existing) await ctx.db.patch(existing._id, payload);
      else await ctx.db.insert("productCache", payload);
      count++;
    }

    return { count };
  },
});

export const purgeExpired = mutation({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { now, limit }) => {
    const timestamp = now ?? Date.now();
    const rows = await ctx.db
      .query("productCache")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", timestamp))
      .take(limit ?? 100);
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    return { count: rows.length };
  },
});
