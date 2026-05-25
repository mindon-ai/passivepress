import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/authz";

const categorySlugValidator = v.union(
  v.literal("tech"),
  v.literal("home-appliances"),
  v.literal("fitness"),
  v.literal("outdoors"),
  v.literal("kitchen"),
  v.literal("ai-news"),
  v.literal("llms"),
  v.literal("image-ai"),
  v.literal("ai-coding"),
  v.literal("ai-business"),
  v.literal("ai-research"),
);

const sourceTierValidator = v.union(
  v.literal("official"),
  v.literal("research"),
  v.literal("top-tier"),
  v.literal("community"),
  v.literal("aggregator"),
);

const trendScoutConfigValidator = v.object({
  niches: v.optional(v.array(v.string())),
  serperQueries: v.optional(v.array(v.string())),
  redditSubreddits: v.optional(v.array(v.string())),
  minSearchVolume: v.optional(v.number()),
  sources: v.object({
    serper: v.boolean(),
    hackerNews: v.boolean(),
    reddit: v.boolean(),
    arxiv: v.boolean(),
    fallback: v.boolean(),
  }),
  serper: v.object({
    queries: v.array(v.string()),
    resultsPerQuery: v.number(),
    recency: v.union(v.literal("qdr:d"), v.literal("qdr:w"), v.literal("qdr:m")),
  }),
  hackerNews: v.object({
    query: v.string(),
    hoursBack: v.number(),
    minPoints: v.number(),
    resultsPerPage: v.number(),
  }),
  reddit: v.object({
    subreddits: v.array(v.string()),
    timeframe: v.union(v.literal("day"), v.literal("week")),
    limitPerSubreddit: v.number(),
  }),
  arxiv: v.object({
    category: v.string(),
    maxPapers: v.number(),
  }),
  scoring: v.object({
    majorModelBonus: v.number(),
    launchWordBonus: v.number(),
    freshnessBonus: v.number(),
    duplicatePenalty: v.number(),
    existingTitleSimilarityThreshold: v.number(),
    discoveredTopicDedupeThreshold: v.number(),
  }),
  output: v.object({
    maxTopics: v.number(),
    fallbackTopics: v.number(),
  }),
});

const topicPickerConfigValidator = v.object({
  candidatePool: v.object({
    maxCandidates: v.number(),
    recentLogLimit: v.number(),
    recentChosenTitlesLimit: v.number(),
    recentCategoriesLimit: v.number(),
  }),
  editorialWeights: v.object({
    novelty: v.number(),
    specificity: v.number(),
    audienceFit: v.number(),
    categoryDiversity: v.number(),
    sourceQuality: v.number(),
  }),
  categoryRules: v.object({
    enabledCategories: v.array(categorySlugValidator),
    avoidLastRuns: v.number(),
    overusedCategoryThreshold: v.number(),
    allowCategoryOverride: v.boolean(),
    defaultFallbackCategory: categorySlugValidator,
  }),
  duplicateRules: v.object({
    promptSimilarityThreshold: v.number(),
    strategyOverrideDelta: v.number(),
    repeatedEntityStaleThreshold: v.number(),
    blockNearDuplicates: v.boolean(),
    blockRecentChosenTitles: v.boolean(),
    blockPublishedTitles: v.boolean(),
  }),
  sourceRules: v.object({
    preferOfficial: v.boolean(),
    preferResearch: v.boolean(),
    preferTopTier: v.boolean(),
    allowCommunity: v.boolean(),
    allowAggregator: v.boolean(),
    minimumSourceTier: sourceTierValidator,
  }),
  keywordRules: v.object({
    minKeywords: v.number(),
    maxKeywords: v.number(),
    requireLongTail: v.boolean(),
    deduplicateKeywords: v.boolean(),
  }),
  angleRules: v.object({
    minSentences: v.number(),
    maxSentences: v.number(),
    headlineMaxChars: v.number(),
    fallbackAngle: v.string(),
    banClickbait: v.boolean(),
  }),
  promptControls: v.object({
    customInstruction: v.string(),
    includeScoringNotes: v.boolean(),
    includeBlockedTitles: v.boolean(),
    includeRecentCategories: v.boolean(),
    includeDuplicateRiskLabels: v.boolean(),
  }),
  fallbackRules: v.object({
    enableFallback: v.boolean(),
    overrideDuplicateChoice: v.boolean(),
    overrideStaleChoice: v.boolean(),
    overrideOverusedCategory: v.boolean(),
    preferNonDuplicateFallback: v.boolean(),
  }),
});

const researcherConfigValidator = v.object({
  search: v.object({
    enabled: v.boolean(),
    maxSearchCalls: v.number(),
    defaultResultsPerSearch: v.number(),
    maxResultsPerSearch: v.number(),
    queryScope: v.string(),
  }),
  extraction: v.object({
    includePapers: v.boolean(),
    includeBenchmarks: v.boolean(),
    includeCodeSnippets: v.boolean(),
    minKeyFindings: v.number(),
    maxKeyFindings: v.number(),
    maxPapers: v.number(),
    maxBenchmarks: v.number(),
    maxCodeSnippets: v.number(),
  }),
  promptControls: v.object({
    includeSourceUrls: v.boolean(),
    includeTopicAngle: v.boolean(),
    includeCategory: v.boolean(),
    customInstruction: v.string(),
  }),
  fallbackRules: v.object({
    allowEmptyArrays: v.boolean(),
    allowPartialResults: v.boolean(),
    requireReturnTool: v.boolean(),
  }),
});

const imageGenConfigValidator = v.object({
  specPrompt: v.object({
    includeAngle: v.boolean(),
    includeCategory: v.boolean(),
    includeKeywords: v.boolean(),
    keywordLimit: v.number(),
    includeResearchFindings: v.boolean(),
    researchFindingLimit: v.number(),
    includeResearchPapers: v.boolean(),
    researchPaperLimit: v.number(),
    customInstruction: v.string(),
  }),
  imagePrompt: v.object({
    maxPromptChars: v.number(),
    maxAltTextChars: v.number(),
    stylePreset: v.string(),
    qualityBoosters: v.string(),
    negativeConstraints: v.string(),
    fallbackPromptTemplate: v.string(),
    fallbackAltTemplate: v.string(),
  }),
  generation: v.object({
    enabled: v.boolean(),
    retryWithSimplePrompt: v.boolean(),
    allowUnsplashFallback: v.boolean(),
    allowSolidColorFallback: v.boolean(),
  }),
  output: v.object({
    width: v.number(),
    height: v.number(),
    quality: v.number(),
    format: v.literal("webp"),
  }),
});

const chartTypeValidator = v.union(v.literal("bar"), v.literal("line"), v.literal("area"));

const dataVizConfigValidator = v.object({
  generation: v.object({
    enabled: v.boolean(),
    requireResearch: v.boolean(),
    allowEmptyResult: v.boolean(),
    requireReturnTool: v.boolean(),
  }),
  chartRules: v.object({
    minNumericBenchmarks: v.number(),
    maxCharts: v.number(),
    maxDataPointsPerChart: v.number(),
    maxSeriesPerChart: v.number(),
    allowedChartTypes: v.array(chartTypeValidator),
    defaultChartType: chartTypeValidator,
  }),
  promptControls: v.object({
    includeAngle: v.boolean(),
    includeCategory: v.boolean(),
    includeKeywords: v.boolean(),
    includeKeyFindings: v.boolean(),
    includeBenchmarks: v.boolean(),
    customInstruction: v.string(),
  }),
  contentRules: v.object({
    includeMarkdownContent: v.boolean(),
    sentencesPerChart: v.number(),
    requireChartFences: v.boolean(),
  }),
});

const writerConfigValidator = v.object({
  metadata: v.object({
    titleMaxChars: v.number(),
    slugMaxChars: v.number(),
    excerptMaxChars: v.number(),
    metaTitleMaxChars: v.number(),
    metaDescriptionMaxChars: v.number(),
    includeKeywords: v.boolean(),
    customInstruction: v.string(),
  }),
  content: v.object({
    minWords: v.number(),
    targetMinWords: v.number(),
    targetMaxWords: v.number(),
    bodySectionsMin: v.number(),
    bodySectionsMax: v.number(),
    requireKeyTakeaways: v.boolean(),
    requireFaq: v.boolean(),
    requireConclusion: v.boolean(),
    customInstruction: v.string(),
  }),
  context: v.object({
    includeResearch: v.boolean(),
    includeDataViz: v.boolean(),
    includeSourceLinks: v.boolean(),
    includeInternalLinks: v.boolean(),
    existingPostsLimit: v.number(),
    includeFurtherReading: v.boolean(),
    includeTableOfContents: v.boolean(),
  }),
  continuation: v.object({
    enabled: v.boolean(),
    maxTokens: v.number(),
  }),
  cleanup: v.object({
    stripReferences: v.boolean(),
    deduplicateBold: v.boolean(),
    fixBoldHeadings: v.boolean(),
    validateInternalLinks: v.boolean(),
  }),
});

const publisherConfigValidator = v.object({
  validation: v.object({
    requireValidSlug: v.boolean(),
    minTitleChars: v.number(),
    minWords: v.number(),
    maxExcerptChars: v.number(),
    minMetaTitleChars: v.number(),
    maxMetaTitleChars: v.number(),
    minMetaDescriptionChars: v.number(),
    maxMetaDescriptionChars: v.number(),
    requireImageFile: v.boolean(),
  }),
  slug: v.object({
    verifyUniqueness: v.boolean(),
    failOnDuplicate: v.boolean(),
  }),
  image: v.object({
    uploadToConvexStorage: v.boolean(),
    requireStorageUrl: v.boolean(),
    allowExistingStorageId: v.boolean(),
  }),
  publish: v.object({
    enabled: v.boolean(),
    dryRun: v.boolean(),
    fallbackToChosenKeywords: v.boolean(),
    requireCategoryId: v.boolean(),
  }),
});

const socialMediaConfigValidator = v.object({
  runtime: v.object({
    enabled: v.boolean(),
    dryRun: v.boolean(),
    force: v.boolean(),
    retryFailed: v.boolean(),
    failManualProcessOnAllFailed: v.boolean(),
  }),
  platforms: v.object({
    x: v.boolean(),
  }),
  copy: v.object({
    maxTextChars: v.number(),
    hashtagCount: v.number(),
    requiredFirstHashtag: v.string(),
    includeArticlePayload: v.boolean(),
    includeDryRunFlag: v.boolean(),
    customInstruction: v.string(),
  }),
  campaign: v.object({
    copyVersion: v.string(),
    skipIfExistingSuccess: v.boolean(),
    createCampaignInDryRun: v.boolean(),
  }),
  alerts: v.object({
    telegramOnAutoFailure: v.boolean(),
  }),
  logging: v.object({
    writeSocialLog: v.boolean(),
  }),
});

const metaAgentConfigValidator = v.object({
  runtime: v.object({
    enabled: v.boolean(),
    defaultReportOnly: v.boolean(),
    allowApplyAll: v.boolean(),
    defaultLastN: v.number(),
  }),
  auditContext: v.object({
    previousMetaSessionsLimit: v.number(),
    sourceCharLimit: v.number(),
    contentPreviewChars: v.number(),
    includeFrontendSources: v.boolean(),
    includeBackendSources: v.boolean(),
    includeAgentSources: v.boolean(),
    includeGaData: v.boolean(),
  }),
  report: v.object({
    maxFindings: v.number(),
    maxProposals: v.number(),
    fallbackReportEnabled: v.boolean(),
    filterAlreadyApplied: v.boolean(),
    defaultConfidence: v.number(),
  }),
  apply: v.object({
    requireReviewForSchemaChanges: v.boolean(),
    neverAutoApplyReviewRequired: v.boolean(),
    runVerificationWhenRecommended: v.boolean(),
    saveRepairArtifacts: v.boolean(),
  }),
  alerts: v.object({
    telegramEnabled: v.boolean(),
  }),
  logging: v.object({
    saveSessionLog: v.boolean(),
  }),
  promptControls: v.object({
    customInstruction: v.string(),
  }),
});

const TREND_SCOUT_AGENT_ID = "trend-scout";
const TOPIC_PICKER_AGENT_ID = "topic-picker";
const RESEARCHER_AGENT_ID = "researcher";
const IMAGE_GEN_AGENT_ID = "image-gen";
const DATA_VIZ_AGENT_ID = "data-viz";
const WRITER_AGENT_ID = "writer";
const PUBLISHER_AGENT_ID = "publisher";
const SOCIAL_MEDIA_AGENT_ID = "social-media";
const META_AGENT_ID = "meta-agent";

const trendScoutDefaults = {
  niches: ["tech", "home-appliances", "fitness"],
  minSearchVolume: 0,
  sources: {
    serper: true,
    hackerNews: false,
    reddit: true,
    arxiv: false,
    fallback: true,
  },
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
    recency: "qdr:m" as const,
  },
  hackerNews: {
    query: "",
    hoursBack: 48,
    minPoints: 5,
    resultsPerPage: 20,
  },
  reddit: {
    subreddits: ["BuyItForLife", "frugalmalefashion", "homeimprovement", "gadgets", "buildapcsales", "VacuumCleaners"],
    timeframe: "week" as const,
    limitPerSubreddit: 8,
  },
  arxiv: {
    category: "",
    maxPapers: 0,
  },
  scoring: {
    majorModelBonus: 0,
    launchWordBonus: 20,
    freshnessBonus: 10,
    duplicatePenalty: 30,
    existingTitleSimilarityThreshold: 0.3,
    discoveredTopicDedupeThreshold: 0.35,
  },
  output: {
    maxTopics: 15,
    fallbackTopics: 5,
  },
};

const topicPickerDefaults = {
  candidatePool: {
    maxCandidates: 10,
    recentLogLimit: 12,
    recentChosenTitlesLimit: 10,
    recentCategoriesLimit: 10,
  },
  editorialWeights: {
    novelty: 5,
    specificity: 5,
    audienceFit: 5,
    categoryDiversity: 4,
    sourceQuality: 3,
  },
  categoryRules: {
    enabledCategories: ["tech", "home-appliances", "fitness", "outdoors", "kitchen"] as const,
    avoidLastRuns: 3,
    overusedCategoryThreshold: 2,
    allowCategoryOverride: true,
    defaultFallbackCategory: "tech" as const,
  },
  duplicateRules: {
    promptSimilarityThreshold: 0.25,
    strategyOverrideDelta: 8,
    repeatedEntityStaleThreshold: 3,
    blockNearDuplicates: true,
    blockRecentChosenTitles: true,
    blockPublishedTitles: true,
  },
  sourceRules: {
    preferOfficial: true,
    preferResearch: true,
    preferTopTier: true,
    allowCommunity: true,
    allowAggregator: true,
    minimumSourceTier: "aggregator" as const,
  },
  keywordRules: {
    minKeywords: 5,
    maxKeywords: 10,
    requireLongTail: true,
    deduplicateKeywords: true,
  },
  angleRules: {
    minSentences: 1,
    maxSentences: 3,
    headlineMaxChars: 90,
    fallbackAngle: "A practical buyer guide comparing current products by value, use case, and trade-offs.",
    banClickbait: true,
  },
  promptControls: {
    customInstruction: "",
    includeScoringNotes: true,
    includeBlockedTitles: true,
    includeRecentCategories: true,
    includeDuplicateRiskLabels: true,
  },
  fallbackRules: {
    enableFallback: true,
    overrideDuplicateChoice: true,
    overrideStaleChoice: true,
    overrideOverusedCategory: true,
    preferNonDuplicateFallback: true,
  },
};

const researcherDefaults = {
  search: {
    enabled: true,
    maxSearchCalls: 3,
    defaultResultsPerSearch: 10,
    maxResultsPerSearch: 15,
    queryScope: "site:arxiv.org OR site:github.com OR site:huggingface.co OR site:paperswithcode.com",
  },
  extraction: {
    includePapers: true,
    includeBenchmarks: true,
    includeCodeSnippets: true,
    minKeyFindings: 3,
    maxKeyFindings: 5,
    maxPapers: 5,
    maxBenchmarks: 8,
    maxCodeSnippets: 3,
  },
  promptControls: {
    includeSourceUrls: true,
    includeTopicAngle: true,
    includeCategory: true,
    customInstruction: "",
  },
  fallbackRules: {
    allowEmptyArrays: true,
    allowPartialResults: true,
    requireReturnTool: true,
  },
};

const imageGenDefaults = {
  specPrompt: {
    includeAngle: true,
    includeCategory: true,
    includeKeywords: true,
    keywordLimit: 6,
    includeResearchFindings: true,
    researchFindingLimit: 3,
    includeResearchPapers: true,
    researchPaperLimit: 2,
    customInstruction: "",
  },
  imagePrompt: {
    maxPromptChars: 300,
    maxAltTextChars: 125,
    stylePreset: "editorial abstract AI illustration, dark sci-fi, cyberpunk concept art",
    qualityBoosters: "masterpiece, best quality, ultra-detailed, 8k, sharp focus, cinematic composition",
    negativeConstraints: "no text, no logos, no human faces, no humanoid robots, no light bulbs, no stock photo",
    fallbackPromptTemplate: "{category} AI technology abstract, dark background neon accents, cinematic wide 16:9, no text, no logos, no humanoid robot",
    fallbackAltTemplate: "Abstract illustration representing {title}",
  },
  generation: {
    enabled: true,
    retryWithSimplePrompt: true,
    allowUnsplashFallback: true,
    allowSolidColorFallback: true,
  },
  output: {
    width: 1600,
    height: 900,
    quality: 85,
    format: "webp" as const,
  },
};

const dataVizDefaults = {
  generation: {
    enabled: true,
    requireResearch: true,
    allowEmptyResult: true,
    requireReturnTool: false,
  },
  chartRules: {
    minNumericBenchmarks: 2,
    maxCharts: 2,
    maxDataPointsPerChart: 6,
    maxSeriesPerChart: 3,
    allowedChartTypes: ["bar", "line", "area"] as const,
    defaultChartType: "bar" as const,
  },
  promptControls: {
    includeAngle: true,
    includeCategory: true,
    includeKeywords: true,
    includeKeyFindings: true,
    includeBenchmarks: true,
    customInstruction: "",
  },
  contentRules: {
    includeMarkdownContent: true,
    sentencesPerChart: 2,
    requireChartFences: true,
  },
};

const writerDefaults = {
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
    minWords: 1100,
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

const publisherDefaults = {
  validation: {
    requireValidSlug: true,
    minTitleChars: 10,
    minWords: 1100,
    maxExcerptChars: 300,
    minMetaTitleChars: 50,
    maxMetaTitleChars: 60,
    minMetaDescriptionChars: 120,
    maxMetaDescriptionChars: 160,
    requireImageFile: true,
  },
  slug: {
    verifyUniqueness: true,
    failOnDuplicate: true,
  },
  image: {
    uploadToConvexStorage: true,
    requireStorageUrl: true,
    allowExistingStorageId: true,
  },
  publish: {
    enabled: true,
    dryRun: false,
    fallbackToChosenKeywords: true,
    requireCategoryId: false,
  },
};

const socialMediaDefaults = {
  runtime: {
    enabled: true,
    dryRun: false,
    force: false,
    retryFailed: false,
    failManualProcessOnAllFailed: true,
  },
  platforms: {
    x: true,
  },
  copy: {
    maxTextChars: 280,
    hashtagCount: 3,
    requiredFirstHashtag: "PassivePress",
    includeArticlePayload: true,
    includeDryRunFlag: true,
    customInstruction: "",
  },
  campaign: {
    copyVersion: "social-x-playwright-v1",
    skipIfExistingSuccess: true,
    createCampaignInDryRun: true,
  },
  alerts: {
    telegramOnAutoFailure: true,
  },
  logging: {
    writeSocialLog: true,
  },
};

const metaAgentDefaults = {
  runtime: {
    enabled: true,
    defaultReportOnly: true,
    allowApplyAll: false,
    defaultLastN: 10,
  },
  auditContext: {
    previousMetaSessionsLimit: 5,
    sourceCharLimit: 6000,
    contentPreviewChars: 1200,
    includeFrontendSources: true,
    includeBackendSources: true,
    includeAgentSources: true,
    includeGaData: true,
  },
  report: {
    maxFindings: 8,
    maxProposals: 5,
    fallbackReportEnabled: true,
    filterAlreadyApplied: true,
    defaultConfidence: 0.5,
  },
  apply: {
    requireReviewForSchemaChanges: true,
    neverAutoApplyReviewRequired: true,
    runVerificationWhenRecommended: true,
    saveRepairArtifacts: true,
  },
  alerts: {
    telegramEnabled: true,
  },
  logging: {
    saveSessionLog: true,
  },
  promptControls: {
    customInstruction: "",
  },
};

async function getAgentSettingsRow(ctx: any, agentId: string) {
  return await ctx.db
    .query("agentSettings")
    .withIndex("by_agentId", (q: any) => q.eq("agentId", agentId))
    .unique();
}

function assertAgentSecret(secret: string) {
  const expectedSecret = process.env.AGENT_SECRET ?? "passivepress-agent-secret";
  if (!secret || secret !== expectedSecret) throw new Error("Unauthorized");
}

async function upsertAgentSettings(ctx: any, agentId: string, config: unknown, updatedBy?: string) {
  const now = Date.now();
  const row = await getAgentSettingsRow(ctx, agentId);

  if (row) {
    await ctx.db.patch(row._id, {
      config,
      updatedAt: now,
      updatedBy,
    });
    return row._id;
  }

  return await ctx.db.insert("agentSettings", {
    agentId,
    config,
    createdAt: now,
    updatedAt: now,
    updatedBy,
  });
}

export const getTrendScout = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, TREND_SCOUT_AGENT_ID);

    return {
      agentId: TREND_SCOUT_AGENT_ID,
      config: row?.config ?? trendScoutDefaults,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      isDefault: !row,
    };
  },
});

export const getTrendScoutForAgent = query({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, { secret }) => {
    assertAgentSecret(secret);
    const row = await getAgentSettingsRow(ctx, TREND_SCOUT_AGENT_ID);
    return row?.config ?? trendScoutDefaults;
  },
});

export const updateTrendScout = mutation({
  args: {
    config: trendScoutConfigValidator,
  },
  handler: async (ctx, { config }) => {
    const identity = await requireAdmin(ctx);
    return await upsertAgentSettings(ctx, TREND_SCOUT_AGENT_ID, config, identity.email);
  },
});

export const resetTrendScout = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, TREND_SCOUT_AGENT_ID);

    if (row) await ctx.db.delete(row._id);
    return trendScoutDefaults;
  },
});

export const getTopicPicker = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, TOPIC_PICKER_AGENT_ID);

    return {
      agentId: TOPIC_PICKER_AGENT_ID,
      config: row?.config ?? topicPickerDefaults,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      isDefault: !row,
    };
  },
});

export const getTopicPickerForAgent = query({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, { secret }) => {
    assertAgentSecret(secret);
    const row = await getAgentSettingsRow(ctx, TOPIC_PICKER_AGENT_ID);
    return row?.config ?? topicPickerDefaults;
  },
});

export const updateTopicPicker = mutation({
  args: {
    config: topicPickerConfigValidator,
  },
  handler: async (ctx, { config }) => {
    const identity = await requireAdmin(ctx);
    return await upsertAgentSettings(ctx, TOPIC_PICKER_AGENT_ID, config, identity.email);
  },
});

export const resetTopicPicker = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, TOPIC_PICKER_AGENT_ID);

    if (row) await ctx.db.delete(row._id);
    return topicPickerDefaults;
  },
});

export const getResearcher = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, RESEARCHER_AGENT_ID);

    return {
      agentId: RESEARCHER_AGENT_ID,
      config: row?.config ?? researcherDefaults,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      isDefault: !row,
    };
  },
});

export const getResearcherForAgent = query({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, { secret }) => {
    assertAgentSecret(secret);
    const row = await getAgentSettingsRow(ctx, RESEARCHER_AGENT_ID);
    return row?.config ?? researcherDefaults;
  },
});

export const updateResearcher = mutation({
  args: {
    config: researcherConfigValidator,
  },
  handler: async (ctx, { config }) => {
    const identity = await requireAdmin(ctx);
    return await upsertAgentSettings(ctx, RESEARCHER_AGENT_ID, config, identity.email);
  },
});

export const resetResearcher = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, RESEARCHER_AGENT_ID);

    if (row) await ctx.db.delete(row._id);
    return researcherDefaults;
  },
});

export const getImageGen = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, IMAGE_GEN_AGENT_ID);

    return {
      agentId: IMAGE_GEN_AGENT_ID,
      config: row?.config ?? imageGenDefaults,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      isDefault: !row,
    };
  },
});

export const getImageGenForAgent = query({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, { secret }) => {
    assertAgentSecret(secret);
    const row = await getAgentSettingsRow(ctx, IMAGE_GEN_AGENT_ID);
    return row?.config ?? imageGenDefaults;
  },
});

export const updateImageGen = mutation({
  args: {
    config: imageGenConfigValidator,
  },
  handler: async (ctx, { config }) => {
    const identity = await requireAdmin(ctx);
    return await upsertAgentSettings(ctx, IMAGE_GEN_AGENT_ID, config, identity.email);
  },
});

export const resetImageGen = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, IMAGE_GEN_AGENT_ID);

    if (row) await ctx.db.delete(row._id);
    return imageGenDefaults;
  },
});

export const getDataViz = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, DATA_VIZ_AGENT_ID);

    return {
      agentId: DATA_VIZ_AGENT_ID,
      config: row?.config ?? dataVizDefaults,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      isDefault: !row,
    };
  },
});

export const getDataVizForAgent = query({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, { secret }) => {
    assertAgentSecret(secret);
    const row = await getAgentSettingsRow(ctx, DATA_VIZ_AGENT_ID);
    return row?.config ?? dataVizDefaults;
  },
});

export const updateDataViz = mutation({
  args: {
    config: dataVizConfigValidator,
  },
  handler: async (ctx, { config }) => {
    const identity = await requireAdmin(ctx);
    return await upsertAgentSettings(ctx, DATA_VIZ_AGENT_ID, config, identity.email);
  },
});

export const resetDataViz = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, DATA_VIZ_AGENT_ID);

    if (row) await ctx.db.delete(row._id);
    return dataVizDefaults;
  },
});

export const getWriter = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, WRITER_AGENT_ID);

    return {
      agentId: WRITER_AGENT_ID,
      config: row?.config ?? writerDefaults,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      isDefault: !row,
    };
  },
});

export const getWriterForAgent = query({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, { secret }) => {
    assertAgentSecret(secret);
    const row = await getAgentSettingsRow(ctx, WRITER_AGENT_ID);
    return row?.config ?? writerDefaults;
  },
});

export const updateWriter = mutation({
  args: {
    config: writerConfigValidator,
  },
  handler: async (ctx, { config }) => {
    const identity = await requireAdmin(ctx);
    return await upsertAgentSettings(ctx, WRITER_AGENT_ID, config, identity.email);
  },
});

export const resetWriter = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, WRITER_AGENT_ID);

    if (row) await ctx.db.delete(row._id);
    return writerDefaults;
  },
});

export const getPublisher = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, PUBLISHER_AGENT_ID);

    return {
      agentId: PUBLISHER_AGENT_ID,
      config: row?.config ?? publisherDefaults,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      isDefault: !row,
    };
  },
});

export const getPublisherForAgent = query({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, { secret }) => {
    assertAgentSecret(secret);
    const row = await getAgentSettingsRow(ctx, PUBLISHER_AGENT_ID);
    return row?.config ?? publisherDefaults;
  },
});

export const updatePublisher = mutation({
  args: {
    config: publisherConfigValidator,
  },
  handler: async (ctx, { config }) => {
    const identity = await requireAdmin(ctx);
    return await upsertAgentSettings(ctx, PUBLISHER_AGENT_ID, config, identity.email);
  },
});

export const resetPublisher = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, PUBLISHER_AGENT_ID);

    if (row) await ctx.db.delete(row._id);
    return publisherDefaults;
  },
});

export const getSocialMedia = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, SOCIAL_MEDIA_AGENT_ID);

    return {
      agentId: SOCIAL_MEDIA_AGENT_ID,
      config: row?.config ?? socialMediaDefaults,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      isDefault: !row,
    };
  },
});

export const getSocialMediaForAgent = query({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, { secret }) => {
    assertAgentSecret(secret);
    const row = await getAgentSettingsRow(ctx, SOCIAL_MEDIA_AGENT_ID);
    return row?.config ?? socialMediaDefaults;
  },
});

export const updateSocialMedia = mutation({
  args: {
    config: socialMediaConfigValidator,
  },
  handler: async (ctx, { config }) => {
    const identity = await requireAdmin(ctx);
    return await upsertAgentSettings(ctx, SOCIAL_MEDIA_AGENT_ID, config, identity.email);
  },
});

export const resetSocialMedia = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, SOCIAL_MEDIA_AGENT_ID);

    if (row) await ctx.db.delete(row._id);
    return socialMediaDefaults;
  },
});

export const getMetaAgent = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, META_AGENT_ID);

    return {
      agentId: META_AGENT_ID,
      config: row?.config ?? metaAgentDefaults,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      isDefault: !row,
    };
  },
});

export const getMetaAgentForAgent = query({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, { secret }) => {
    assertAgentSecret(secret);
    const row = await getAgentSettingsRow(ctx, META_AGENT_ID);
    return row?.config ?? metaAgentDefaults;
  },
});

export const updateMetaAgent = mutation({
  args: {
    config: metaAgentConfigValidator,
  },
  handler: async (ctx, { config }) => {
    const identity = await requireAdmin(ctx);
    return await upsertAgentSettings(ctx, META_AGENT_ID, config, identity.email);
  },
});

export const resetMetaAgent = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await getAgentSettingsRow(ctx, META_AGENT_ID);

    if (row) await ctx.db.delete(row._id);
    return metaAgentDefaults;
  },
});
