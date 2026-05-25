import "dotenv/config";
import { searchGoogle, fetchSubreddit } from "../lib/search-client.ts";
import { getTrendScoutConfig, listPublishedTitles } from "../lib/convex-client.ts";
import { jaccardSimilarity } from "../lib/text-similarity.ts";
import { detectSourceTier } from "../lib/content-strategy.ts";
import type { AffiliateContentType, TrendScoutConfig, TrendTopic } from "../types/pipeline.ts";

const DEFAULT_NICHES = (process.env.AFFILIATE_NICHES || "tech,home-appliances,fitness")
  .split(",")
  .map((niche) => niche.trim())
  .filter(Boolean);

const REDDIT_BUYING_SUBREDDITS = ["BuyItForLife", "frugalmalefashion", "homeimprovement", "gadgets", "buildapcsales", "VacuumCleaners"];

const DEFAULT_TREND_SCOUT_CONFIG: TrendScoutConfig = {
  niches: DEFAULT_NICHES,
  minSearchVolume: 0,
  sources: { serper: true, hackerNews: false, reddit: true, arxiv: false, fallback: true },
  serper: {
    queries: [
      "best laptop to buy 2026",
      "best robot vacuum under 300",
      "best headphones 2026 review",
      "best air purifier for home",
      "best fitness tracker 2026",
      "best standing desk under 500",
    ],
    resultsPerQuery: 8,
    recency: "qdr:m",
  },
  hackerNews: { query: "", hoursBack: 48, minPoints: 5, resultsPerPage: 20 },
  reddit: { subreddits: REDDIT_BUYING_SUBREDDITS, timeframe: "week", limitPerSubreddit: 8 },
  arxiv: { category: "", maxPapers: 0 },
  scoring: {
    majorModelBonus: 0,
    launchWordBonus: 20,
    freshnessBonus: 10,
    duplicatePenalty: 35,
    existingTitleSimilarityThreshold: 0.3,
    discoveredTopicDedupeThreshold: 0.35,
  },
  output: { maxTopics: 15, fallbackTopics: 5 },
};

const NICHE_KEYWORDS: Record<string, string[]> = {
  tech: ["laptop", "laptops", "monitor", "monitors", "keyboard", "keyboards", "mouse", "mice", "headphone", "headphones", "earbud", "earbuds", "charger", "chargers", "tablet", "tablets", "router", "routers", "ssd", "phone", "phones", "camera", "cameras", "gpu", "graphics card"],
  "home-appliances": ["vacuum", "vacuums", "robot vacuum", "robot vacuums", "air purifier", "air purifiers", "coffee maker", "coffee makers", "espresso", "dishwasher", "dishwashers", "humidifier", "humidifiers", "dehumidifier", "dehumidifiers", "mattress", "mattresses", "standing desk", "standing desks", "fridge", "refrigerator"],
  fitness: ["treadmill", "treadmills", "exercise bike", "exercise bikes", "adjustable dumbbell", "adjustable dumbbells", "fitness tracker", "fitness trackers", "running shoe", "running shoes", "rower", "rowers", "yoga mat", "protein powder"],
  outdoors: ["tent", "tents", "cooler", "coolers", "backpack", "backpacks", "hiking boot", "hiking boots", "camping stove", "camping stoves", "sleeping bag", "sleeping bags"],
  kitchen: ["air fryer", "air fryers", "blender", "blenders", "knife set", "cookware", "stand mixer", "stand mixers", "rice cooker", "rice cookers"],
};

const BUYING_INTENT_PATTERNS = [
  /\bbest\b/i,
  /\btop\b/i,
  /\breview\b/i,
  /\bvs\b/i,
  /\bcompare|comparison\b/i,
  /\bunder\s*\$?\d+/i,
  /\bto buy\b/i,
  /\bworth it\b/i,
  /\bdeals?\b/i,
];

const PRODUCT_STOPWORDS = new Set([
  "best", "top", "review", "reviews", "under", "for", "with", "without", "the", "and", "or", "buy", "buying", "guide", "deal", "deals", "amazon", "2025", "2026", "reddit", "vs", "comparison",
  "what", "which", "where", "when", "why", "how", "is", "are", "was", "were", "good", "right", "now", "worth", "suggest", "recommend", "recommendation", "people", "actually", "these", "days",
]);

const GENERIC_PRODUCT_HINTS: Record<string, string[]> = {
  tech: ["laptop", "monitor", "noise-canceling headphones", "USB-C charger", "wireless keyboard"],
  "home-appliances": ["robot vacuum", "air purifier", "standing desk", "humidifier", "coffee maker"],
  fitness: ["fitness tracker", "adjustable dumbbells", "treadmill", "exercise bike", "running shoes"],
  outdoors: ["camping tent", "hiking backpack", "cooler", "camping stove", "sleeping bag"],
  kitchen: ["air fryer", "blender", "knife set", "cookware set", "rice cooker"],
};

function isLegacyAiTrendConfig(config: TrendScoutConfig): boolean {
  const queryText = [
    ...config.serper.queries,
    config.hackerNews.query,
    config.arxiv.category,
    ...config.reddit.subreddits,
  ].join(" ").toLowerCase();
  return /\b(ai|llm|machinelearning|localllama|arxiv|cs\.ai|artificial)\b/.test(queryText)
    && !/robot vacuum|headphones|air purifier|fitness tracker|standing desk|laptop to buy/.test(queryText);
}

function normalizeTrendScoutConfig(config: TrendScoutConfig): TrendScoutConfig {
  if (!isLegacyAiTrendConfig(config)) return config;
  console.warn("[TrendScout] Detected legacy NeuronPress AI settings in Convex; using PassivePress affiliate defaults for this run.");
  return DEFAULT_TREND_SCOUT_CONFIG;
}

function getEnabledNiches(config: TrendScoutConfig): string[] {
  const custom = config.niches;
  return Array.isArray(custom) && custom.length ? custom : DEFAULT_NICHES;
}

function keywordRegex(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function guessNiche(text: string, enabledNiches = DEFAULT_NICHES): string {
  const fallback = enabledNiches.includes(process.env.AFFILIATE_DEFAULT_NICHE || "")
    ? process.env.AFFILIATE_DEFAULT_NICHE!
    : enabledNiches[0] || "tech";
  let best = fallback;
  let bestScore = 0;
  for (const niche of enabledNiches) {
    const keywords = NICHE_KEYWORDS[niche] || [];
    const score = keywords.reduce((total, keyword) => {
      if (!keywordRegex(keyword).test(text)) return total;
      return total + (keyword.includes(" ") ? 3 : 1);
    }, 0);
    if (score > bestScore) {
      best = niche;
      bestScore = score;
    }
  }
  return best;
}

function inferContentType(title: string): AffiliateContentType {
  const lower = title.toLowerCase();
  if (/\bvs\b|versus|comparison|compare/.test(lower)) return "comparison";
  if (/\breview\b|worth it/.test(lower) && !/\bbest\b/.test(lower)) return "single-review";
  if (/\btop\s*\d+|\b\d+\s+best/.test(lower)) return "top-n-list";
  return "buyer-guide";
}

function buyingIntentScore(text: string): number {
  return BUYING_INTENT_PATTERNS.reduce((score, pattern) => score + (pattern.test(text) ? 12 : 0), 0);
}

function estimateSearchVolume(title: string): number {
  const lower = title.toLowerCase();
  let estimate = 500;
  if (/\bbest\b/.test(lower)) estimate += 1800;
  if (/\breview\b/.test(lower)) estimate += 900;
  if (/\bunder\s*\$?\d+/.test(lower)) estimate += 700;
  if (/\b2026\b|\b2025\b/.test(lower)) estimate += 400;
  if (/laptop|headphones|vacuum|air fryer|mattress|monitor|phone/.test(lower)) estimate += 1200;
  return estimate;
}

function cleanTopicTitle(title: string): string {
  return title
    .replace(/\s*[|-]\s*(Reddit|YouTube|The Verge|PCMag|Wirecutter|BTOD\.com|Raleigh News & Observer)\s*$/i, "")
    .replace(/^\s*(what|which)\s+is\s+the\s+/i, "Best ")
    .replace(/\s+people\s+actually\s+recommend\s+these\s+days\??$/i, "")
    .replace(/\s+right\s+now\??$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseProductHint(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => PRODUCT_STOPWORDS.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
}

function extractProductHints(title: string, snippet = "", niche = "tech"): string[] {
  const cleanedTitle = cleanTopicTitle(title);
  const text = `${cleanedTitle} ${snippet}`;
  const quoted = [...text.matchAll(/[“"]([^”"]{3,60})[”"]/g)].map((match) => match[1]);
  const capitalized = [...text.matchAll(/\b([A-Z][A-Za-z0-9+.-]*(?:\s+[A-Z][A-Za-z0-9+.-]*){0,4})\b/g)]
    .map((match) => match[1])
    .filter((value) => {
      const words = value.toLowerCase().split(/\s+/).filter(Boolean);
      return value.length > 2 && words.some((word) => !PRODUCT_STOPWORDS.has(word)) && !/^(reddit|youtube|wirecutter|pcmag)$/i.test(value);
    });
  const nounPhrase = cleanedTitle
    .replace(/\b(best|top|review|reviews|under|for|to buy|in 2025|in 2026|2025|2026|may)\b/gi, " ")
    .replace(/\$?\d+[a-z]?/gi, " ")
    .replace(/[^a-zA-Z0-9+ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hints = [...new Set([...quoted, ...capitalized, nounPhrase]
    .map((value) => titleCaseProductHint(value.trim()))
    .filter((value) => {
      const words = value.toLowerCase().split(/\s+/).filter(Boolean);
      return value.length >= 3 && words.some((word) => !PRODUCT_STOPWORDS.has(word));
    }))]
    .slice(0, 8);
  return hints.length ? hints : (GENERIC_PRODUCT_HINTS[niche] || GENERIC_PRODUCT_HINTS.tech);
}

function scoreAffiliateTopic(title: string, snippet: string, points: number, maxPoints: number, existingTitles: string[], config: TrendScoutConfig): number {
  let score = Math.round((points / Math.max(maxPoints, 1)) * 25);
  const combined = `${title} ${snippet}`;
  score += buyingIntentScore(combined);
  score += Math.min(25, Math.round(estimateSearchVolume(title) / 150));
  if (/\b2026\b|\b2025\b|new|latest|updated/i.test(combined)) score += config.scoring.freshnessBonus;
  for (const existing of existingTitles) {
    if (jaccardSimilarity(title, existing, 4) >= config.scoring.existingTitleSimilarityThreshold) {
      score -= config.scoring.duplicatePenalty;
      break;
    }
  }
  return Math.max(0, Math.min(100, score));
}

function toTrendTopic(args: {
  title: string;
  source: string;
  url: string;
  snippet?: string;
  score: number;
  enabledNiches: string[];
}): TrendTopic {
  const rawTitle = args.title;
  const title = cleanTopicTitle(rawTitle) || rawTitle;
  const text = `${title} ${args.snippet || ""}`;
  const niche = guessNiche(text, args.enabledNiches);
  return {
    title,
    source: args.source,
    url: args.url,
    score: args.score,
    suggestedCategory: niche,
    sourceTier: detectSourceTier(args.source, args.url),
    niche,
    contentType: inferContentType(title),
    productHints: extractProductHints(title, args.snippet, niche),
    searchVolume: estimateSearchVolume(title),
    sourceUrls: args.url ? [args.url] : [],
  };
}

function deduplicateTopics(topics: TrendTopic[], threshold: number): TrendTopic[] {
  const kept: TrendTopic[] = [];
  for (const topic of topics.sort((a, b) => b.score - a.score)) {
    if (!kept.some((existing) => jaccardSimilarity(topic.title, existing.title, 3) >= threshold)) kept.push(topic);
  }
  return kept;
}

function fallbackTopics(enabledNiches: string[], existingTitles: string[], config: TrendScoutConfig): TrendTopic[] {
  const seeds = [
    "Best USB-C Chargers for Travel in 2026",
    "Best Robot Vacuums Under $300 in 2026",
    "Best Noise-Canceling Headphones for Work in 2026",
    "Best Air Purifiers for Bedrooms in 2026",
    "Best Fitness Trackers for Battery Life in 2026",
    "Best Standing Desks Under $500 in 2026",
    "Best Air Fryers for Small Kitchens in 2026",
  ];
  return seeds
    .filter((title) => !existingTitles.some((existing) => jaccardSimilarity(title, existing, 4) >= config.scoring.existingTitleSimilarityThreshold))
    .map((title) => toTrendTopic({ title, source: "PassivePress Evergreen", url: "", score: 72, enabledNiches }))
    .filter((topic) => enabledNiches.includes(topic.niche || topic.suggestedCategory));
}

export async function run(): Promise<TrendTopic[]> {
  console.log("[TrendScout] Starting affiliate product trend discovery...");
  let config = DEFAULT_TREND_SCOUT_CONFIG;
  try {
    config = normalizeTrendScoutConfig(await getTrendScoutConfig());
    console.log("[TrendScout] Loaded settings from Convex");
  } catch (err) {
    console.warn("[TrendScout] Could not load Convex settings; using affiliate defaults:", (err as Error).message);
  }

  const enabledNiches = getEnabledNiches(config);
  const customQueries = config.serperQueries;
  const redditSubreddits = config.redditSubreddits || config.reddit.subreddits;
  const minSearchVolume = config.minSearchVolume ?? 0;

  let existingTitles: string[] = [];
  try {
    existingTitles = await listPublishedTitles();
    console.log(`[TrendScout] Loaded ${existingTitles.length} existing post titles`);
  } catch (err) {
    console.warn("[TrendScout] Could not load existing titles:", (err as Error).message);
  }

  const topics: TrendTopic[] = [];
  const queries = customQueries?.length ? customQueries : config.serper.queries;

  if (config.sources.serper) {
    try {
      const resultsByQuery = await Promise.all(
        queries.map((query) => searchGoogle(query, { num: config.serper.resultsPerQuery, tbs: config.serper.recency }).catch((err) => {
          console.warn(`[TrendScout] Serper query failed (${query}):`, (err as Error).message);
          return [];
        })),
      );
      const seen = new Set<string>();
      for (const results of resultsByQuery) {
        for (const result of results) {
          if (seen.has(result.link)) continue;
          seen.add(result.link);
          const score = scoreAffiliateTopic(result.title, result.snippet, 70, 100, existingTitles, config);
          topics.push(toTrendTopic({
            title: result.title,
            source: new URL(result.link).hostname.replace(/^www\./, ""),
            url: result.link,
            snippet: result.snippet,
            score,
            enabledNiches,
          }));
        }
      }
      console.log(`[TrendScout] Serper: ${seen.size} result(s)`);
    } catch (err) {
      console.warn("[TrendScout] Serper discovery failed:", (err as Error).message);
    }
  }

  if (config.sources.reddit) {
    for (const subreddit of redditSubreddits) {
      try {
        const posts = await fetchSubreddit(subreddit, config.reddit.timeframe, config.reddit.limitPerSubreddit);
        const maxPoints = Math.max(...posts.map((post) => post.score), 1);
        for (const post of posts) {
          const score = scoreAffiliateTopic(post.title, "", post.score, maxPoints, existingTitles, config);
          if (buyingIntentScore(post.title) < 12 && score < 40) continue;
          topics.push(toTrendTopic({
            title: post.title,
            source: `Reddit r/${post.subreddit}`,
            url: post.url,
            score,
            enabledNiches,
          }));
        }
        console.log(`[TrendScout] r/${subreddit}: ${posts.length} post(s)`);
      } catch (err) {
        console.warn(`[TrendScout] Reddit r/${subreddit} failed:`, (err as Error).message);
      }
    }
  }

  const ranked = deduplicateTopics(topics, config.scoring.discoveredTopicDedupeThreshold)
    .filter((topic) => enabledNiches.includes(topic.niche || topic.suggestedCategory))
    .filter((topic) => (topic.searchVolume || 0) >= minSearchVolume)
    .slice(0, config.output.maxTopics);

  if (!ranked.length && config.sources.fallback) {
    const fallback = fallbackTopics(enabledNiches, existingTitles, config).slice(0, config.output.fallbackTopics);
    console.warn(`[TrendScout] No live affiliate topics. Injecting ${fallback.length} fallback topic(s).`);
    return fallback;
  }

  console.log(`[TrendScout] Done. ${ranked.length} affiliate product topic(s) found.`);
  ranked.slice(0, 5).forEach((topic, index) => {
    console.log(`  ${index + 1}. [${topic.score}] ${topic.title} (${topic.niche}, ${topic.contentType}, vol≈${topic.searchVolume})`);
  });
  return ranked;
}

if (process.argv[1]?.endsWith("1-trend-scout.ts")) {
  const trends = await run();
  console.log("\nTop affiliate topics:");
  console.log(JSON.stringify(trends.slice(0, 10), null, 2));
}
