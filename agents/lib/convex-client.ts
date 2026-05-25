// Convex HTTP API client for agent use
import "dotenv/config";
import fs from "fs";
import { fetchWithTimeout } from "./http-utils.ts";
import type { AffiliateLink, AmazonProduct, DataVizConfig, ImageGenConfig, MetaAgentConfig, PublisherConfig, ResearcherConfig, SocialMediaConfig, TopicPickerConfig, TrendScoutConfig, WriterConfig } from "../types/pipeline.ts";
import type { SocialCampaignStatus, SocialPlatform, SocialPlatformStatus } from "../types/social.ts";

const CONVEX_URL = process.env.CONVEX_URL ?? "http://192.168.11.106:3210";
const CONVEX_DEPLOY_KEY = process.env.CONVEX_DEPLOY_KEY ?? "";
const AGENT_SECRET = process.env.AGENT_SECRET ?? "passivepress-agent-secret";

export async function convexQuery<T>(fnPath: string, args: Record<string, unknown> = {}): Promise<T> {
  const [module, fn] = fnPath.split(":");
  const url = `${CONVEX_URL}/api/query`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(fnPath.includes("migration") ? { Authorization: `Bearer ${CONVEX_DEPLOY_KEY}` } : {}),
    },
    body: JSON.stringify({ path: `${module}:${fn}`, args, format: "json" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Convex query failed [${response.status}]: ${text}`);
  }

  const data = (await response.json()) as { value: T; status: string };
  if (data.value === undefined) {
    console.error(`[Convex] Query ${fnPath} returned undefined. Raw response:`, JSON.stringify(data));
  }
  return data.value;
}

export async function agentPublish(args: {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  featured_image: string | null;
  featured_image_storage_id?: string | null;
  featured_image_alt: string | null;
  meta_title: string | null;
  meta_description: string | null;
  keywords: string[];
  category_id: string | null;
  reading_time: number;
  affiliateLinks?: AffiliateLink[];
}): Promise<{ postId: string }> {
  const siteUrl = process.env.CONVEX_SITE_URL ?? CONVEX_URL.replace(":3210", ":3211");
  const url = `${siteUrl}/agent/publish`;

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-secret": AGENT_SECRET,
      },
      body: JSON.stringify(args),
    },
    30_000,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Agent publish failed [${response.status}]: ${text}`);
  }

  return (await response.json()) as { postId: string };
}

export async function convexMutation<T>(fnPath: string, args: Record<string, unknown> = {}): Promise<T> {
  const [module, fn] = fnPath.split(":");
  const url = `${CONVEX_URL}/api/mutation`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(fnPath.includes("migration") ? { Authorization: `Bearer ${CONVEX_DEPLOY_KEY}` } : {}),
    },
    body: JSON.stringify({ path: `${module}:${fn}`, args, format: "json" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Convex mutation failed [${response.status}]: ${text}`);
  }

  const data = (await response.json()) as { value: T; status: string };
  return data.value;
}

export async function uploadImageToConvexStorage(localPath: string): Promise<{ storageId: string; url: string }> {
  const uploadUrl = await convexMutation<string>("images:generateUploadUrl", {});
  const buffer = fs.readFileSync(localPath);

  const uploadResponse = await fetchWithTimeout(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/webp" },
    body: buffer,
  }, 30_000);

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Convex storage upload failed [${uploadResponse.status}]: ${text}`);
  }

  const { storageId } = (await uploadResponse.json()) as { storageId: string };
  const url = await convexQuery<string | null>("images:getImageUrl", { storageId });
  if (!url) throw new Error(`Convex storage URL unavailable for storageId ${storageId}`);
  return { storageId, url };
}

export async function listExistingSlugs(): Promise<string[]> {
  return convexQuery<string[]>("posts:listExistingSlugs");
}

export async function listPublishedTitles(): Promise<string[]> {
  const posts = await convexQuery<Array<{ slug: string; title?: string }>>("posts:listPublished", {});
  return posts.map((p) => p.title ?? p.slug);
}

export async function getTrendScoutConfig(): Promise<TrendScoutConfig> {
  return convexQuery<TrendScoutConfig>("agentSettings:getTrendScoutForAgent", { secret: AGENT_SECRET });
}

export async function getTopicPickerConfig(): Promise<TopicPickerConfig> {
  return convexQuery<TopicPickerConfig>("agentSettings:getTopicPickerForAgent", { secret: AGENT_SECRET });
}

export async function getResearcherConfig(): Promise<ResearcherConfig> {
  return convexQuery<ResearcherConfig>("agentSettings:getResearcherForAgent", { secret: AGENT_SECRET });
}

export async function getImageGenConfig(): Promise<ImageGenConfig> {
  return convexQuery<ImageGenConfig>("agentSettings:getImageGenForAgent", { secret: AGENT_SECRET });
}

export async function getDataVizConfig(): Promise<DataVizConfig> {
  return convexQuery<DataVizConfig>("agentSettings:getDataVizForAgent", { secret: AGENT_SECRET });
}

export async function getWriterConfig(): Promise<WriterConfig> {
  return convexQuery<WriterConfig>("agentSettings:getWriterForAgent", { secret: AGENT_SECRET });
}

export async function getPublisherConfig(): Promise<PublisherConfig> {
  return convexQuery<PublisherConfig>("agentSettings:getPublisherForAgent", { secret: AGENT_SECRET });
}

export async function getSocialMediaConfig(): Promise<SocialMediaConfig> {
  return convexQuery<SocialMediaConfig>("agentSettings:getSocialMediaForAgent", { secret: AGENT_SECRET });
}

export async function getMetaAgentConfig(): Promise<MetaAgentConfig> {
  return convexQuery<MetaAgentConfig>("agentSettings:getMetaAgentForAgent", { secret: AGENT_SECRET });
}

export interface AmazonPublicSettings {
  provider?: string;
  associateTag: string;
  region: string;
  marketplace: string;
  amazonDomain?: string;
  currency?: string;
  cacheTtlHours: number;
}

export async function getAmazonPublicSettings(): Promise<AmazonPublicSettings> {
  return convexQuery<AmazonPublicSettings>("affiliateSettings:getAmazonPublicSettings", {});
}

export interface PostLink {
  slug: string;
  title: string;
}

export interface PublishedPostSummary {
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image: string | null;
  featured_image_alt: string | null;
  published_at: string | null;
  reading_time: number | null;
  category: { name: string; slug: string } | null;
}

export interface PublishedPostDetail extends PublishedPostSummary {
  id: string;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  keywords: string[] | null;
  author_name: string | null;
}

export async function listPublishedPostLinks(): Promise<PostLink[]> {
  const posts = await convexQuery<Array<{ slug: string; title: string }>>("posts:listPublished", {});
  return posts.map((p) => ({ slug: p.slug, title: p.title }));
}

export async function listPublishedPosts(limit = 5): Promise<PublishedPostSummary[]> {
  return convexQuery<PublishedPostSummary[]>("posts:listPublished", { limit });
}

export async function getPublishedPostBySlug(slug: string): Promise<PublishedPostDetail | null> {
  return convexQuery<PublishedPostDetail | null>("posts:getBySlug", { slug });
}

export async function getPublishedPostById(id: string): Promise<PublishedPostDetail | null> {
  return convexQuery<PublishedPostDetail | null>("posts:getByIdForAgent", { id });
}

export async function getCategoryBySlug(slug: string): Promise<{ id: string; slug: string; name: string } | null> {
  return convexQuery<{ id: string; slug: string; name: string } | null>("categories:getBySlug", { slug });
}

export async function getFreshCachedProducts(asins: string[]): Promise<AmazonProduct[]> {
  if (!asins.length) return [];
  return convexQuery<AmazonProduct[]>("productCache:getManyFresh", { asins, now: Date.now() });
}

export async function cacheProducts(products: AmazonProduct[], ttlHoursOverride?: number): Promise<{ count: number }> {
  if (!products.length) return { count: 0 };
  const ttlHours = ttlHoursOverride ?? Number(process.env.PRODUCT_CACHE_TTL_HOURS || 24);
  return convexMutation<{ count: number }>("productCache:upsertMany", { products, ttlHours });
}

export async function listRecentCategories(limit = 5): Promise<string[]> {
  return convexQuery<string[]>("posts:listRecentCategories", { limit });
}

export async function createSocialCampaign(args: {
  postId?: string;
  postSlug: string;
  postTitle: string;
  canonicalUrl: string;
  featuredImageUrl?: string;
  trigger: "auto" | "manual" | "retry";
  platformsRequested: SocialPlatform[];
  dryRun: boolean;
  force: boolean;
  retryFailed: boolean;
  copyVersion?: string;
}): Promise<string> {
  return convexMutation<string>("socialPosts:createCampaign", args);
}

export async function finalizeSocialCampaign(args: {
  campaignId: string;
  status: SocialCampaignStatus;
  platformsSucceeded: SocialPlatform[];
  platformsFailed: SocialPlatform[];
  errorSummary?: string;
}): Promise<void> {
  return convexMutation<void>("socialPosts:finalizeCampaign", args);
}

export async function createSocialPlatformAttempt(args: {
  campaignId: string;
  postId?: string;
  postSlug: string;
  platform: SocialPlatform;
  generatedText?: string;
  generatedHashtags?: string[];
  imageUrl?: string;
  requestPayload?: Record<string, unknown>;
}): Promise<{ attemptId: string; attemptNumber: number; generatedText?: string; generatedHashtags: string[] }> {
  return convexMutation<{ attemptId: string; attemptNumber: number; generatedText?: string; generatedHashtags: string[] }>("socialPosts:createPlatformAttempt", args);
}

export async function finalizeSocialPlatformAttempt(args: {
  attemptId: string;
  status: SocialPlatformStatus;
  remotePostId?: string;
  remoteUrl?: string;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  generatedText?: string;
  generatedHashtags?: string[];
  imageUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  publishedAt?: number;
}): Promise<void> {
  return convexMutation<void>("socialPosts:finalizePlatformAttempt", args);
}

export async function getSuccessfulSocialPlatformPost(postSlug: string, platform: SocialPlatform): Promise<{
  id: string;
  platform: SocialPlatform;
  remotePostId: string | null;
  remoteUrl: string | null;
  publishedAt: number | null;
} | null> {
  return convexQuery("socialPosts:getSuccessfulPlatformPost", { postSlug, platform });
}

export async function getSocialPlatformStatusForPost(postSlug: string): Promise<Array<{
  platform: SocialPlatform;
  status: SocialPlatformStatus;
  attemptNumber: number;
  remoteUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}>> {
  return convexQuery("socialPosts:getPlatformStatusForPost", { postSlug });
}

if (process.argv[1]?.endsWith("convex-client.ts")) {
  console.log("Testing Convex client...");
  listExistingSlugs()
    .then((slugs) => console.log(`Existing slugs (${slugs.length}):`, slugs.slice(0, 5)))
    .catch((e) => console.error("Slugs error:", e));

  convexQuery<unknown[]>("categories:listAll")
    .then((categories) => console.log(`Categories (${categories.length}):`, categories))
    .catch((e) => console.error("Categories error:", e));
}
