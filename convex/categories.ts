import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const passivePressCategories = [
  { slug: "tech", name: "Tech", description: "Practical buying guides and product comparisons for laptops, accessories, gadgets, and electronics.", icon: "Laptop" },
  { slug: "home-appliances", name: "Home Appliances", description: "Robot vacuums, air purifiers, cleaning tools, and useful home upgrades.", icon: "Home" },
  { slug: "fitness", name: "Fitness", description: "Fitness trackers, home gym equipment, recovery tools, and workout gear.", icon: "Activity" },
  { slug: "outdoors", name: "Outdoors", description: "Camping, hiking, travel, and outdoor gear buying guides.", icon: "Tent" },
  { slug: "kitchen", name: "Kitchen", description: "Small appliances, cookware, coffee gear, and kitchen essentials.", icon: "ChefHat" },
];

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").withIndex("by_name").collect();
    return categories.map((category) => ({
      id: category._id,
      slug: category.slug,
      name: category.name,
      description: category.description ?? null,
      icon: category.icon ?? null,
    }));
  },
});

export const seedPassivePressDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const category of passivePressCategories) {
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_slug", (q) => q.eq("slug", category.slug))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, category);
        updated++;
      } else {
        await ctx.db.insert("categories", category);
        inserted++;
      }
    }
    return { inserted, updated, total: passivePressCategories.length, timestamp: now };
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const category = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!category) return null;

    return {
      id: category._id,
      slug: category.slug,
      name: category.name,
      description: category.description ?? null,
      icon: category.icon ?? null,
    };
  },
});
