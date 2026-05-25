/**
 * extensions/convex-tools.ts
 * Typed tool definitions for all Convex database operations used by the pipeline.
 *
 * These are designed to be compatible with @earendil-works/pi-agent-core's
 * registerTool() API. For now they also export plain async functions so they
 * can be called directly from agent code without a full pi session.
 *
 * Usage (direct):
 *   import { getExistingPosts, publishPost } from "./extensions/convex-tools.ts";
 *
 * Usage (pi extension — Phase 3):
 *   import convexExtension from "./extensions/convex-tools.ts";
 *   pi.use(convexExtension);
 */

import {
  listPublishedPostLinks,
  listExistingSlugs,
  listPublishedTitles,
  listRecentCategories,
  getCategoryBySlug,
} from "../lib/convex-client.ts";
import type { PostLink } from "../lib/convex-client.ts";

// ─── Tool: get_existing_posts ─────────────────────────────────────────────────

export interface GetExistingPostsResult {
  posts: PostLink[];
  slugs: string[];
  titles: string[];
}

/**
 * Returns slug + title of the 50 most-recent published posts.
 * Used by Writer for internal linking and TopicPicker for dedup.
 */
export async function getExistingPosts(): Promise<GetExistingPostsResult> {
  const [posts, titles] = await Promise.all([
    listPublishedPostLinks(),
    listPublishedTitles(),
  ]);
  return {
    posts,
    slugs: posts.map((p) => p.slug),
    titles,
  };
}

// ─── Tool: get_recent_categories ─────────────────────────────────────────────

/**
 * Returns category slugs from the last N published posts (default 5).
 * Used by TopicPicker to avoid repeating the same category.
 */
export async function getRecentCategories(limit = 5): Promise<string[]> {
  return listRecentCategories(limit);
}

// ─── Tool: get_category_id ────────────────────────────────────────────────────

/**
 * Resolve a category slug to its Convex document ID.
 * Returns null if the category doesn't exist.
 */
export async function getCategoryId(slug: string): Promise<string | null> {
  try {
    const cat = await getCategoryBySlug(slug);
    return cat?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Tool: verify_slug_unique ─────────────────────────────────────────────────

/**
 * Check whether a proposed slug is already taken.
 * Returns true if the slug is available.
 */
export async function verifySlugUnique(slug: string): Promise<boolean> {
  const existing = await listExistingSlugs();
  return !existing.includes(slug);
}

// ─── Pi extension export (Phase 3) ───────────────────────────────────────────
// When @earendil-works/pi-agent-core is integrated, replace this stub with:
//
// import type { ExtensionAPI } from "@earendil-works/pi-agent-core";
// export default function convexExtension(pi: ExtensionAPI) {
//   pi.registerTool({
//     name: "get_existing_posts",
//     label: "Get Published Posts",
//     description: "Returns slug+title of the 50 most-recent Neuron Press posts",
//     parameters: {},
//     async execute() {
//       const result = await getExistingPosts();
//       return { content: [{ type: "text", text: JSON.stringify(result) }], details: {} };
//     },
//   });
//   pi.registerTool({ name: "get_recent_categories", ... });
//   pi.registerTool({ name: "verify_slug_unique", ... });
// }
