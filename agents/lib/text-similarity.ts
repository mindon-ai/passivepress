/**
 * Shared text similarity utilities for deduplication across pipeline agents.
 * Used by 1-trend-scout.ts and 2-topic-picker.ts.
 */

/**
 * Normalize a title into a set of meaningful words.
 * Lowercases, splits on non-word characters, and filters short words.
 *
 * @param title - Raw title string
 * @param minLen - Minimum word length to include (default: 3, meaning > 3 chars)
 */
export function normalizeWords(title: string, minLen = 3): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > minLen)
  );
}

/**
 * Compute Jaccard similarity between two title strings.
 * Returns a value between 0 (no overlap) and 1 (identical word sets).
 *
 * @param a - First title
 * @param b - Second title
 * @param minLen - Minimum word length to include (default: 3)
 */
export function jaccardSimilarity(a: string, b: string, minLen = 3): number {
  const aWords = normalizeWords(a, minLen);
  const bWords = normalizeWords(b, minLen);
  const intersection = [...aWords].filter((w) => bWords.has(w)).length;
  const union = new Set([...aWords, ...bWords]).size;
  return intersection / Math.max(union, 1);
}

/**
 * Check if a title is a near-duplicate of any title in an existing list.
 *
 * @param title - Candidate title to check
 * @param existing - Array of titles already seen
 * @param threshold - Jaccard threshold above which titles are considered duplicates (default: 0.35)
 * @param minLen - Minimum word length for normalization (default: 3)
 */
export function isDuplicate(
  title: string,
  existing: string[],
  threshold = 0.35,
  minLen = 3
): boolean {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return false;

  return existing.some((existingTitle) => {
    const normalizedExisting = existingTitle.trim().toLowerCase();
    if (!normalizedExisting) return false;
    if (normalizedExisting === normalized) return true;
    return jaccardSimilarity(title, existingTitle, minLen) >= threshold;
  });
}
