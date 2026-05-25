import "dotenv/config";
import { buildAmazonAffiliateUrl } from "./affiliate-utils.ts";
import { getAmazonPublicSettings, type AmazonPublicSettings } from "./convex-client.ts";
import { fetchWithTimeout } from "./http-utils.ts";
import type { AmazonProduct } from "../types/pipeline.ts";

export interface RainforestSearchResult {
  asin: string;
  title: string;
}

const RAINFOREST_ENDPOINT = "https://api.rainforestapi.com/request";

let settingsCache: AmazonPublicSettings | null = null;

async function getRuntimeSettings(): Promise<AmazonPublicSettings> {
  if (settingsCache) return settingsCache;
  try {
    settingsCache = await getAmazonPublicSettings();
  } catch {
    settingsCache = {
      associateTag: process.env.AMAZON_ASSOCIATE_TAG || "",
      region: process.env.AMAZON_REGION || "us-east-1",
      marketplace: process.env.AMAZON_MARKETPLACE || "www.amazon.com",
      cacheTtlHours: Number(process.env.PRODUCT_CACHE_TTL_HOURS || 24),
    };
  }
  return settingsCache;
}

function requiredApiKey(): string {
  const apiKey = process.env.RAINFOREST_API_KEY?.trim();
  if (!apiKey) throw new Error("RAINFOREST_API_KEY is missing");
  return apiKey;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getRainforestCurrency(settings?: AmazonPublicSettings): string {
  return process.env.RAINFOREST_CURRENCY?.trim() || settings?.currency?.trim() || "USD";
}

function getAmazonDomain(settings: AmazonPublicSettings): string {
  const fromEnv = process.env.RAINFOREST_AMAZON_DOMAIN?.trim();
  if (fromEnv) return fromEnv;
  if (settings.amazonDomain?.trim()) return settings.amazonDomain.trim();
  return (settings.marketplace || process.env.AMAZON_MARKETPLACE || "www.amazon.com").replace(/^https?:\/\//, "");
}

function getAssociateTag(settings: AmazonPublicSettings): string {
  return (process.env.AMAZON_ASSOCIATE_TAG || settings.associateTag || "").trim();
}

function appendOptional(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value?.trim()) params.set(key, value.trim());
}

async function rainforestRequest<T>(params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const settings = await getRuntimeSettings();
  const query = new URLSearchParams();
  query.set("api_key", requiredApiKey());
  query.set("amazon_domain", getAmazonDomain(settings));
  query.set("output", "json");

  const associateTag = getAssociateTag(settings);
  if (associateTag) query.set("associate_id", associateTag);

  appendOptional(query, "customer_location", process.env.RAINFOREST_CUSTOMER_LOCATION);
  appendOptional(query, "customer_zipcode", process.env.RAINFOREST_CUSTOMER_ZIPCODE);
  appendOptional(query, "language", process.env.RAINFOREST_LANGUAGE);
  appendOptional(query, "currency", process.env.RAINFOREST_CURRENCY);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }

  const timeoutMs = Number(process.env.RAINFOREST_REQUEST_TIMEOUT_MS || 30_000);
  const url = `${RAINFOREST_ENDPOINT}?${query.toString()}`;
  const response = await fetchWithTimeout(url, { method: "GET" }, Number.isFinite(timeoutMs) ? timeoutMs : 30_000);
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`RainforestAPI request failed [${response.status}]: ${text.slice(0, 500)}`);
  }

  const errorMessage = data?.request_info?.message || data?.request_info?.error || data?.error || data?.message;
  if (!response.ok || data?.request_info?.success === false) {
    throw new Error(`RainforestAPI request failed [${response.status}]: ${errorMessage || text.slice(0, 500) || "unknown error"}`);
  }

  return data as T;
}

function queryRelevanceScore(title: string, keywords: string): number {
  const titleLower = title.toLowerCase();
  const tokens = keywords.toLowerCase().split(/\s+/).filter((token) => token.length >= 3);
  if (!tokens.length) return 1;
  return tokens.filter((token) => titleLower.includes(token)).length / tokens.length;
}

function searchScore(result: any, keywords: string): number {
  const rating = numberValue(result.rating);
  const reviewCount = numberValue(result.ratings_total);
  const hasPrice = result.price ? 1 : 0;
  const relevance = queryRelevanceScore(stringValue(result.title), keywords);
  return relevance * 8 + Math.min(reviewCount, 5_000) / 1_000 + rating + hasPrice;
}

export async function searchItems(keywords: string, searchIndex = "All", itemCount = 5): Promise<RainforestSearchResult[]> {
  const data = await rainforestRequest<any>({
    type: "search",
    search_term: keywords,
    sort_by: "average_review",
    page: 1,
    fields: "search_results.asin,search_results.title,search_results.link,search_results.rating,search_results.ratings_total,search_results.price,search_results.image,search_results.is_prime,search_results.sponsored,search_results.categories",
  });

  const rawResults: any[] = Array.isArray(data.search_results) ? data.search_results : [];
  const usable = rawResults.filter((result) => stringValue(result.asin) && stringValue(result.title));
  const organic = usable.filter((result) => !result.sponsored);
  const candidates = organic.length >= itemCount ? organic : usable;

  return candidates
    .filter((result) => {
      const rating = numberValue(result.rating);
      const reviewCount = numberValue(result.ratings_total);
      const relevant = queryRelevanceScore(stringValue(result.title), keywords) > 0;
      return relevant && (!rating || rating >= 3.8) && (!reviewCount || reviewCount >= 20 || candidates.length <= itemCount);
    })
    .sort((a, b) => searchScore(b, keywords) - searchScore(a, keywords))
    .slice(0, itemCount)
    .map((result) => ({ asin: stringValue(result.asin).toUpperCase(), title: stringValue(result.title) }));
}

export async function getProduct(asin: string): Promise<AmazonProduct | null> {
  const cleanAsin = asin.trim().toUpperCase();
  if (!cleanAsin) return null;
  const data = await rainforestRequest<any>({
    type: "product",
    asin: cleanAsin,
    fields: "product.asin,product.title,product.brand,product.rating,product.ratings_total,product.price,product.buybox_winner,product.images,product.feature_bullets,product.specifications,product.categories,product.bestsellers_rank,product.description,product.main_image,product.link,product.link_with_associate_id,request_metadata.amazon_url",
  });
  return toAmazonProduct(data.product, data.request_metadata, cleanAsin);
}

export async function getItems(asins: string[]): Promise<AmazonProduct[]> {
  const uniqueAsins = [...new Set(asins.map((asin) => asin.trim().toUpperCase()).filter(Boolean))];
  const settled = await Promise.allSettled(uniqueAsins.map((asin) => getProduct(asin)));
  return settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value ? [result.value] : [];
    console.warn(`[RainforestAPI] Product lookup failed for ${uniqueAsins[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    return [];
  });
}

function firstImageLink(product: any): string {
  const mainImage = product?.main_image;
  if (typeof mainImage === "string") return mainImage;
  if (mainImage?.link) return stringValue(mainImage.link);
  const firstImage = Array.isArray(product?.images) ? product.images[0] : undefined;
  if (typeof firstImage === "string") return firstImage;
  return stringValue(firstImage?.link || firstImage?.url);
}

function lastCategoryName(product: any): string {
  const categories = Array.isArray(product?.categories) ? product.categories : [];
  const last = categories.at(-1);
  if (typeof last === "string") return last;
  return stringValue(last?.name || last?.title);
}

function productLink(product: any, requestMetadata: any, asin: string): string {
  const returnedLink = stringValue(product?.link_with_associate_id || product?.linkWithAssociateId || product?.link || requestMetadata?.amazon_url);
  if (returnedLink) return returnedLink;
  return buildAmazonAffiliateUrl(asin);
}

function toAmazonProduct(product: any, requestMetadata: any, fallbackAsin: string): AmazonProduct | null {
  if (!product) return null;
  const asin = stringValue(product.asin || fallbackAsin).toUpperCase();
  if (!asin) return null;
  const price = product.price ?? product.buybox_winner?.price;
  const savings = numberValue(price?.savings?.value ?? price?.savings);
  return {
    asin,
    title: stringValue(product.title) || asin,
    brand: stringValue(product.brand),
    price: {
      current: numberValue(price?.value ?? price?.raw),
      currency: stringValue(price?.currency) || getRainforestCurrency(settingsCache ?? undefined),
      ...(savings ? { savings } : {}),
    },
    rating: numberValue(product.rating),
    reviewCount: numberValue(product.ratings_total),
    features: Array.isArray(product.feature_bullets) ? product.feature_bullets.map(String).filter(Boolean) : [],
    imageUrl: firstImageLink(product),
    affiliateUrl: productLink(product, requestMetadata, asin),
    category: lastCategoryName(product),
    isPrime: Boolean(product.buybox_winner?.is_prime),
    availability: stringValue(product.buybox_winner?.availability?.raw || product.availability?.raw) || "Check Amazon for current availability",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv.slice(2).join(" ") || "Sony WH-1000XM5";
  searchItems(query, "All", 3)
    .then(async (results) => {
      console.log("Search results:", JSON.stringify(results, null, 2));
      const products = await getItems(results.map((result) => result.asin));
      console.log("Products:", JSON.stringify(products, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
