import type { ChosenTopic, SourceTier, TrendTopic } from "../types/pipeline.ts";
import { jaccardSimilarity, normalizeWords } from "./text-similarity.ts";

const OFFICIAL_HOSTS = [
  "openai.com",
  "anthropic.com",
  "deepmind.google",
  "blog.google",
  "ai.google.dev",
  "googleblog.com",
  "meta.com",
  "ai.meta.com",
  "about.fb.com",
  "microsoft.com",
  "blogs.microsoft.com",
  "x.ai",
  "cohere.com",
  "mistral.ai",
  "huggingface.co",
  "stability.ai",
  "runwayml.com",
  "midjourney.com",
  "github.blog",
];

const RESEARCH_HOSTS = [
  "arxiv.org",
  "export.arxiv.org",
  "paperswithcode.com",
  "huggingface.co",
  "github.com",
  "aclanthology.org",
  "openreview.net",
];

const TOP_TIER_HOSTS = [
  "techcrunch.com",
  "theverge.com",
  "wired.com",
  "arstechnica.com",
  "venturebeat.com",
  "semafor.com",
  "mittechnologyreview.com",
  "bloomberg.com",
  "cnbc.com",
  "reuters.com",
  "ft.com",
];

const COMMUNITY_HOSTS = [
  "news.ycombinator.com",
  "reddit.com",
  "lobste.rs",
  "substack.com",
  "medium.com",
];

const ENTITY_ALLOWLIST = new Set([
  "openai",
  "anthropic",
  "deepseek",
  "gemini",
  "llama",
  "qwen",
  "mistral",
  "gpt",
  "gpt-4",
  "gpt-5",
  "claude",
  "copilot",
  "cursor",
  "windsurf",
  "codex",
  "openrouter",
  "vllm",
  "ollama",
  "huggingface",
  "arxiv",
  "sora",
  "midjourney",
  "runway",
  "stability",
  "meta",
  "google",
  "microsoft",
  "xai",
  "grok",
  "phi",
  "falcon",
  "cohere",
  "nvidia",
  "blackwell",
  "h100",
  "b200",
  "fp4",
  "rag",
  "benchmark",
  "reasoning",
  "agents",
]);

const STOPWORDS = new Set([
  "about",
  "after",
  "against",
  "also",
  "amid",
  "and",
  "announces",
  "another",
  "because",
  "before",
  "behind",
  "being",
  "builds",
  "could",
  "from",
  "have",
  "into",
  "launches",
  "model",
  "models",
  "new",
  "over",
  "that",
  "their",
  "these",
  "this",
  "under",
  "using",
  "what",
  "when",
  "with",
]);

export interface TopicHistoryEntry {
  title: string;
  category?: string;
  keywords?: string[];
  sourceUrls?: string[];
  entities?: string[];
}

export interface DuplicateSignals {
  exactUrlOverlap: boolean;
  sharedSourceHostCount: number;
  maxTitleSimilarity: number;
  maxKeywordSimilarity: number;
  maxSharedEntities: number;
  repeatedEntityMentions: number;
  isNearDuplicate: boolean;
}

export interface TopicStrategyScore {
  strategyScore: number;
  sourceTierBonus: number;
  diversityBonus: number;
  categoryPenalty: number;
  entityPenalty: number;
  duplicatePenalty: number;
  freshnessScore: number;
  duplicateSignals: DuplicateSignals;
}

function matchesHost(host: string, candidates: string[]): boolean {
  return candidates.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

export function getSourceHost(inputUrl?: string): string | undefined {
  if (!inputUrl) return undefined;
  try {
    return new URL(inputUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

export function normalizeUrl(inputUrl?: string): string | undefined {
  if (!inputUrl) return undefined;
  try {
    const url = new URL(inputUrl);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function detectSourceTier(source?: string, inputUrl?: string): SourceTier {
  const host = getSourceHost(inputUrl) ?? source?.toLowerCase().replace(/^www\./, "") ?? "";
  const sourceLower = source?.toLowerCase() ?? "";

  if (matchesHost(host, OFFICIAL_HOSTS)) return "official";
  if (matchesHost(host, RESEARCH_HOSTS) || /arxiv|paper|research/.test(sourceLower)) return "research";
  if (matchesHost(host, TOP_TIER_HOSTS)) return "top-tier";
  if (matchesHost(host, COMMUNITY_HOSTS) || /reddit|hacker news|community/.test(sourceLower)) return "community";
  return "aggregator";
}

export function sourceTierBonus(tier: SourceTier): number {
  switch (tier) {
    case "official":
      return 20;
    case "research":
      return 16;
    case "top-tier":
      return 10;
    case "community":
      return -8;
    default:
      return -12;
  }
}

export function extractTopicEntities(...inputs: Array<string | undefined>): string[] {
  const values = inputs.filter(Boolean).join(" ");
  const words = Array.from(normalizeWords(values, 2));
  const rawTokens = values.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [];
  const combined = new Set<string>();

  for (const token of [...words, ...rawTokens.map((t) => t.toLowerCase())]) {
    const normalized = token.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!normalized || STOPWORDS.has(normalized)) continue;
    if (ENTITY_ALLOWLIST.has(normalized) || /\d/.test(normalized) || normalized.length >= 5) {
      combined.add(normalized);
    }
  }

  return [...combined].slice(0, 12);
}

export function normalizeKeywords(keywords?: string[]): string[] {
  return [...new Set((keywords ?? []).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))];
}

function keywordSimilarity(a: string[], b: string[]): number {
  const aSet = new Set(normalizeKeywords(a));
  const bSet = new Set(normalizeKeywords(b));
  const intersection = [...aSet].filter((value) => bSet.has(value)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return intersection / Math.max(union, 1);
}

function sharedEntityCount(a: string[], b: string[]): number {
  const bSet = new Set(b);
  return a.filter((entity) => bSet.has(entity)).length;
}

export function enrichTrendTopic(topic: TrendTopic): TrendTopic {
  return {
    ...topic,
    sourceTier: topic.sourceTier ?? detectSourceTier(topic.source, topic.url),
    sourceHost: topic.sourceHost ?? getSourceHost(topic.url),
    entities: topic.entities?.length ? topic.entities : extractTopicEntities(topic.title, topic.source),
  };
}

export function buildChosenTopicHistoryEntry(topic: ChosenTopic): TopicHistoryEntry {
  return {
    title: topic.title,
    category: topic.category,
    keywords: topic.keywords,
    sourceUrls: topic.sourceUrls,
    entities: topic.entities?.length ? topic.entities : extractTopicEntities(topic.title, ...(topic.keywords ?? [])),
  };
}

export function analyzeDuplicateSignals(
  candidate: Pick<TopicHistoryEntry, "title" | "keywords" | "sourceUrls" | "entities">,
  history: TopicHistoryEntry[]
): DuplicateSignals {
  const candidateEntities = candidate.entities?.length
    ? candidate.entities
    : extractTopicEntities(candidate.title, ...(candidate.keywords ?? []));
  const candidateUrls = (candidate.sourceUrls ?? []).map((url) => normalizeUrl(url)).filter((url): url is string => Boolean(url));
  const candidateHosts = new Set((candidate.sourceUrls ?? []).map((url) => getSourceHost(url)).filter((host): host is string => Boolean(host)));

  let exactUrlOverlap = false;
  let sharedSourceHostCount = 0;
  let maxTitleSimilarity = 0;
  let maxKeywordSimilarity = 0;
  let maxSharedEntities = 0;
  let repeatedEntityMentions = 0;

  for (const entry of history) {
    maxTitleSimilarity = Math.max(maxTitleSimilarity, jaccardSimilarity(candidate.title, entry.title, 2));
    maxKeywordSimilarity = Math.max(maxKeywordSimilarity, keywordSimilarity(candidate.keywords ?? [], entry.keywords ?? []));

    const entryEntities = entry.entities?.length
      ? entry.entities
      : extractTopicEntities(entry.title, ...(entry.keywords ?? []));
    const sharedEntities = sharedEntityCount(candidateEntities, entryEntities);
    maxSharedEntities = Math.max(maxSharedEntities, sharedEntities);
    if (sharedEntities > 0) repeatedEntityMentions += 1;

    const entryUrls = (entry.sourceUrls ?? []).map((url) => normalizeUrl(url)).filter((url): url is string => Boolean(url));
    if (!exactUrlOverlap && candidateUrls.some((url) => entryUrls.includes(url))) {
      exactUrlOverlap = true;
    }

    const entryHosts = new Set((entry.sourceUrls ?? []).map((url) => getSourceHost(url)).filter((host): host is string => Boolean(host)));
    if ([...candidateHosts].some((host) => entryHosts.has(host))) {
      sharedSourceHostCount += 1;
    }
  }

  const isNearDuplicate =
    exactUrlOverlap ||
    maxTitleSimilarity >= 0.35 ||
    maxKeywordSimilarity >= 0.6 ||
    (maxSharedEntities >= 2 && (maxTitleSimilarity >= 0.18 || sharedSourceHostCount > 0));

  return {
    exactUrlOverlap,
    sharedSourceHostCount,
    maxTitleSimilarity,
    maxKeywordSimilarity,
    maxSharedEntities,
    repeatedEntityMentions,
    isNearDuplicate,
  };
}

export function scoreTopicStrategy(
  topic: Pick<TrendTopic, "title" | "score" | "suggestedCategory" | "source" | "url" | "sourceTier" | "sourceHost" | "entities">,
  history: TopicHistoryEntry[],
  recentCategories: string[]
): TopicStrategyScore {
  const enriched = enrichTrendTopic(topic as TrendTopic);
  const sourceTier = enriched.sourceTier ?? "aggregator";
  const sourceTierPts = sourceTierBonus(sourceTier);
  const duplicateSignals = analyzeDuplicateSignals(
    {
      title: enriched.title,
      sourceUrls: enriched.url ? [enriched.url] : [],
      entities: enriched.entities,
    },
    history,
  );

  const recentCategoryCount = recentCategories.filter((value) => value === enriched.suggestedCategory).length;
  const categoryPenalty = recentCategoryCount * 5;
  const diversityBonus = recentCategoryCount === 0 ? 8 : recentCategoryCount === 1 ? 3 : 0;
  const entityPenalty = Math.min(duplicateSignals.repeatedEntityMentions * 4, 16);

  let duplicatePenalty = 0;
  if (duplicateSignals.isNearDuplicate) {
    duplicatePenalty += 30;
  }
  duplicatePenalty += Math.round(duplicateSignals.maxTitleSimilarity * 12);
  duplicatePenalty += duplicateSignals.maxSharedEntities * 3;
  duplicatePenalty += Math.round(duplicateSignals.maxKeywordSimilarity * 10);
  duplicatePenalty += duplicateSignals.sharedSourceHostCount * 2;

  const freshnessScore = diversityBonus - categoryPenalty - entityPenalty;
  const strategyScore = enriched.score + sourceTierPts + freshnessScore - duplicatePenalty;

  return {
    strategyScore,
    sourceTierBonus: sourceTierPts,
    diversityBonus,
    categoryPenalty,
    entityPenalty,
    duplicatePenalty,
    freshnessScore,
    duplicateSignals,
  };
}

export function scoreChosenTopicStrategy(
  topic: Pick<ChosenTopic, "title" | "category" | "keywords" | "sourceUrls" | "sourceTier" | "entities">,
  history: TopicHistoryEntry[],
  recentCategories: string[]
): TopicStrategyScore {
  const sourceTier = topic.sourceTier ?? detectSourceTier(undefined, topic.sourceUrls?.[0]);
  const duplicateSignals = analyzeDuplicateSignals(topic, history);
  const recentCategoryCount = recentCategories.filter((value) => value === topic.category).length;
  const categoryPenalty = recentCategoryCount * 5;
  const diversityBonus = recentCategoryCount === 0 ? 8 : recentCategoryCount === 1 ? 3 : 0;
  const entityPenalty = Math.min(duplicateSignals.repeatedEntityMentions * 4, 16);

  let duplicatePenalty = 0;
  if (duplicateSignals.isNearDuplicate) duplicatePenalty += 35;
  duplicatePenalty += Math.round(duplicateSignals.maxTitleSimilarity * 12);
  duplicatePenalty += duplicateSignals.maxSharedEntities * 3;
  duplicatePenalty += Math.round(duplicateSignals.maxKeywordSimilarity * 10);
  duplicatePenalty += duplicateSignals.sharedSourceHostCount * 2;

  const freshnessScore = diversityBonus - categoryPenalty - entityPenalty;
  const strategyScore = sourceTierBonus(sourceTier) + freshnessScore - duplicatePenalty;

  return {
    strategyScore,
    sourceTierBonus: sourceTierBonus(sourceTier),
    diversityBonus,
    categoryPenalty,
    entityPenalty,
    duplicatePenalty,
    freshnessScore,
    duplicateSignals,
  };
}
