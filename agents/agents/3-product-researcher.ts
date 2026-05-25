import "dotenv/config";
import { getItems, searchItems } from "../lib/amazon-pa-api.ts";
import { buildAmazonAffiliateUrl } from "../lib/affiliate-utils.ts";
import { cacheProducts, getAmazonPublicSettings, getFreshCachedProducts } from "../lib/convex-client.ts";
import * as webResearcher from "./8-researcher.ts";
import type { AmazonProduct, ChosenTopic, ProductResearchData } from "../types/pipeline.ts";

function fallbackProduct(name: string, category: string): AmazonProduct {
  const pseudoAsin = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10).padEnd(10, "0");
  return {
    asin: pseudoAsin,
    title: name,
    brand: "",
    price: { current: 0, currency: "USD" },
    rating: 0,
    reviewCount: 0,
    features: [],
    imageUrl: "",
    affiliateUrl: buildAmazonAffiliateUrl(pseudoAsin),
    category,
    isPrime: false,
    availability: "Check Amazon for current availability",
  };
}

export async function run(topic: ChosenTopic): Promise<ProductResearchData> {
  console.log(`[ProductResearcher] Researching products for: "${topic.title}"`);
  const productQueries = (topic.targetProducts?.length ? topic.targetProducts : topic.entities?.length ? topic.entities : [topic.title]).slice(0, 8);
  const searchIndex = topic.affiliateCategory || topic.category || "All";
  let products: AmazonProduct[] = [];

  try {
    const searchResults = await Promise.all(productQueries.map((query) => searchItems(query, searchIndex, 3)));
    const asins = [...new Set(searchResults.flat().map((item) => item.asin))].slice(0, 10);
    const cached = await getFreshCachedProducts(asins).catch((err) => {
      console.warn(`[ProductResearcher] Product cache read failed: ${(err as Error).message}`);
      return [] as AmazonProduct[];
    });
    const cachedByAsin = new Map(cached.map((product) => [product.asin.toUpperCase(), product]));
    const missingAsins = asins.filter((asin) => !cachedByAsin.has(asin.toUpperCase()));
    const fresh = missingAsins.length ? await getItems(missingAsins) : [];
    if (fresh.length) {
      const settings = await getAmazonPublicSettings().catch(() => null);
      await cacheProducts(fresh, settings?.cacheTtlHours).catch((err) => console.warn(`[ProductResearcher] Product cache write failed: ${(err as Error).message}`));
    }
    const freshByAsin = new Map(fresh.map((product) => [product.asin.toUpperCase(), product]));
    products = asins.map((asin) => cachedByAsin.get(asin.toUpperCase()) || freshByAsin.get(asin.toUpperCase())).filter(Boolean) as AmazonProduct[];
    console.log(`[ProductResearcher] Loaded ${products.length} Amazon product(s): ${cached.length} cached, ${fresh.length} fresh.`);
  } catch (err) {
    console.warn(`[ProductResearcher] Amazon PA API unavailable; using placeholder product records: ${(err as Error).message}`);
    products = productQueries.map((query) => fallbackProduct(query, topic.category));
  }

  let baseResearch: Pick<ProductResearchData, "papers" | "benchmarks" | "codeSnippets" | "keyFindings"> = { papers: [], benchmarks: [], codeSnippets: [], keyFindings: [] };
  try {
    baseResearch = await webResearcher.run({
      ...topic,
      angle: `${topic.angle}\nFocus web research on independent product reviews, expert pros/cons, real-world testing, and comparison notes. Do not copy competitor prose.`,
      sourceUrls: topic.sourceUrls || [],
    }) as ProductResearchData;
  } catch (err) {
    console.warn(`[ProductResearcher] Web review research failed; continuing with Amazon data only: ${(err as Error).message}`);
  }

  const priced = products.filter((product) => product.price.current > 0);
  const sortedByRating = [...products].sort((a, b) => (b.rating * Math.log10(b.reviewCount + 10)) - (a.rating * Math.log10(a.reviewCount + 10)));
  const sortedByValue = [...priced].sort((a, b) => (b.rating / Math.max(b.price.current, 1)) - (a.rating / Math.max(a.price.current, 1)));
  const currency = priced[0]?.price.currency || "USD";

  return {
    papers: baseResearch.papers || [],
    benchmarks: baseResearch.benchmarks || [],
    codeSnippets: baseResearch.codeSnippets || [],
    keyFindings: [
      ...(baseResearch.keyFindings || []),
      ...products.slice(0, 5).map((product) => `${product.title}: ${product.rating ? `${product.rating}/5` : "rating unavailable"}, ${product.reviewCount || 0} reviews, ${product.availability}.`),
    ].slice(0, 8),
    products,
    expertReviews: [],
    priceRange: {
      min: priced.length ? Math.min(...priced.map((product) => product.price.current)) : 0,
      max: priced.length ? Math.max(...priced.map((product) => product.price.current)) : 0,
      currency,
    },
    recommendedPick: sortedByRating[0]?.asin || products[0]?.asin || "",
    budgetPick: sortedByValue[0]?.asin,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run({
    title: "Best USB-C chargers for travel",
    angle: "Find compact chargers with multiple ports and strong value.",
    category: "tech",
    categoryId: "",
    keywords: ["best USB-C charger", "travel charger"],
    sourceUrls: [],
    contentType: "buyer-guide",
    targetProducts: ["Anker USB C charger", "UGREEN Nexode charger"],
    affiliateCategory: "Electronics",
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
