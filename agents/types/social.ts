export type SocialPlatform = "x";

export type SocialCampaignTrigger = "auto" | "manual" | "retry";
export type SocialCampaignStatus = "pending" | "partial" | "completed" | "failed";
export type SocialPlatformStatus = "pending" | "published" | "failed" | "skipped";
export type SocialErrorCode =
  | "none"
  | "dry_run"
  | "missing_credentials"
  | "misconfigured"
  | "missing_image"
  | "duplicate"
  | "rate_limit"
  | "network"
  | "timeout"
  | "remote_5xx"
  | "remote_4xx"
  | "permission"
  | "validation"
  | "not_implemented"
  | "unknown";

export interface SocialSharedCopy {
  brandFooter: string;
}

export interface XSocialCopy {
  text: string;
  hashtags?: string[];
  cta?: string;
  threadParts?: string[];
}

export interface SocialGeneratedCopy {
  shared: SocialSharedCopy;
  x: XSocialCopy;
}

export interface SocialContentInput {
  postId?: string;
  slug: string;
  title: string;
  excerpt: string;
  canonicalUrl: string;
  keywords: string[];
  categoryName?: string;
  categorySlug?: string;
  featuredImageUrl?: string;
  featuredImageAlt?: string;
  snippets: string[];
  researchHighlights: string[];
  brandName: string;
  brandFooter: string;
  hashtagGuidance: string;
}

export interface SocialCampaignInput {
  postId?: string;
  postSlug: string;
  postTitle: string;
  canonicalUrl: string;
  featuredImageUrl?: string;
  trigger: SocialCampaignTrigger;
  platformsRequested: SocialPlatform[];
  dryRun: boolean;
  force: boolean;
  retryFailed: boolean;
  copyVersion?: string;
}

export interface SocialRetryEntry {
  attempt: number;
  errorCode: SocialErrorCode;
  message: string;
  retryable: boolean;
  timestamp: string;
}

export interface SocialPlatformAttempt {
  platform: SocialPlatform;
  status: SocialPlatformStatus;
  attemptNumber: number;
  remotePostId?: string;
  remoteUrl?: string;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  generatedText?: string;
  generatedHashtags?: string[];
  imageUrl?: string;
  errorCode?: SocialErrorCode;
  errorMessage?: string;
  publishedAt?: number;
  retryHistory?: SocialRetryEntry[];
}

export interface SocialPublishSummary {
  campaignId?: string;
  postId?: string;
  postSlug: string;
  postTitle: string;
  canonicalUrl: string;
  requestedPlatforms: SocialPlatform[];
  attemptedPlatforms: SocialPlatform[];
  succeededPlatforms: SocialPlatform[];
  failedPlatforms: SocialPlatform[];
  skippedPlatforms: SocialPlatform[];
  status: SocialCampaignStatus;
  dryRun: boolean;
  startedAt: number;
  completedAt?: number;
  copy?: SocialGeneratedCopy;
  attempts: SocialPlatformAttempt[];
  errorSummary?: string;
}

export interface SocialAgentResult {
  summary: SocialPublishSummary;
  shouldFailProcess: boolean;
}

export interface SocialPlatformCredentialState {
  enabled: boolean;
  configured: boolean;
  missing: string[];
  values: Record<string, string | undefined>;
}

export interface SocialRuntimeConfig {
  siteUrl: string;
  brandName: string;
  brandFooter: string;
  hashtagGuidance: string;
  defaultPlatforms: SocialPlatform[];
  maxRetries: number;
  retryBackoffMs: number;
  telegramAlertsEnabled: boolean;
  platforms: Record<SocialPlatform, SocialPlatformCredentialState>;
}

export interface SocialPublishContext {
  config: SocialRuntimeConfig;
  input: SocialContentInput;
  copy: SocialGeneratedCopy;
  dryRun: boolean;
}

export interface SocialPlatformPublishResult {
  platform: SocialPlatform;
  status: SocialPlatformStatus;
  remotePostId?: string;
  remoteUrl?: string;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  generatedText?: string;
  generatedHashtags?: string[];
  errorCode?: SocialErrorCode;
  errorMessage?: string;
  publishedAt?: number;
}
