import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/authz";

const AMAZON_SETTINGS_ID = "amazon-rainforestapi";

const publicDefaults = {
  provider: "rainforestapi",
  associateTag: "yourstore-20",
  region: "us-east-1",
  marketplace: "www.amazon.com",
  amazonDomain: "amazon.com",
  currency: "USD",
  cacheTtlHours: 24,
};

export const getAmazonPublicSettings = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("agentSettings")
      .withIndex("by_agentId", (q) => q.eq("agentId", AMAZON_SETTINGS_ID))
      .unique();
    return row?.config ?? publicDefaults;
  },
});

export const updateAmazonPublicSettings = mutation({
  args: {
    config: v.object({
      provider: v.optional(v.string()),
      associateTag: v.string(),
      region: v.string(),
      marketplace: v.string(),
      amazonDomain: v.optional(v.string()),
      currency: v.optional(v.string()),
      cacheTtlHours: v.number(),
    }),
  },
  handler: async (ctx, { config }) => {
    const identity = await requireAdmin(ctx);
    const now = Date.now();
    const row = await ctx.db
      .query("agentSettings")
      .withIndex("by_agentId", (q) => q.eq("agentId", AMAZON_SETTINGS_ID))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { config, updatedAt: now, updatedBy: identity.email ?? identity.subject });
      return row._id;
    }
    return await ctx.db.insert("agentSettings", {
      agentId: AMAZON_SETTINGS_ID,
      config,
      createdAt: now,
      updatedAt: now,
      updatedBy: identity.email ?? identity.subject,
    });
  },
});

export const resetAmazonPublicSettings = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAdmin(ctx);
    const now = Date.now();
    const row = await ctx.db
      .query("agentSettings")
      .withIndex("by_agentId", (q) => q.eq("agentId", AMAZON_SETTINGS_ID))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { config: publicDefaults, updatedAt: now, updatedBy: identity.email ?? identity.subject });
    } else {
      await ctx.db.insert("agentSettings", {
        agentId: AMAZON_SETTINGS_ID,
        config: publicDefaults,
        createdAt: now,
        updatedAt: now,
        updatedBy: identity.email ?? identity.subject,
      });
    }
    return publicDefaults;
  },
});
