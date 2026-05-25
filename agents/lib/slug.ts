/**
 * Generate a URL-safe kebab-case slug from a title string.
 */
export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[''`]/g, "")           // strip apostrophes/smart-quotes before hyphenation (fixes "what's" → "whats" not "what-s")
    .replace(/[^a-z0-9\s-]/g, "")   // remove remaining non-alphanumeric
    .trim()
    .replace(/[\s_]+/g, "-")         // spaces → hyphens
    .replace(/-+/g, "-")             // collapse multiple hyphens
    .replace(/^-|-$/g, "");          // trim leading/trailing hyphens
}

/**
 * Make a slug unique by appending -2, -3, etc. if it already exists.
 */
export function makeUniqueSlug(slug: string, existingSlugs: string[]): string {
  const set = new Set(existingSlugs);
  if (!set.has(slug)) return slug;

  let counter = 2;
  while (set.has(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}
