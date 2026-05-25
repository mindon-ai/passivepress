import type { SocialPublishSummary } from "./social.ts";

// Shared TypeScript types for the PassivePress AI affiliate publishing pipeline

/**
 * Typed pipeline error — wraps step name and cause for structured error handling.
 * Use `throw new PipelineStepError("StepName", err)` instead of throwing plain objects.
 */
export class PipelineStepError extends Error {
  constructor(public step: string, public cause: Error) {
    super(cause.message);
    this.name = "PipelineStepError";
  }
}

export type SourceTier = "official" | "research" | "top-tier" | "community" | "aggregator";

export type AffiliateContentType = "buyer-guide" | "single-review" | "comparison" | "top-n-list";

export interface TrendTopic {
  title: string;
  source: string;
  url: string;
  score: number;
  suggestedCategory: string;
  sourceTier?: SourceTier;
  sourceHost?: string;
  entities?: string[];
  niche?: string;
  contentType?: AffiliateContentType;
  productHints?: string[];
  searchVolume?: number;
  sourceUrls?: string[];
}

export interface TrendScoutConfig {
  niches?: string[];
  serperQueries?: string[];
  redditSubreddits?: string[];
  minSearchVolume?: number;
  sources: {
    serper: boolean;
    hackerNews: boolean;
    reddit: boolean;
    arxiv: boolean;
    fallback: boolean;
  };
  serper: {
    queries: string[];
    resultsPerQuery: number;
    recency: "qdr:d" | "qdr:w" | "qdr:m";
  };
  hackerNews: {
    query: string;
    hoursBack: number;
    minPoints: number;
    resultsPerPage: number;
  };
  reddit: {
    subreddits: string[];
    timeframe: "day" | "week";
    limitPerSubreddit: number;
  };
  arxiv: {
    category: string;
    maxPapers: number;
  };
  scoring: {
    majorModelBonus: number;
    launchWordBonus: number;
    freshnessBonus: number;
    duplicatePenalty: number;
    existingTitleSimilarityThreshold: number;
    discoveredTopicDedupeThreshold: number;
  };
  output: {
    maxTopics: number;
    fallbackTopics: number;
  };
}

export interface TopicPickerConfig {
  candidatePool: {
    maxCandidates: number;
    recentLogLimit: number;
    recentChosenTitlesLimit: number;
    recentCategoriesLimit: number;
  };
  editorialWeights: {
    novelty: number;
    specificity: number;
    audienceFit: number;
    categoryDiversity: number;
    sourceQuality: number;
  };
  categoryRules: {
    enabledCategories: string[];
    avoidLastRuns: number;
    overusedCategoryThreshold: number;
    allowCategoryOverride: boolean;
    defaultFallbackCategory: string;
  };
  duplicateRules: {
    promptSimilarityThreshold: number;
    strategyOverrideDelta: number;
    repeatedEntityStaleThreshold: number;
    blockNearDuplicates: boolean;
    blockRecentChosenTitles: boolean;
    blockPublishedTitles: boolean;
  };
  sourceRules: {
    preferOfficial: boolean;
    preferResearch: boolean;
    preferTopTier: boolean;
    allowCommunity: boolean;
    allowAggregator: boolean;
    minimumSourceTier: SourceTier;
  };
  keywordRules: {
    minKeywords: number;
    maxKeywords: number;
    requireLongTail: boolean;
    deduplicateKeywords: boolean;
  };
  angleRules: {
    minSentences: number;
    maxSentences: number;
    headlineMaxChars: number;
    fallbackAngle: string;
    banClickbait: boolean;
  };
  promptControls: {
    customInstruction: string;
    includeScoringNotes: boolean;
    includeBlockedTitles: boolean;
    includeRecentCategories: boolean;
    includeDuplicateRiskLabels: boolean;
  };
  fallbackRules: {
    enableFallback: boolean;
    overrideDuplicateChoice: boolean;
    overrideStaleChoice: boolean;
    overrideOverusedCategory: boolean;
    preferNonDuplicateFallback: boolean;
  };
}

export interface ResearcherConfig {
  search: {
    enabled: boolean;
    maxSearchCalls: number;
    defaultResultsPerSearch: number;
    maxResultsPerSearch: number;
    queryScope: string;
  };
  extraction: {
    includePapers: boolean;
    includeBenchmarks: boolean;
    includeCodeSnippets: boolean;
    minKeyFindings: number;
    maxKeyFindings: number;
    maxPapers: number;
    maxBenchmarks: number;
    maxCodeSnippets: number;
  };
  promptControls: {
    includeSourceUrls: boolean;
    includeTopicAngle: boolean;
    includeCategory: boolean;
    customInstruction: string;
  };
  fallbackRules: {
    allowEmptyArrays: boolean;
    allowPartialResults: boolean;
    requireReturnTool: boolean;
  };
}

export interface ImageGenConfig {
  specPrompt: {
    includeAngle: boolean;
    includeCategory: boolean;
    includeKeywords: boolean;
    keywordLimit: number;
    includeResearchFindings: boolean;
    researchFindingLimit: number;
    includeResearchPapers: boolean;
    researchPaperLimit: number;
    customInstruction: string;
  };
  imagePrompt: {
    maxPromptChars: number;
    maxAltTextChars: number;
    stylePreset: string;
    qualityBoosters: string;
    negativeConstraints: string;
    fallbackPromptTemplate: string;
    fallbackAltTemplate: string;
  };
  generation: {
    enabled: boolean;
    retryWithSimplePrompt: boolean;
    allowUnsplashFallback: boolean;
    allowSolidColorFallback: boolean;
  };
  output: {
    width: number;
    height: number;
    quality: number;
    format: "webp";
  };
}

export interface DataVizConfig {
  generation: {
    enabled: boolean;
    requireResearch: boolean;
    allowEmptyResult: boolean;
    requireReturnTool: boolean;
  };
  chartRules: {
    minNumericBenchmarks: number;
    maxCharts: number;
    maxDataPointsPerChart: number;
    maxSeriesPerChart: number;
    allowedChartTypes: Array<"bar" | "line" | "area">;
    defaultChartType: "bar" | "line" | "area";
  };
  promptControls: {
    includeAngle: boolean;
    includeCategory: boolean;
    includeKeywords: boolean;
    includeKeyFindings: boolean;
    includeBenchmarks: boolean;
    customInstruction: string;
  };
  contentRules: {
    includeMarkdownContent: boolean;
    sentencesPerChart: number;
    requireChartFences: boolean;
  };
}

export interface WriterConfig {
  metadata: {
    titleMaxChars: number;
    slugMaxChars: number;
    excerptMaxChars: number;
    metaTitleMaxChars: number;
    metaDescriptionMaxChars: number;
    includeKeywords: boolean;
    customInstruction: string;
  };
  content: {
    minWords: number;
    targetMinWords: number;
    targetMaxWords: number;
    bodySectionsMin: number;
    bodySectionsMax: number;
    requireKeyTakeaways: boolean;
    requireFaq: boolean;
    requireConclusion: boolean;
    customInstruction: string;
  };
  context: {
    includeResearch: boolean;
    includeDataViz: boolean;
    includeSourceLinks: boolean;
    includeInternalLinks: boolean;
    existingPostsLimit: number;
    includeFurtherReading: boolean;
    includeTableOfContents: boolean;
  };
  continuation: {
    enabled: boolean;
    maxTokens: number;
  };
  cleanup: {
    stripReferences: boolean;
    deduplicateBold: boolean;
    fixBoldHeadings: boolean;
    validateInternalLinks: boolean;
  };
}

export interface PublisherConfig {
  validation: {
    requireValidSlug: boolean;
    minTitleChars: number;
    minWords: number;
    maxExcerptChars: number;
    minMetaTitleChars: number;
    maxMetaTitleChars: number;
    minMetaDescriptionChars: number;
    maxMetaDescriptionChars: number;
    requireImageFile: boolean;
  };
  slug: {
    verifyUniqueness: boolean;
    failOnDuplicate: boolean;
  };
  image: {
    uploadToConvexStorage: boolean;
    requireStorageUrl: boolean;
    allowExistingStorageId: boolean;
  };
  publish: {
    enabled: boolean;
    dryRun: boolean;
    fallbackToChosenKeywords: boolean;
    requireCategoryId: boolean;
  };
}

export interface SocialMediaConfig {
  runtime: {
    enabled: boolean;
    dryRun: boolean;
    force: boolean;
    retryFailed: boolean;
    failManualProcessOnAllFailed: boolean;
  };
  platforms: {
    x: boolean;
  };
  copy: {
    maxTextChars: number;
    hashtagCount: number;
    requiredFirstHashtag: string;
    includeArticlePayload: boolean;
    includeDryRunFlag: boolean;
    customInstruction: string;
  };
  campaign: {
    copyVersion: string;
    skipIfExistingSuccess: boolean;
    createCampaignInDryRun: boolean;
  };
  alerts: {
    telegramOnAutoFailure: boolean;
  };
  logging: {
    writeSocialLog: boolean;
  };
}

export interface MetaAgentConfig {
  runtime: {
    enabled: boolean;
    defaultReportOnly: boolean;
    allowApplyAll: boolean;
    defaultLastN: number;
  };
  auditContext: {
    previousMetaSessionsLimit: number;
    sourceCharLimit: number;
    contentPreviewChars: number;
    includeFrontendSources: boolean;
    includeBackendSources: boolean;
    includeAgentSources: boolean;
    includeGaData: boolean;
  };
  report: {
    maxFindings: number;
    maxProposals: number;
    fallbackReportEnabled: boolean;
    filterAlreadyApplied: boolean;
    defaultConfidence: number;
  };
  apply: {
    requireReviewForSchemaChanges: boolean;
    neverAutoApplyReviewRequired: boolean;
    runVerificationWhenRecommended: boolean;
    saveRepairArtifacts: boolean;
  };
  alerts: {
    telegramEnabled: boolean;
  };
  logging: {
    saveSessionLog: boolean;
  };
  promptControls: {
    customInstruction: string;
  };
}

export interface ChosenTopic {
  title: string;
  angle: string;
  category: string;
  categoryId: string;
  keywords: string[];
  sourceUrls: string[];
  sourceTier?: SourceTier;
  entities?: string[];
  contentType?: AffiliateContentType;
  targetProducts?: string[];
  affiliateCategory?: string;
}

export interface ImageResult {
  localPath: string;
  publicUrl: string;
  storageId?: string;
  altText: string;
  prompt: string;
}

export interface PostDraft {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  readingTime: number;
}

export interface AmazonProduct {
  asin: string;
  title: string;
  brand: string;
  price: { current: number; currency: string; savings?: number };
  rating: number;
  reviewCount: number;
  features: string[];
  imageUrl: string;
  affiliateUrl: string;
  category: string;
  isPrime: boolean;
  availability: string;
}

export interface AffiliateLink {
  asin: string;
  productTitle: string;
  affiliateUrl: string;
  placeholderType: "inline" | "table" | "cta" | "price";
  positionInContent?: number;
  priceAtPublish?: number;
  currencyAtPublish?: string;
}

export interface ResearchData {
  papers: Array<{
    title: string;
    authors: string[];
    summary: string;
    url: string;
    published: string;
  }>;
  codeSnippets: Array<{
    language: string;
    code: string;
    source: string;
  }>;
  benchmarks: Array<{
    name: string;
    score: string;
    context: string;
  }>;
  keyFindings: string[];
}

export interface ProductResearchData extends ResearchData {
  products: AmazonProduct[];
  expertReviews: Array<{ source: string; summary: string; pros: string[]; cons: string[] }>;
  priceRange: { min: number; max: number; currency: string };
  recommendedPick: string;
  budgetPick?: string;
}

export interface DataVizSeries {
  key: string;
  label: string;
  color?: string;
}

export interface DataVizChart {
  id: string;
  title: string;
  description: string;
  type: "bar" | "line" | "area";
  xKey: string;
  series: DataVizSeries[];
  data: Array<Record<string, string | number>>;
  insight?: string;
  sourceLabel?: string;
}

export interface DataVizResult {
  charts: DataVizChart[];
  content: string;
}

export interface PipelineContext {
  runId: string;
  trends: TrendTopic[];
  chosen: ChosenTopic;
  research?: ProductResearchData;
  image: ImageResult;
  draft: PostDraft;
  dataviz?: DataVizChart[];
  affiliateLinks?: AffiliateLink[];
  convexPostId?: string;
  socialCampaignId?: string;
  socialResults?: SocialPublishSummary;
}

export interface PipelineOptions {
  dryRun: boolean;
  forceTopic?: string;
  resumeFrom?: string;
}

export interface PublishResult {
  convexPostId: string;
  slug: string;
  url: string;
}
