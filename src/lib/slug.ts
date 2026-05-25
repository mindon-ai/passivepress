/**
 * Frontend slug utility — mirrors agents/lib/slug.ts toSlug() logic.
 * Used in PostEditor.tsx for URL-safe slug generation from post titles.
 *
 * Note: Keep in sync with agents/lib/slug.ts when changing the algorithm.
 */

/**
 * Generate a URL-safe kebab-case slug from a title string.
 * Handles diacritics, smart quotes, and Unicode normalization.
 */
export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[''`]/g, "")           // strip apostrophes/smart-quotes (e.g. "what's" → "whats")
    .replace(/[^a-z0-9\s-]/g, "")   // remove remaining non-alphanumeric
    .trim()
    .replace(/[\s_]+/g, "-")         // spaces → hyphens
    .replace(/-+/g, "-")             // collapse multiple hyphens
    .replace(/^-|-$/g, "");          // trim leading/trailing hyphens
}
