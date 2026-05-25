import "dotenv/config";
import { resolveAffiliatePlaceholders } from "../lib/affiliate-utils.ts";
import type { AffiliateLink, AmazonProduct, PostDraft } from "../types/pipeline.ts";

export async function run(draft: PostDraft, products: AmazonProduct[] = []): Promise<{
  resolvedContent: string;
  affiliateLinks: AffiliateLink[];
}> {
  console.log(`[AffiliateLinker] Resolving affiliate placeholders with ${products.length} product(s)...`);
  const result = resolveAffiliatePlaceholders(draft.content, products);
  const unresolved = result.content.match(/\{\{(?:PRODUCT|AFFILIATE_TABLE|BUY_BUTTON|PRICE):[^}]+\}\}/g) || [];
  if (unresolved.length) {
    console.warn(`[AffiliateLinker] ${unresolved.length} affiliate placeholder(s) could not be resolved.`);
  }
  console.log(`[AffiliateLinker] Resolved ${result.affiliateLinks.length} affiliate link metadata record(s).`);
  return { resolvedContent: result.content, affiliateLinks: result.affiliateLinks };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample: PostDraft = {
    slug: "sample",
    title: "Sample",
    excerpt: "Sample",
    content: "The {{PRODUCT:B000000001:Example Product}} costs {{PRICE:B000000001}}.\n\n{{BUY_BUTTON:B000000001:Check Price on Amazon}}",
    metaTitle: "Sample",
    metaDescription: "Sample",
    keywords: [],
    readingTime: 1,
  };
  run(sample, [{
    asin: "B000000001",
    title: "Example Product",
    brand: "Example",
    price: { current: 49.99, currency: "USD" },
    rating: 4.4,
    reviewCount: 123,
    features: [],
    imageUrl: "",
    affiliateUrl: "https://www.amazon.com/dp/B000000001?tag=example-20",
    category: "tech",
    isPrime: true,
    availability: "In stock",
  }]).then((result) => console.log(result));
}
