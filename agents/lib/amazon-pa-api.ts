// Deprecated: PassivePress now uses ./rainforest-api.ts for Amazon product data.
// Keep this PA API client temporarily for rollback/backward compatibility.
import crypto from "node:crypto";
import { fetchWithTimeout } from "./http-utils.ts";
import { buildAmazonAffiliateUrl } from "./affiliate-utils.ts";
import { getAmazonPublicSettings, type AmazonPublicSettings } from "./convex-client.ts";
import type { AmazonProduct } from "../types/pipeline.ts";

export interface AmazonSearchResult {
  asin: string;
  title: string;
}

const AMAZON_HOST_BY_REGION: Record<string, string> = {
  "us-east-1": "webservices.amazon.com",
};

function getHost(region = process.env.AMAZON_REGION || "us-east-1"): string {
  return process.env.AMAZON_PAAPI_HOST || AMAZON_HOST_BY_REGION[region] || "webservices.amazon.com";
}

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

function assertConfigured(): void {
  const missing = ["AMAZON_ACCESS_KEY", "AMAZON_SECRET_KEY", "AMAZON_ASSOCIATE_TAG"].filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Amazon PA API credentials missing: ${missing.join(", ")}`);
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function timestamp(date = new Date()): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

async function paapi<T>(target: "SearchItems" | "GetItems", body: Record<string, unknown>): Promise<T> {
  assertConfigured();
  const settings = await getRuntimeSettings();
  const region = process.env.AMAZON_REGION || settings.region || "us-east-1";
  const host = getHost(region);
  const path = "/paapi5/" + target.toLowerCase();
  const service = "ProductAdvertisingAPI";
  const payload = JSON.stringify({ PartnerTag: process.env.AMAZON_ASSOCIATE_TAG || settings.associateTag, PartnerType: "Associates", Marketplace: settings.marketplace || "www.amazon.com", ...body });
  const { amzDate, dateStamp } = timestamp();
  const canonicalHeaders = `content-encoding:amz-1.0\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${target}\n`;
  const signedHeaders = "content-encoding;host;x-amz-date;x-amz-target";
  const canonicalRequest = ["POST", path, "", canonicalHeaders, signedHeaders, sha256(payload)].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${process.env.AMAZON_SECRET_KEY}`, dateStamp), region), service), "aws4_request");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${process.env.AMAZON_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetchWithTimeout(`https://${host}${path}`, {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "Content-Encoding": "amz-1.0",
      "Content-Type": "application/json; charset=utf-8",
      "Host": host,
      "X-Amz-Date": amzDate,
      "X-Amz-Target": `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${target}`,
    },
    body: payload,
  }, 30_000);

  if (!response.ok) throw new Error(`Amazon PA API ${target} failed [${response.status}]: ${await response.text()}`);
  return await response.json() as T;
}

const DEFAULT_RESOURCES = [
  "Images.Primary.Large",
  "ItemInfo.ByLineInfo",
  "ItemInfo.Features",
  "ItemInfo.Title",
  "Offers.Listings.Availability.Message",
  "Offers.Listings.DeliveryInfo.IsPrimeEligible",
  "Offers.Listings.Price",
  "CustomerReviews.Count",
  "CustomerReviews.StarRating",
];

export async function searchItems(keywords: string, searchIndex = "All", itemCount = 5): Promise<AmazonSearchResult[]> {
  const data = await paapi<any>("SearchItems", { Keywords: keywords, SearchIndex: searchIndex, ItemCount: itemCount, Resources: ["ItemInfo.Title"] });
  return (data.SearchResult?.Items || []).map((item: any) => ({ asin: item.ASIN, title: item.ItemInfo?.Title?.DisplayValue || item.ASIN })).filter((item: AmazonSearchResult) => item.asin);
}

export async function getItems(asins: string[]): Promise<AmazonProduct[]> {
  if (!asins.length) return [];
  const data = await paapi<any>("GetItems", { ItemIds: asins.slice(0, 10), Resources: DEFAULT_RESOURCES });
  return (data.ItemsResult?.Items || []).map(toAmazonProduct).filter(Boolean);
}

function toAmazonProduct(item: any): AmazonProduct {
  const listing = item.Offers?.Listings?.[0];
  const price = listing?.Price;
  const asin = item.ASIN;
  return {
    asin,
    title: item.ItemInfo?.Title?.DisplayValue || asin,
    brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue || "",
    price: { current: price?.Amount || 0, currency: price?.Currency || "USD", savings: price?.Savings?.Amount },
    rating: Number(item.CustomerReviews?.StarRating?.Value || 0),
    reviewCount: Number(item.CustomerReviews?.Count || 0),
    features: item.ItemInfo?.Features?.DisplayValues || [],
    imageUrl: item.Images?.Primary?.Large?.URL || "",
    affiliateUrl: item.DetailPageURL || buildAmazonAffiliateUrl(asin),
    category: item.BrowseNodeInfo?.BrowseNodes?.[0]?.DisplayName || "",
    isPrime: Boolean(listing?.DeliveryInfo?.IsPrimeEligible),
    availability: listing?.Availability?.Message || "Check Amazon for availability",
  };
}
