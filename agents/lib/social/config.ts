import type { SocialPlatform, SocialPlatformCredentialState, SocialRuntimeConfig } from "../../types/social.ts";

const ALL_PLATFORMS: SocialPlatform[] = ["x"];
const FALLBACK_SITE_URL = "https://passivepress.qzz.io";

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeSiteUrl(value: string | undefined): string {
  const raw = value?.trim() || FALLBACK_SITE_URL;
  return raw.replace(/\/+$/, "");
}

export function normalizePlatforms(value?: string | string[] | null): SocialPlatform[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const normalized = rawValues
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item): item is SocialPlatform => ALL_PLATFORMS.includes(item as SocialPlatform));

  return [...new Set(normalized)];
}

function buildPlatformState(enabledByDefault: boolean, envKeys: string[], enabledEnvKey?: string): SocialPlatformCredentialState {
  const enabled = enabledEnvKey
    ? parseBoolean(process.env[enabledEnvKey], enabledByDefault)
    : enabledByDefault;

  const values = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const missing = envKeys.filter((key) => !(process.env[key] ?? "").trim());

  return {
    enabled,
    configured: missing.length === 0,
    missing,
    values,
  };
}

export function resolveSocialConfig(): SocialRuntimeConfig {
  const preferredSiteUrl =
    process.env.SOCIAL_SITE_URL
    ?? process.env.SITE_URL
    ?? process.env.VITE_SITE_URL
    ?? ((process.env.CONVEX_SITE_URL ?? "").includes(".convex.site") ? undefined : process.env.CONVEX_SITE_URL);
  const siteUrl = normalizeSiteUrl(preferredSiteUrl);
  const brandName = (process.env.SOCIAL_BRAND_NAME ?? "PassivePress").trim() || "PassivePress";
  const defaultPlatforms = normalizePlatforms(process.env.SOCIAL_DEFAULT_PLATFORMS) || ALL_PLATFORMS;
  const brandFooter = (process.env.SOCIAL_BRAND_FOOTER ?? `#${brandName.replace(/\s+/g, "")} | ${siteUrl.replace(/^https?:\/\//, "")}`).trim();

  return {
    siteUrl,
    brandName,
    brandFooter,
    hashtagGuidance: (process.env.SOCIAL_HASHTAG_GUIDANCE ?? "Use 1-3 concise, relevant hashtags on X only when they improve discoverability.").trim(),
    defaultPlatforms: defaultPlatforms.length > 0 ? defaultPlatforms : ALL_PLATFORMS,
    maxRetries: parseInteger(process.env.SOCIAL_MAX_RETRIES, 2),
    retryBackoffMs: parseInteger(process.env.SOCIAL_RETRY_BACKOFF_MS, 2_000),
    telegramAlertsEnabled: parseBoolean(process.env.SOCIAL_ENABLE_TELEGRAM_ALERTS, true),
    platforms: {
      x: buildPlatformState(true, [], "SOCIAL_ENABLE_X"),
    },
  };
}

export function getRequestedPlatforms(inputPlatforms?: string | string[] | null): SocialPlatform[] {
  const requested = normalizePlatforms(inputPlatforms);
  if (requested.length > 0) return requested;
  return resolveSocialConfig().defaultPlatforms;
}

export function getPlatformCredentialIssues(config: SocialRuntimeConfig, platform: SocialPlatform): string[] {
  return config.platforms[platform].missing;
}
