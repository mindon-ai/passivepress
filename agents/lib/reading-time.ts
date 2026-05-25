/**
 * Calculate estimated reading time in minutes.
 * Based on average adult reading speed of ~200 words/minute.
 */
export function calculateReadingTime(text: string): number {
  const wordCount = countWords(text);
  return Math.max(1, Math.ceil(wordCount / 200));
}

/**
 * Count words in a string (handles Markdown content).
 */
export function countWords(text: string): number {
  return text
    .replace(/```[\s\S]*?```/g, " ") // strip code blocks
    .replace(/`[^`]+`/g, " ")        // strip inline code
    .replace(/!\[.*?\]\(.*?\)/g, " ") // strip images
    .replace(/\[.*?\]\(.*?\)/g, " ") // strip links
    .replace(/#{1,6}\s+/g, " ")      // strip headings
    .replace(/[*_~`#>|]/g, " ")      // strip markdown symbols
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0).length;
}
