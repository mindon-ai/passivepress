/**
 * Agent 2 — TopicPicker (pi Agent)
 * Selects the best topic from trending candidates using editorial judgement.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getCategoryBySlug, getTopicPickerConfig, listPublishedTitles, listRecentCategories } from "../lib/convex-client.ts";
import { isDuplicate } from "../lib/text-similarity.ts";
import { loadSkill } from "../lib/skill-loader.ts";
import {
  analyzeDuplicateSignals,
  buildChosenTopicHistoryEntry,
  detectSourceTier,
  enrichTrendTopic,
  extractTopicEntities,
  scoreChosenTopicStrategy,
  scoreTopicStrategy,
  type TopicHistoryEntry,
  type TopicStrategyScore,
} from "../lib/content-strategy.ts";
import { runOneShotPiAgent } from "../lib/pi-agent-utils.ts";
import { createReturnTopicTool, type RawTopicChoice } from "../extensions/topic-picker-tools.ts";
import type { ChosenTopic, SourceTier, TopicPickerConfig, TrendTopic } from "../types/pipeline.ts";
import { VALID_CATEGORY_SLUGS, type CategorySlug } from "../lib/categories.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, "../logs");
const VALID_CATEGORIES = [...VALID_CATEGORY_SLUGS];
const AFFILIATE_CONTENT_TYPES = ["buyer-guide", "single-review", "comparison", "top-n-list"] as const;
const RECENT_LOG_LIMIT = 12;

const DEFAULT_TOPIC_PICKER_CONFIG: TopicPickerConfig = {
  candidatePool: { maxCandidates: 10, recentLogLimit: 12, recentChosenTitlesLimit: 10, recentCategoriesLimit: 10 },
  editorialWeights: { novelty: 5, specificity: 5, audienceFit: 5, categoryDiversity: 4, sourceQuality: 3 },
  categoryRules: { enabledCategories: ["tech", "home-appliances", "fitness", "outdoors", "kitchen"], avoidLastRuns: 3, overusedCategoryThreshold: 2, allowCategoryOverride: true, defaultFallbackCategory: "tech" },
  duplicateRules: { promptSimilarityThreshold: 0.25, strategyOverrideDelta: 8, repeatedEntityStaleThreshold: 3, blockNearDuplicates: true, blockRecentChosenTitles: true, blockPublishedTitles: true },
  sourceRules: { preferOfficial: true, preferResearch: true, preferTopTier: true, allowCommunity: true, allowAggregator: true, minimumSourceTier: "aggregator" },
  keywordRules: { minKeywords: 5, maxKeywords: 10, requireLongTail: true, deduplicateKeywords: true },
  angleRules: { minSentences: 1, maxSentences: 3, headlineMaxChars: 90, fallbackAngle: "A practical buyer guide comparing current products by value, use case, and trade-offs.", banClickbait: true },
  promptControls: { customInstruction: "", includeScoringNotes: true, includeBlockedTitles: true, includeRecentCategories: true, includeDuplicateRiskLabels: true },
  fallbackRules: { enableFallback: true, overrideDuplicateChoice: true, overrideStaleChoice: true, overrideOverusedCategory: true, preferNonDuplicateFallback: true },
};

type ScoredTopic = TrendTopic & { strategy: TopicStrategyScore };

function readRecentLogField<T>(limit: number, extract: (raw: unknown) => T | null): T[] {
  try {
    if (!fs.existsSync(LOGS_DIR)) return [];
    return fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith(".json") && !f.includes("error") && !f.startsWith("meta-"))
      .map(f => ({ fullPath: path.join(LOGS_DIR, f), mtime: fs.statSync(path.join(LOGS_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map(({ fullPath }) => { try { return extract(JSON.parse(fs.readFileSync(fullPath, "utf-8"))); } catch { return null; } })
      .filter((v): v is T => v !== null);
  } catch { return []; }
}

function readRecentChosenTitles(limit = 10): string[] {
  return readRecentLogField<string>(limit, (r: any) => r?.chosen?.title ?? null);
}

function readRecentChosenHistory(limit = RECENT_LOG_LIMIT): TopicHistoryEntry[] {
  return readRecentLogField<TopicHistoryEntry>(limit, (raw: any) => {
    const chosen = raw?.chosen;
    if (!chosen?.title) return null;
    return {
      title: chosen.title,
      category: chosen.category,
      keywords: Array.isArray(chosen.keywords) ? chosen.keywords : [],
      sourceUrls: Array.isArray(chosen.sourceUrls) ? chosen.sourceUrls : [],
      entities: Array.isArray(chosen.entities) ? chosen.entities : extractTopicEntities(chosen.title, ...(chosen.keywords ?? [])),
    };
  });
}

async function getRecentCategories(limit = 5): Promise<string[]> {
  try {
    const result = await listRecentCategories(limit);
    return Array.isArray(result) ? result : [];
  } catch {
    return readRecentLogField<string>(limit, (r: any) => r?.chosen?.category ?? null);
  }
}

function mapCategory(cat: string): CategorySlug {
  const c = (cat ?? "").toLowerCase().trim();
  if (["home", "home appliances", "appliances", "home-appliances", "homeandkitchen"].includes(c)) return "home-appliances";
  if (["sports", "sportsandoutdoors", "workout", "fitness"].includes(c)) return "fitness";
  if (["outdoor", "outdoors", "camping", "hiking"].includes(c)) return "outdoors";
  if (["kitchen", "home kitchen", "homeandkitchen"].includes(c)) return "kitchen";
  if (["electronics", "computer", "computers", "tech", "gadgets"].includes(c)) return "tech";
  if (["coding", "ai-coding"].includes(c)) return "ai-coding";
  if (["research", "ai-research"].includes(c)) return "ai-research";
  if (["business", "ai-business"].includes(c)) return "ai-business";
  if (["tools", "image-ai"].includes(c)) return "image-ai";
  if (["llms", "llm"].includes(c)) return "llms";
  if (["ai", "ai-news"].includes(c)) return "ai-news";
  return "tech";
}

function getDominant(cats: string[]): { category: string | null; count: number } {
  const counts = new Map<string, number>();
  for (const c of cats) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: string | null = null, bestN = 0;
  for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n; }
  return { category: best, count: bestN };
}

function buildFallbackChoice(topic: TrendTopic, reason: string, config: TopicPickerConfig): RawTopicChoice {
  console.warn(`[TopicPicker] ${reason}: using fallback topic "${topic.title}"`);
  return {
    title: topic.title,
    angle: config.angleRules.fallbackAngle || DEFAULT_TOPIC_PICKER_CONFIG.angleRules.fallbackAngle,
    category: mapCategory(topic.suggestedCategory || config.categoryRules.defaultFallbackCategory),
    keywords: generateAffiliateKeywords(topic),
    sourceUrls: topic.sourceUrls?.length ? topic.sourceUrls : (topic.url ? [topic.url] : []),
    contentType: topic.contentType || "buyer-guide",
    targetProducts: topic.productHints || [],
    affiliateCategory: amazonCategoryFor(mapCategory(topic.suggestedCategory || topic.niche || "tech")),
  };
}

function sourceTierRank(tier?: SourceTier): number {
  switch (tier) {
    case "official": return 5;
    case "research": return 4;
    case "top-tier": return 3;
    case "community": return 2;
    default: return 1;
  }
}

function filterCandidates(candidates: TrendTopic[], config: TopicPickerConfig): TrendTopic[] {
  const minimumRank = sourceTierRank(config.sourceRules.minimumSourceTier);
  const enabledCategories = new Set(config.categoryRules.enabledCategories);
  return candidates.filter((topic) => {
    const category = mapCategory(topic.suggestedCategory || topic.niche || "tech");
    if (!enabledCategories.has(category)) return false;
    const tier = topic.sourceTier ?? detectSourceTier(topic.source, topic.url);
    if (sourceTierRank(tier) < minimumRank) return false;
    if (tier === "community" && !config.sourceRules.allowCommunity) return false;
    if (tier === "aggregator" && !config.sourceRules.allowAggregator) return false;
    return true;
  });
}

function scoreCandidates(candidates: TrendTopic[], history: TopicHistoryEntry[], recentCategories: string[]): ScoredTopic[] {
  return candidates
    .map((topic) => {
      const enriched = enrichTrendTopic(topic);
      const strategy = scoreTopicStrategy(enriched, history, recentCategories);
      const buyingIntent = topic.contentType ? 12 : 0;
      const searchVolumeScore = Math.min(25, Math.round((topic.searchVolume || 0) / 200));
      const productSpecificity = Math.min(18, (topic.productHints?.length || 0) * 4);
      return { ...enriched, strategy: { ...strategy, strategyScore: strategy.strategyScore + buyingIntent + searchVolumeScore + productSpecificity } };
    })
    .sort((a, b) => b.strategy.strategyScore - a.strategy.strategyScore);
}

function pickFallback(scoredTopics: ScoredTopic[], config: TopicPickerConfig): ScoredTopic {
  if (!config.fallbackRules.preferNonDuplicateFallback) return scoredTopics[0];
  return scoredTopics.find((topic) => !topic.strategy.duplicateSignals.isNearDuplicate) ?? scoredTopics[0];
}

function amazonCategoryFor(category: string): string {
  switch (mapCategory(category)) {
    case "home-appliances":
    case "kitchen":
      return "HomeAndKitchen";
    case "fitness":
    case "outdoors":
      return "SportsAndOutdoors";
    default:
      return "Electronics";
  }
}

function normalizeContentType(value: unknown, fallback?: string): "buyer-guide" | "single-review" | "comparison" | "top-n-list" {
  const candidate = String(value || fallback || "buyer-guide").trim();
  return (AFFILIATE_CONTENT_TYPES as readonly string[]).includes(candidate) ? candidate as any : "buyer-guide";
}

function generateAffiliateKeywords(topic: TrendTopic): string[] {
  const base = topic.title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const products = topic.productHints?.slice(0, 3).map((product) => product.toLowerCase()) || [];
  return [...new Set([
    base,
    `best ${base}`.replace(/best best /, "best "),
    `${base} review`,
    `${base} comparison`,
    `${base} buying guide`,
    ...products,
  ])].filter((keyword) => keyword.length > 3).slice(0, 10);
}

function normalizeTargetProducts(value: unknown, fallback: ScoredTopic): string[] {
  const products = Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  const combined = [...products, ...(fallback.productHints || [])];
  return [...new Set(combined)].slice(0, 8);
}

function normalizeKeywords(keywords: unknown, config: TopicPickerConfig): string[] {
  const raw = Array.isArray(keywords) ? keywords.map((keyword) => String(keyword).trim()).filter(Boolean) : [];
  const deduped = config.keywordRules.deduplicateKeywords ? [...new Set(raw.map((keyword) => keyword.toLowerCase()))] : raw;
  return deduped.slice(0, config.keywordRules.maxKeywords);
}

function normalizeRawChoice(rawChoice: Partial<RawTopicChoice>, fallback: ScoredTopic, config: TopicPickerConfig): RawTopicChoice {
  return {
    title: (rawChoice.title?.trim() || fallback.title).slice(0, config.angleRules.headlineMaxChars),
    angle: rawChoice.angle?.trim() || config.angleRules.fallbackAngle || DEFAULT_TOPIC_PICKER_CONFIG.angleRules.fallbackAngle,
    category: mapCategory(rawChoice.category || fallback.suggestedCategory || config.categoryRules.defaultFallbackCategory),
    keywords: normalizeKeywords(rawChoice.keywords, config),
    sourceUrls: Array.isArray(rawChoice.sourceUrls) && rawChoice.sourceUrls.length ? rawChoice.sourceUrls : (fallback.sourceUrls?.length ? fallback.sourceUrls : (fallback.url ? [fallback.url] : [])),
    contentType: normalizeContentType(rawChoice.contentType, fallback.contentType),
    targetProducts: normalizeTargetProducts(rawChoice.targetProducts, fallback),
    affiliateCategory: rawChoice.affiliateCategory?.trim() || amazonCategoryFor(rawChoice.category || fallback.suggestedCategory || fallback.niche || "tech"),
  };
}

export async function run(trends: TrendTopic[]): Promise<ChosenTopic> {
  console.log("[TopicPicker] Choosing topic via pi agent...");

  let config = DEFAULT_TOPIC_PICKER_CONFIG;
  try {
    config = await getTopicPickerConfig();
    console.log("[TopicPicker] Loaded settings from Convex");
  } catch (err) {
    console.warn("[TopicPicker] Could not load Convex settings; using code defaults:", (err as Error).message);
  }

  const rawCandidates = trends.slice(0, config.candidatePool.maxCandidates);
  const candidates = filterCandidates(rawCandidates, config);
  if (!candidates.length) throw new Error("[TopicPicker] No eligible trending topics provided after settings filters.");

  const [recentCategories, recentTitles, publishedTitles, recentHistory] = await Promise.all([
    getRecentCategories(config.candidatePool.recentCategoriesLimit),
    Promise.resolve(readRecentChosenTitles(config.candidatePool.recentChosenTitlesLimit)),
    config.duplicateRules.blockPublishedTitles ? listPublishedTitles().catch(() => [] as string[]) : Promise.resolve([] as string[]),
    Promise.resolve(readRecentChosenHistory(config.candidatePool.recentLogLimit)),
  ]);

  const history: TopicHistoryEntry[] = [...recentHistory, ...publishedTitles.map((title) => ({ title }))];
  const blocked = [...(config.duplicateRules.blockRecentChosenTitles ? recentTitles : []), ...publishedTitles];
  const { category: domCat, count: domCount } = getDominant(recentCategories);
  const rankedCandidates = scoreCandidates(candidates, history, recentCategories);
  const fallbackTopic = pickFallback(rankedCandidates, config);

  const candidatesText = rankedCandidates.map((t, i) => {
    const duplicateLabel = t.strategy.duplicateSignals.isNearDuplicate ? "high" : t.strategy.duplicateSignals.maxTitleSimilarity >= 0.2 ? "medium" : "low";
    const duplicateText = config.promptControls.includeDuplicateRiskLabels ? ` | Duplicate risk: ${duplicateLabel}` : "";
    return `${i + 1}. "${t.title}"\n   Source: ${t.source} | Tier: ${t.sourceTier} | Base: ${t.score} | Affiliate strategy: ${t.strategy.strategyScore}\n   Niche: ${t.niche || t.suggestedCategory} | Content type: ${t.contentType || "buyer-guide"} | Search volume≈${t.searchVolume || "unknown"}${duplicateText}\n   Product hints: ${(t.productHints || []).join(", ") || "none"}\n   URL: ${t.url}`;
  }).join("\n\n");

  const contextSections: string[] = [];
  if (config.promptControls.includeRecentCategories) {
    contextSections.push(`Recent categories (last ${config.candidatePool.recentCategoriesLimit} runs): ${recentCategories.join(", ") || "none"}\nDominant category: ${domCat ?? "none"} (${domCount}/${recentCategories.length} runs) — prefer diversity without forcing an irrelevant category`);
  }
  if (config.promptControls.includeBlockedTitles) {
    contextSections.push(`Titles to avoid (published or recently chosen, Jaccard threshold ${config.duplicateRules.promptSimilarityThreshold}):\n${blocked.slice(0, 15).map(t => `  - ${t}`).join("\n") || "  none"}`);
  }
  if (config.promptControls.includeScoringNotes) {
    contextSections.push(
      `Editorial scoring notes:\n` +
      `- Weights: novelty=${config.editorialWeights.novelty}, specificity=${config.editorialWeights.specificity}, audienceFit=${config.editorialWeights.audienceFit}, categoryDiversity=${config.editorialWeights.categoryDiversity}, sourceQuality=${config.editorialWeights.sourceQuality}\n` +
      `- Prefer official=${config.sourceRules.preferOfficial}, research=${config.sourceRules.preferResearch}, top-tier=${config.sourceRules.preferTopTier}; minimum source tier=${config.sourceRules.minimumSourceTier}\n` +
      `- Avoid near-duplicates even when the headline wording changes\n` +
      `- Penalize entities and categories covered repeatedly in recent runs`
    );
  }
  if (config.promptControls.customInstruction.trim()) contextSections.push(`Custom editorial instruction:\n${config.promptControls.customInstruction.trim()}`);
  const contextBlock = contextSections.join("\n\n");

  let rawChoice: RawTopicChoice | null = null;
  const returnTool = createReturnTopicTool((c) => { rawChoice = c; }, { once: true });
  const oneShotResult = await runOneShotPiAgent<RawTopicChoice>({
    agentId: "TopicPicker",
    systemPrompt: loadSkill("topic-picker"),
    prompt:
      `Choose the single best buyer-intent affiliate topic for today's PassivePress article.\n\n` +
      `## Candidate Topics\n${candidatesText}\n\n` +
      `## Context\n${contextBlock || "No extra context configured."}\n\n` +
      `Choose ${config.keywordRules.minKeywords}-${config.keywordRules.maxKeywords} buyer-intent SEO keywords. Also return contentType, targetProducts, and affiliateCategory for Amazon PA API lookup. ` +
      `Headline must be under ${config.angleRules.headlineMaxChars} characters. ` +
      `Angle should be ${config.angleRules.minSentences}-${config.angleRules.maxSentences} sentences. ` +
      `${config.keywordRules.requireLongTail ? "Include long-tail keyword phrases. " : ""}` +
      `${config.angleRules.banClickbait ? "Avoid clickbait. " : ""}` +
      `Call return_topic once with your final decision. After calling return_topic, stop immediately and do not make another tool call.`,
    tools: [returnTool],
    returnToolName: "return_topic",
    getCapturedResult: () => rawChoice,
  });

  if (oneShotResult.returnCallCount > 1) {
    console.warn(`[TopicPicker] return_topic was called ${oneShotResult.returnCallCount} times; only the first call was accepted.`);
  }

  if (!rawChoice) {
    if (!config.fallbackRules.enableFallback) throw new Error("[TopicPicker] Agent did not call return_topic and fallback is disabled.");
    rawChoice = buildFallbackChoice(fallbackTopic, "Agent did not call return_topic", config);
  }

  rawChoice = normalizeRawChoice(rawChoice, fallbackTopic, config);
  const rawSignals = analyzeDuplicateSignals({
    title: rawChoice.title,
    keywords: rawChoice.keywords,
    sourceUrls: rawChoice.sourceUrls,
    entities: extractTopicEntities(rawChoice.title, rawChoice.angle, ...rawChoice.keywords),
  }, history);

  const duplicateChoice = isDuplicate(rawChoice.title, blocked) || (config.duplicateRules.blockNearDuplicates && rawSignals.isNearDuplicate);
  if (duplicateChoice && config.fallbackRules.overrideDuplicateChoice) {
    if (!config.fallbackRules.enableFallback) throw new Error(`[TopicPicker] Duplicate detected for "${rawChoice.title}" and fallback is disabled.`);
    rawChoice = buildFallbackChoice(fallbackTopic, `Duplicate detected for "${rawChoice.title}"`, config);
  }

  rawChoice = normalizeRawChoice(rawChoice, fallbackTopic, config);
  let category: CategorySlug = mapCategory(rawChoice.category);
  if (!VALID_CATEGORIES.includes(category)) category = mapCategory(fallbackTopic.suggestedCategory);

  const chosenSignals = scoreChosenTopicStrategy({
    title: rawChoice.title,
    category,
    keywords: rawChoice.keywords,
    sourceUrls: rawChoice.sourceUrls,
    sourceTier: detectSourceTier(undefined, rawChoice.sourceUrls[0]),
    entities: extractTopicEntities(rawChoice.title, rawChoice.angle, ...rawChoice.keywords),
  }, history, recentCategories);

  const fallbackDelta = fallbackTopic.strategy.strategyScore - chosenSignals.strategyScore;
  const overusedCategory = recentCategories.filter((c) => c === category).length >= config.categoryRules.overusedCategoryThreshold;
  const staleChoice = chosenSignals.duplicateSignals.repeatedEntityMentions >= config.duplicateRules.repeatedEntityStaleThreshold;
  const shouldOverrideForStrategy =
    (overusedCategory && config.fallbackRules.overrideOverusedCategory) ||
    (staleChoice && config.fallbackRules.overrideStaleChoice) ||
    (chosenSignals.duplicateSignals.isNearDuplicate && config.fallbackRules.overrideDuplicateChoice);

  if (config.categoryRules.allowCategoryOverride && shouldOverrideForStrategy && fallbackDelta >= config.duplicateRules.strategyOverrideDelta) {
    console.warn(`[TopicPicker] Strategy override: switching from "${rawChoice.title}" to fallback "${fallbackTopic.title}" (delta ${fallbackDelta}, category=${category}, duplicate=${chosenSignals.duplicateSignals.isNearDuplicate})`);
    if (!config.fallbackRules.enableFallback) throw new Error("[TopicPicker] Strategy override required but fallback is disabled.");
    rawChoice = buildFallbackChoice(fallbackTopic, "Freshness/duplicate strategy override", config);
  }

  rawChoice = normalizeRawChoice(rawChoice, fallbackTopic, config);
  category = mapCategory(rawChoice.category);
  if (!VALID_CATEGORIES.includes(category)) category = mapCategory(fallbackTopic.suggestedCategory);

  if (config.categoryRules.allowCategoryOverride && config.fallbackRules.overrideOverusedCategory && recentCategories.filter((c) => c === category).length >= config.categoryRules.overusedCategoryThreshold && fallbackTopic.title !== rawChoice.title) {
    console.warn(`[TopicPicker] Rotation: replacing overused category "${category}" with fallback topic in "${fallbackTopic.suggestedCategory}"`);
    if (!config.fallbackRules.enableFallback) throw new Error("[TopicPicker] Category rotation required but fallback is disabled.");
    rawChoice = buildFallbackChoice(fallbackTopic, "Recent category overuse", config);
  }

  rawChoice = normalizeRawChoice(rawChoice, fallbackTopic, config);
  category = mapCategory(rawChoice.category);
  if (!VALID_CATEGORIES.includes(category)) category = mapCategory(fallbackTopic.suggestedCategory);

  const finalSourceTier = detectSourceTier(undefined, rawChoice.sourceUrls[0]);
  const finalEntities = extractTopicEntities(rawChoice.title, rawChoice.angle, ...rawChoice.keywords);

  let categoryId = "";
  try {
    const cat = await getCategoryBySlug(category);
    categoryId = cat?.id ?? "";
    if (!categoryId) {
      const fallbackCategory = mapCategory(config.categoryRules.defaultFallbackCategory);
      const fallback = await getCategoryBySlug(fallbackCategory);
      categoryId = fallback?.id ?? "";
      category = fallbackCategory;
    }
  } catch (err) {
    console.warn("[TopicPicker] Convex category lookup failed:", (err as Error).message);
  }

  const chosen: ChosenTopic = {
    title: rawChoice.title.trim(),
    angle: rawChoice.angle,
    category,
    categoryId,
    keywords: normalizeKeywords(rawChoice.keywords, config),
    sourceUrls: Array.isArray(rawChoice.sourceUrls) ? rawChoice.sourceUrls : (fallbackTopic.sourceUrls?.length ? fallbackTopic.sourceUrls : (fallbackTopic.url ? [fallbackTopic.url] : [])),
    sourceTier: finalSourceTier,
    entities: finalEntities,
    contentType: normalizeContentType(rawChoice.contentType, fallbackTopic.contentType),
    targetProducts: normalizeTargetProducts(rawChoice.targetProducts, fallbackTopic),
    affiliateCategory: rawChoice.affiliateCategory || amazonCategoryFor(category),
  };

  const finalStrategy = scoreChosenTopicStrategy(chosen, history, recentCategories);
  const historyEntry = buildChosenTopicHistoryEntry(chosen);
  console.log(`[TopicPicker] ✓ "${chosen.title}" [${chosen.category}] (tier=${chosen.sourceTier}, strategy=${finalStrategy.strategyScore}, entities=${historyEntry.entities?.slice(0, 4).join(", ") || "none"})`);
  return chosen;
}

if (process.argv[1]?.endsWith("2-topic-picker.ts")) {
  const { run: trendRun } = await import("./1-trend-scout.ts");
  const trends = await trendRun();
  const chosen = await run(trends);
  console.log("\nChosen topic:");
  console.log(JSON.stringify(chosen, null, 2));
}
