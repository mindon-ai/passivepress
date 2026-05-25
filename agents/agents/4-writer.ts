/**
 * Agent 4 — Writer
 * Writes a full publication-ready blog post in Markdown using CF Workers AI LLM.
 * Uses two LLM calls: one for metadata (small JSON), one for full Markdown content.
 * Output: PostDraft
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { callLLM } from "../lib/pi-llm-client.ts";
import { getWriterConfig, listExistingSlugs, listPublishedPostLinks } from "../lib/convex-client.ts";
import { MIN_ARTICLE_WORDS } from "../lib/content-rules.ts";
import type { PostLink } from "../lib/convex-client.ts";
import { toSlug, makeUniqueSlug } from "../lib/slug.ts";
import { calculateReadingTime, countWords } from "../lib/reading-time.ts";
import { IMAGE_OUTPUT_DIR } from "../lib/paths.ts";
import { loadSkill } from "../lib/skill-loader.ts";
import { runOneShotPiAgent } from "../lib/pi-agent-utils.ts";
import { getExistingPostsTool, createReturnDraftTool, createReturnMetadataTool } from "../extensions/writer-tools.ts";
import type { ChosenTopic, DataVizResult, ImageResult, PostDraft, ProductResearchData, WriterConfig } from "../types/pipeline.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PostMetadata {
  slug: string;
  title: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
}

const DEFAULT_WRITER_CONFIG: WriterConfig = {
  metadata: {
    titleMaxChars: 200,
    slugMaxChars: 60,
    excerptMaxChars: 300,
    metaTitleMaxChars: 60,
    metaDescriptionMaxChars: 160,
    includeKeywords: true,
    customInstruction: "",
  },
  content: {
    minWords: MIN_ARTICLE_WORDS,
    targetMinWords: 1100,
    targetMaxWords: 1400,
    bodySectionsMin: 4,
    bodySectionsMax: 5,
    requireKeyTakeaways: true,
    requireFaq: true,
    requireConclusion: true,
    customInstruction: "",
  },
  context: {
    includeResearch: true,
    includeDataViz: true,
    includeSourceLinks: true,
    includeInternalLinks: true,
    existingPostsLimit: 25,
    includeFurtherReading: true,
    includeTableOfContents: true,
  },
  continuation: {
    enabled: true,
    maxTokens: 2500,
  },
  cleanup: {
    stripReferences: true,
    deduplicateBold: true,
    fixBoldHeadings: true,
    validateInternalLinks: true,
  },
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Truncate a string to a max length, preserving word boundaries.
 */
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str
    .slice(0, max)
    .replace(/\s+\S*$/, "")
    .trim();
}

/**
 * Strip any leading H1 from the content body (title is rendered separately).
 */
function stripLeadingH1(content: string): string {
  return content.replace(/^#\s+[^\n]+\n+/, "").trim();
}

/**
 * Remove academic-style reference/bibliography blocks that the LLM sometimes
 * appends. Matches common patterns:
 *   - "References:" / "References\n" / "## References" headings
 *   - Numbered entries like "[1] Author. URL. [Online]. Available: ..."
 *   - "Bibliography:" variants
 *
 * Everything from that heading to the end of the document is stripped because
 * a trailing reference block is always the last section.
 */
function stripReferencesSection(content: string): string {
  // Match a references/bibliography heading (Markdown ## or plain text) and
  // everything that follows it to EOF.
  const refHeadingPattern =
    /\n{0,2}(?:#{1,3}\s+)?(References|Bibliography|Sources|Works Cited|Further References)\s*:?\s*\n[\s\S]*$/i;

  const stripped = content.replace(refHeadingPattern, "").trim();

  // Also strip any stray numbered citation lines like "[1] ..." that escaped
  // the heading match (e.g. if the LLM skipped the heading entirely).
  const citationLinePattern = /\n\[\d+\][^\n]+(?:\n(?!\n)[^\n]+)*/g;
  return stripped.replace(citationLinePattern, "").trim();
}

/**
 * Extract a human-readable label from a URL for use as link text.
 * e.g. "https://huggingface.co/blog/smollm2" → "HuggingFace – SmolLM2"
 *      "https://techcrunch.com/2025/01/ai-news" → "TechCrunch"
 */
function urlToLabel(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);

    // Capitalise the root domain name (strip www., drop TLD)
    const domainParts = hostname.replace(/^www\./, "").split(".");
    const domain =
      domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);

    // Turn the last path segment into readable words
    const lastSegment = pathname
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/[-_]/g, " ")
      .replace(/\.\w+$/, "") // strip file extension
      .trim();

    if (lastSegment && lastSegment.length > 3 && !/^\d{4}$/.test(lastSegment)) {
      const label = lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
      return `${domain} – ${truncate(label, 50)}`;
    }

    return domain;
  } catch {
    return url; // fallback: return raw URL if parsing fails
  }
}

/**
 * Build a clean "## Further Reading" section from the topic's source URLs.
 * Outputs proper Markdown hyperlinks instead of raw / academic-style URLs.
 * URLs already present as inline links in the content body are excluded to
 * avoid showing the same reference twice.
 */
function buildFurtherReading(sourceUrls: string[], content = ""): string {
  if (!sourceUrls || sourceUrls.length === 0) return "";

  // Collect every URL already hyperlinked anywhere in the content body
  const inlinedUrls = new Set<string>();
  const inlineLinkPattern = /\]\(([^)\s]+)\)/g;
  let m;
  while ((m = inlineLinkPattern.exec(content)) !== null) {
    inlinedUrls.add(m[1]);
  }

  const links = sourceUrls
    .filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    })
    // Skip URLs the writer already linked inline
    .filter((url) => !inlinedUrls.has(url))
    .map((url) => `- [${urlToLabel(url)}](${url})`)
    .join("\n");

  if (!links) return "";

  return `\n\n## Further Reading\n\n${links}`;
}

// ---------------------------------------------------------------------------
// ToC + internal link utilities
// ---------------------------------------------------------------------------

/**
 * Convert a heading string into a URL anchor.
 * Must stay in sync with the custom h2/h3 components in Post.tsx.
 */
function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
}

/**
 * Build a "## Contents" Table of Contents from all ## headings.
 * Generated only when there are 3+ non-terminal sections.
 * Excludes standard terminal sections (Key Takeaways, FAQ, Conclusion, etc.)
 */
function buildTableOfContents(content: string): string {
  const EXCLUDED =
    /^(key takeaways|faq|frequently asked questions|conclusion|further reading|contents)$/i;
  const headingPattern = /^## (.+)$/gm;
  const headings: string[] = [];
  let match;
  while ((match = headingPattern.exec(content)) !== null) {
    const h = match[1].trim();
    if (!EXCLUDED.test(h)) headings.push(h);
  }
  if (headings.length < 3) return "";

  const items = headings.map((h) => `- [${h}](#${slugifyHeading(h)})`);
  return `## Contents\n\n${items.join("\n")}\n`;
}

/**
 * Insert the Table of Contents just before the first ## heading so the
 * opening hook paragraphs appear above the ToC.
 */
function insertTocIntoContent(content: string, toc: string): string {
  if (!toc) return content;
  const firstHeadingIdx = content.indexOf("\n## ");
  if (firstHeadingIdx === -1) return `${toc}\n\n${content}`;
  return (
    content.slice(0, firstHeadingIdx) +
    "\n\n" +
    toc +
    "\n" +
    content.slice(firstHeadingIdx)
  );
}

/**
 * Strip any `/post/<slug>` links the LLM invented that don't match a known slug.
 * Prevents broken internal links from ever reaching production.
 */
function validateInternalLinks(
  content: string,
  validSlugs: Set<string>
): string {
  return content.replace(
    /\[([^\]]+)\]\(\/([^)\s]+)\)/g,
    (_match, linkText: string, slug: string) => {
      // Ignore external links, mailto, etc. (they won't match /slug but it's safer to be explicit)
      if (slug.startsWith("http") || slug.startsWith("mailto") || slug.startsWith("tel") || slug.includes("/")) {
        return _match;
      }
      if (validSlugs.has(slug)) return _match;
      console.warn(`[Writer] Removed hallucinated internal link: /${slug}`);
      return linkText; // Keep anchor text, drop the link
    }
  );
}

function stripRenderPlaceholders(content: string): string {
  return content
    .replace(/```chart\s*[\s\S]*?```/g, "")
    .replace(/```ad\s*[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDataVizSection(dataviz?: DataVizResult): string {
  const markdown = dataviz?.content?.trim();
  if (!markdown || !dataviz?.charts?.length) return "";
  return `\n\n${markdown}`;
}

function insertDataVizSection(content: string, dataviz?: DataVizResult): string {
  const section = buildDataVizSection(dataviz);
  if (!section) return content;

  const insertionMatch = content.match(/\n## (Key Takeaways|FAQ|Conclusion)\b/i);
  if (!insertionMatch || insertionMatch.index === undefined) {
    return `${content.trim()}${section}`.trim();
  }

  return `${content.slice(0, insertionMatch.index).trim()}${section}\n\n${content.slice(insertionMatch.index).trim()}`.trim();
}

// ---------------------------------------------------------------------------
// LLM calls
// ---------------------------------------------------------------------------
async function fetchMetadata(topic: ChosenTopic, config: WriterConfig): Promise<PostMetadata> {
  let metadataResult: PostMetadata | null = null;
  let returnMetadataCallCount = 0;
  const returnMetadataTool = createReturnMetadataTool((result) => {
    metadataResult = result;
  }, { once: true });
  const metadataOneShot = await runOneShotPiAgent<PostMetadata>({
    agentId: "WriterMetadata",
    systemPrompt: loadSkill("writer-metadata-affiliate"),
    prompt:
      `Create publication metadata for this PassivePress affiliate article.\n\n` +
      `Article topic: ${topic.title}\n` +
      `Editorial angle: ${topic.angle}\n` +
      `Category: ${topic.category}\n` +
      `${config.metadata.includeKeywords ? `Keywords: ${topic.keywords.join(", ")}\n` : ""}` +
      `${config.metadata.customInstruction.trim() ? `Custom metadata instruction: ${config.metadata.customInstruction.trim()}\n` : ""}\n` +
      `Limits: title <= ${config.metadata.titleMaxChars} chars, slug <= ${config.metadata.slugMaxChars} chars, excerpt <= ${config.metadata.excerptMaxChars} chars, metaTitle <= ${config.metadata.metaTitleMaxChars} chars, metaDescription <= ${config.metadata.metaDescriptionMaxChars} chars.\n` +
      `Call return_metadata exactly once with slug, title, excerpt, metaTitle, and metaDescription. After calling return_metadata, stop immediately and do not make another tool call.`,
    tools: [returnMetadataTool],
    returnToolName: "return_metadata",
    getCapturedResult: () => metadataResult,
  });
  returnMetadataCallCount = metadataOneShot.returnCallCount;

  if (returnMetadataCallCount > 1) {
    console.warn(`[WriterMetadata] return_metadata was called ${returnMetadataCallCount} times; only the first call was accepted.`);
  }

  if (!metadataResult) {
    throw new Error("[Writer] Metadata agent finished without returning metadata.");
  }

  return metadataResult;
}

/**
 * Remove excessive **bold** markers.
 *
 * The LLM sometimes bolds every keyword mention, producing **deepseek** **FP4**
 * **QAT** spam. This pass keeps at most one bold use per unique term and strips
 * all subsequent repetitions of the same bolded phrase, preserving the word
 * in plain text.
 *
 * e.g. "the **FP4** format uses **FP4** precision" → "the **FP4** format uses FP4 precision"
 */
function deduplicateBold(content: string): string {
  const seen = new Set<string>();
  return content.replace(/\*\*(.+?)\*\*/g, (_match, term: string) => {
    const key = term.toLowerCase().trim();
    if (seen.has(key)) return term; // strip bold, keep text
    seen.add(key);
    return `**${term}**`; // keep first occurrence bolded
  });
}

/**
 * Fix headings that the LLM accidentally wrapped in bold markers.
 *
 * The model sometimes outputs `**## Section Title**` or `**### Sub**`, which
 * causes renderers to show literal `**` text instead of a heading. This strips
 * bold markers from any line that starts with a Markdown heading sequence.
 *
 * e.g. "**## Key Takeaways**" → "## Key Takeaways"
 *      "**### A sub-point**"  → "### A sub-point"
 */
function fixBoldHeadings(content: string): string {
  return content
    .replace(/^\*\*(#{1,6}\s+.+?)\*\*\s*$/gm, "$1") // **## Heading**
    .replace(/^\*\*(#{1,6}\s+.+)$/gm, "$1"); // **## Heading (no closing **)
}

/**
 * Remove duplicate ## sections.
 *
 * When a continuation fires on a post that already contains Key Takeaways,
 * FAQ, and Conclusion, the LLM re-generates those sections. This keeps only
 * the FIRST occurrence of each ## heading and drops subsequent duplicates.
 */
function deduplicateSections(content: string): string {
  const blocks = content.split(/(?=\n## )/);
  const seenHeadings = new Set<string>();
  const kept: string[] = [];

  for (const block of blocks) {
    const headingMatch = block.match(/^[\n\s]*##\s+(.+)/);
    if (!headingMatch) {
      kept.push(block); // preamble — always keep
      continue;
    }
    const key = headingMatch[1].toLowerCase().trim();
    if (seenHeadings.has(key)) {
      console.log(
        `[Writer] Removed duplicate section: "## ${headingMatch[1].trim()}"`,
      );
      continue;
    }
    seenHeadings.add(key);
    kept.push(block);
  }

  return kept.join("").trim();
}

/**
 * Return which terminal sections are missing from content.
 * Used to tell the continuation call exactly what to write.
 */
function missingSections(content: string): string[] {
  const lower = content.toLowerCase();
  const missing: string[] = [];
  if (!lower.includes("## key takeaways")) missing.push("Key Takeaways");
  if (!lower.includes("## faq")) missing.push("FAQ");
  if (!lower.includes("## conclusion")) missing.push("Conclusion");
  return missing;
}

/**
 * Call 2: Write full Markdown content (no JSON wrapping — plain Markdown output).
 *
 * Style reference: Neuron Press house style — opinionated, specific, numbers-first.
 * See style guide below for full rules.
 */
async function fetchContent(
  topic: ChosenTopic,
  metadata: PostMetadata,
  existingPosts: PostLink[],
  config: WriterConfig,
  research?: ProductResearchData,
  dataviz?: DataVizResult,
): Promise<string> {
  let draftResult: PostDraft | null = null;
  let returnDraftCallCount = 0;
  const returnDraftTool = createReturnDraftTool((result) => {
    draftResult = result;
  }, { minWords: config.content.minWords });
  const formattedSources = config.context.includeSourceLinks
    ? topic.sourceUrls.map((url) => `- [${urlToLabel(url)}](${url})`).join("\n")
    : "";

  const researchBlock = research && config.context.includeResearch
    ? `\n## SPECIALIZED RESEARCH DATA:\n${JSON.stringify(research, null, 2)}\n`
    : "";

  const dataVizBlock = dataviz?.charts?.length && config.context.includeDataViz
    ? `\n## DATAVIZ CHART BLOCKS (preserve exactly if used):\n${dataviz.content}\n`
    : "";

  const internalLinksBlock =
    existingPosts.length > 0
      ? `Fallback internal links already available in runner context:\n${existingPosts
          .slice(0, config.context.existingPostsLimit)
          .map((p) => `- [${p.title}](/${p.slug})`)
          .join("\n")}`
      : "";

  const draftOneShot = await runOneShotPiAgent<PostDraft>({
    agentId: "Writer",
    systemPrompt: loadSkill("writer-affiliate"),
    prompt:
      `Write the full PassivePress affiliate article and call return_draft exactly once when complete.\n\n` +
      `Title: ${metadata.title}\n` +
      `Slug target: ${metadata.slug}\n` +
      `Excerpt target: ${metadata.excerpt}\n` +
      `Meta title target: ${metadata.metaTitle}\n` +
      `Meta description target: ${metadata.metaDescription}\n` +
      `Editorial angle: ${topic.angle}\n` +
      `Category: ${topic.category}\n` +
      `Content type: ${topic.contentType || "buyer-guide"}\n` +
      `Target products: ${(topic.targetProducts || research?.products?.map((product) => product.title) || []).join(", ")}\n` +
      `Keywords to weave in naturally (first-use bold only): ${topic.keywords.join(", ")}\n` +
      `Target length: ${config.content.targetMinWords}-${config.content.targetMaxWords} words. Body sections: ${config.content.bodySectionsMin}-${config.content.bodySectionsMax}. ` +
      `${config.content.requireKeyTakeaways ? "Include ## Key Takeaways. " : ""}` +
      `${config.content.requireFaq ? "Include ## FAQ. " : ""}` +
      `${config.content.requireConclusion ? "Include ## Conclusion. " : ""}` +
      `${config.content.customInstruction.trim() ? `Custom writing instruction: ${config.content.customInstruction.trim()} ` : ""}\n\n` +
      `${config.context.includeInternalLinks ? "Before returning the draft, call get_existing_posts once to discover natural internal links.\n\n" : ""}` +
      `${config.context.includeSourceLinks ? `Source links — hyperlink these inline within prose where relevant, do NOT list raw URLs at the end:\n${formattedSources}\n` : ""}` +
      `${researchBlock}\n` +
      `${dataVizBlock}\n` +
      `${internalLinksBlock ? `${internalLinksBlock}\n\n` : ""}` +
      `Important: do not stop with assistant text. Your task is only complete when you call return_draft. ` +
      `The content field of return_draft must contain the full final Markdown article body starting with an FTC affiliate disclosure before any product link. Use placeholders like {{PRODUCT:ASIN:Name}}, {{AFFILIATE_TABLE:ASIN,...}}, {{BUY_BUTTON:ASIN:Check Price on Amazon}}, and {{PRICE:ASIN}} for every Amazon monetized mention. ` +
      `After calling return_draft successfully, stop immediately and do not make another tool call.`,
    tools: [getExistingPostsTool, returnDraftTool],
    returnToolName: "return_draft",
    getCapturedResult: () => draftResult,
    acceptReturnToolCall: (context) => !context.isError && !!context.result.details && !(context.result.details as Record<string, unknown>).rejected,
  });
  returnDraftCallCount = draftOneShot.returnCallCount;

  if (returnDraftCallCount > 1) {
    console.warn(`[Writer] return_draft was called ${returnDraftCallCount} times after a successful capture; only the first successful call was used.`);
  }

  if (!draftResult) {
    throw new Error("[Writer] Writer agent finished without calling return_draft.");
  }

  const finalDraft = draftResult as PostDraft;
  return stripLeadingH1(finalDraft.content);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function run(
  topic: ChosenTopic,
  image: ImageResult,
  research?: ProductResearchData,
  dataviz?: DataVizResult,
): Promise<PostDraft> {
  console.log("[Writer] Writing blog post...");

  let config = DEFAULT_WRITER_CONFIG;
  try {
    config = await getWriterConfig();
    console.log("[Writer] Loaded settings from Convex");
  } catch (err) {
    console.warn("[Writer] Could not load Convex settings; using code defaults:", (err as Error).message);
  }

  // --- Call 1: Metadata + existing posts (parallel) ---
  console.log("[Writer] Fetching metadata and existing posts in parallel...");
  let metadata: PostMetadata;
  let existingPosts: PostLink[] = [];

  const [metadataResult, existingPostsResult] = await Promise.allSettled([
    fetchMetadata(topic, config),
    listPublishedPostLinks(),
  ]);

  if (metadataResult.status === "fulfilled") {
    const raw = metadataResult.value;
    metadata = {
      slug: raw.slug ?? toSlug(topic.title),
      title: raw.title ?? topic.title,
      excerpt: raw.excerpt ?? "",
      metaTitle: raw.metaTitle ?? raw.title ?? topic.title,
      metaDescription: raw.metaDescription ?? raw.excerpt ?? "",
    };
    console.log(`[Writer] Title: "${metadata.title}"`);
    console.log(`[Writer] Slug: ${metadata.slug}`);
  } else {
    console.warn(
      "[Writer] Metadata LLM failed, using fallback:",
      (metadataResult.reason as Error).message,
    );
    metadata = {
      slug: toSlug(topic.title),
      title: topic.title,
      excerpt: topic.angle.slice(0, config.metadata.excerptMaxChars),
      metaTitle: truncate(topic.title, config.metadata.metaTitleMaxChars),
      metaDescription: truncate(topic.angle, config.metadata.metaDescriptionMaxChars),
    };
  }

  if (existingPostsResult.status === "fulfilled") {
    existingPosts = existingPostsResult.value;
    console.log(`[Writer] Loaded ${existingPosts.length} existing posts for internal linking`);
  } else {
    console.warn(
      "[Writer] Could not fetch existing posts for internal links:",
      (existingPostsResult.reason as Error).message,
    );
  }

  const validSlugs = new Set(existingPosts.map((p) => p.slug));

  // --- Call 2: Content (with retry if too short) ---
  console.log("[Writer] Writing full Markdown content...");
  let content: string;
  try {
    const raw = await fetchContent(topic, metadata, existingPosts, config, research, dataviz);

    // Post-process pipeline:
    //  1. Strip any academic reference block the LLM snuck in
    //  2. Fix **## Heading** → ## Heading (bold-wrapped heading bug)
    //  3. Deduplicate bold — removes **keyword** spam on repeated mentions
    //  4. Validate internal links — remove any /post/<slug> the LLM hallucinated
    let cleanRaw = raw;
    if (config.cleanup.stripReferences) cleanRaw = stripReferencesSection(cleanRaw);
    if (config.cleanup.fixBoldHeadings) cleanRaw = fixBoldHeadings(cleanRaw);
    if (config.cleanup.deduplicateBold) cleanRaw = deduplicateBold(cleanRaw);
    if (config.cleanup.validateInternalLinks) cleanRaw = validateInternalLinks(cleanRaw, validSlugs);

    const bodyWithCharts = config.context.includeDataViz ? insertDataVizSection(cleanRaw, dataviz) : cleanRaw;
    const bodyForToc = stripRenderPlaceholders(bodyWithCharts);

    // Build ToC from headings, then assemble final content:
    //  hook paragraphs → ToC → body sections → Further Reading
    const toc = config.context.includeTableOfContents ? buildTableOfContents(bodyForToc) : "";
    const withToc = insertTocIntoContent(bodyWithCharts, toc);
    content = withToc + (config.context.includeFurtherReading ? buildFurtherReading(topic.sourceUrls, bodyWithCharts) : "");

    let wordCount = countWords(content);
    console.log(`[Writer] Content written: ${wordCount} words`);

    // Detect which terminal sections are missing before deciding to continue.
    const missing = missingSections(stripRenderPlaceholders(bodyWithCharts));
    const needsContinuation = config.continuation.enabled && (wordCount < config.content.minWords || missing.length > 0);

    if (needsContinuation) {
      const reason = [
        wordCount < config.content.minWords ? `only ${wordCount} words` : null,
        missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      console.log(`[Writer] Continuing article (${reason})...`);

      const missingSectionInstructions =
        missing.length > 0
          ? `The following sections are MISSING and must be added:\n${missing
              .map((s) => {
                if (s === "Key Takeaways")
                  return "- ## Key Takeaways (5–8 one-sentence bullets)";
                if (s === "FAQ") return "- ## FAQ (2–3 Q&A pairs)";
                if (s === "Conclusion")
                  return "- ## Conclusion (3–5 punchy sentences, no 'In conclusion')";
                return `- ## ${s}`;
              })
              .join("\n")}`
          : "Add 1–2 more analytical body sections to reach 1,100+ words total.";

      const continuationSystemPrompt = `You are a senior affiliate editor at PassivePress.
Continue the article below seamlessly. Do NOT repeat content already written. Do NOT output any intro text like "Here is the continuation" — start immediately with the next section.

${missingSectionInstructions}

Rules:
- Use ## headings (never **## bold headings**)
- Do NOT add a References or Bibliography section
- Preserve affiliate placeholder syntax when mentioning products or CTAs
- Do NOT use numbered citation markers [1], [2], [3]
- Return ONLY the continuation Markdown`;

      const continuationInstructionPrompt = `Continue this article from the exact point where it currently stops.`;
      const continuationDynamicPayload = cleanRaw;

      // Continuation runs also follow the instruction-vs-payload split so admin userPrompt
      // prefixes can steer style without obscuring the existing partial draft.
      const continuationUserPrompt = `${continuationInstructionPrompt}\n\n${continuationDynamicPayload}`;

      const continuation = await callLLM(
        [
          {
            role: "user",
            content: continuationUserPrompt,
          },
        ],
        config.continuation.maxTokens,
        "Writer: continuation",
        { systemPrompt: continuationSystemPrompt },
      );

      let continuationClean = stripLeadingH1(continuation);
      if (config.cleanup.stripReferences) continuationClean = stripReferencesSection(continuationClean);
      if (config.cleanup.fixBoldHeadings) continuationClean = fixBoldHeadings(continuationClean);
      if (config.cleanup.deduplicateBold) continuationClean = deduplicateBold(continuationClean);
      if (config.cleanup.validateInternalLinks) continuationClean = validateInternalLinks(continuationClean, validSlugs);

      // Merge, then deduplicate any sections that ended up written twice.
      const deduped = deduplicateSections(cleanRaw + "\n\n" + continuationClean);
      const tocMerged = config.context.includeTableOfContents ? buildTableOfContents(deduped) : "";
      content = insertTocIntoContent(deduped, tocMerged) + (config.context.includeFurtherReading ? buildFurtherReading(topic.sourceUrls, deduped) : "");

      wordCount = countWords(content);
      console.log(`[Writer] After continuation: ${wordCount} words`);
    }

    if (wordCount < config.content.minWords) {
      throw new Error(
        `Content still too short after retry: ${wordCount} words (minimum ${config.content.minWords})`,
      );
    }
  } catch (err) {
    throw new Error(
      `[Writer] Content generation failed: ${(err as Error).message}`,
    );
  }

  // --- Slug uniqueness check (re-use slugs already fetched via listPublishedPostLinks) ---
  const existingSlugs: string[] = existingPosts.map((p) => p.slug);
  // If the posts fetch failed, do a targeted fallback call
  let finalSlugs = existingSlugs;
  if (finalSlugs.length === 0) {
    try {
      finalSlugs = (await listExistingSlugs()) ?? [];
    } catch (e) {
      console.warn(
        "[Writer] Could not fetch existing slugs:",
        (e as Error).message,
      );
    }
  }

  const baseSlug = toSlug(metadata.slug || topic.title);
  const uniqueSlug = makeUniqueSlug(baseSlug, finalSlugs);

  if (uniqueSlug !== baseSlug) {
    console.log(
      `[Writer] Slug adjusted for uniqueness: ${baseSlug} → ${uniqueSlug}`,
    );
  }

  // --- Rename image to match final slug before upload reference is finalized ---
  const expectedImagePath = path.join(IMAGE_OUTPUT_DIR, `${uniqueSlug}.webp`);
  if (image.localPath !== expectedImagePath && fs.existsSync(image.localPath)) {
    try {
      fs.renameSync(image.localPath, expectedImagePath);
      image.localPath = expectedImagePath;
      console.log(
        `[Writer] Image renamed to: ${path.basename(expectedImagePath)}`,
      );
    } catch (renameErr) {
      console.warn(
        "[Writer] Could not rename image:",
        (renameErr as Error).message,
      );
    }
  }

  const draft: PostDraft = {
    slug: uniqueSlug,
    title: metadata.title.slice(0, config.metadata.titleMaxChars),
    excerpt: truncate(metadata.excerpt, config.metadata.excerptMaxChars),
    content,
    metaTitle: truncate(metadata.metaTitle, config.metadata.metaTitleMaxChars),
    metaDescription: truncate(metadata.metaDescription, config.metadata.metaDescriptionMaxChars),
    keywords: topic.keywords,
    readingTime: calculateReadingTime(content),
  };

  console.log(
    `[Writer] Draft ready: "${draft.slug}" (${draft.readingTime} min read)`,
  );
  return draft;
}

// ---------------------------------------------------------------------------
// Standalone runner
// ---------------------------------------------------------------------------

if (process.argv[1]?.endsWith("4-writer.ts")) {
  const mockTopic: ChosenTopic = {
    title: "The Rise of Small Language Models: Why Less Is More in 2025",
    angle:
      "Small language models are outperforming their larger counterparts on specialized tasks — we explore why efficiency is winning over scale.",
    category: "llms",
    categoryId: "placeholder",
    keywords: [
      "small language models",
      "SLM",
      "LLM efficiency",
      "AI inference",
      "edge AI",
      "o3-mini",
      "DeepSeek-V3",
      "Sora",
      "model compression",
    ],
    sourceUrls: [
      "https://huggingface.co/blog/smollm2",
      "https://techcrunch.com",
    ],
  };

  const mockImage: ImageResult = {
    localPath: "/tmp/test-image.webp",
    publicUrl: "https://example.convex.cloud/api/storage/test-image",
    storageId: "test-storage-id",
    altText: "Featured image for small language models article",
    prompt: "test prompt",
  };

  const draft = await run(mockTopic, mockImage);
  console.log("\nPost draft:");
  console.log(
    JSON.stringify(
      { ...draft, content: draft.content.slice(0, 500) + "..." },
      null,
      2,
    ),
  );
}

