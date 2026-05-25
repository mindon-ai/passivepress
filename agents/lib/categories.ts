/**
 * agents/lib/categories.ts
 * Single source of truth for valid PassivePress affiliate category slugs.
 */

export const VALID_CATEGORY_SLUGS = [
  "tech",
  "home-appliances",
  "fitness",
  "outdoors",
  "kitchen",
  // Legacy NeuronPress categories remain accepted while existing seeded Convex
  // categories/admin settings are migrated.
  "ai-news",
  "llms",
  "image-ai",
  "ai-coding",
  "ai-business",
  "ai-research",
] as const;

export type CategorySlug = typeof VALID_CATEGORY_SLUGS[number];
