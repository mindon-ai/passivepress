# PassivePress Plan — Replace Amazon PA API with RainforestAPI

> Goal: use RainforestAPI as the Amazon product-data provider for PassivePress while preserving the existing affiliate pipeline shape, Convex schema, affiliate placeholder resolver, click tracking, and frontend rendering.

## 1. Why This Change

Amazon PA API credentials are not available right now. PassivePress still needs structured Amazon product data for:

- product search by keyword/query
- product detail lookup by ASIN
- price/rating/review count extraction
- product image and feature bullets
- Prime/availability flags when available
- affiliate URLs with the configured Amazon associate tag
- product cache population
- Writer placeholders and AffiliateLinker metadata

RainforestAPI can supply that data through simple GET requests using a single API key.

## 2. Current State to Preserve

Existing PassivePress pipeline stages already expect this internal shape:

```ts
interface AmazonProduct {
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
```

Keep this internal type name for now to minimize churn, even though the provider becomes RainforestAPI. A later cleanup can rename it to `AffiliateProduct` or `AmazonProductData`.

Files currently involved:

- `agents/lib/amazon-pa-api.ts` — replace or wrap with RainforestAPI implementation.
- `agents/agents/3-product-researcher.ts` — keep stage behavior, update imports/function names if needed.
- `agents/lib/affiliate-utils.ts` — keep affiliate URL builder.
- `agents/lib/convex-client.ts` — product cache and public affiliate settings.
- `convex/productCache.ts` and schema — keep cache table.
- `agents/types/pipeline.ts` — keep `AmazonProduct` and `ProductResearchData` initially.
- `agents/skills/product-researcher.md` — update provider instructions.
- Admin affiliate settings UI — add RainforestAPI public/non-secret settings only if useful.

## 3. New Environment Variables

Add to `agents/.env.example` and operator-managed `agents/.env`:

```bash
# RainforestAPI
RAINFOREST_API_KEY=your-rainforest-api-key
RAINFOREST_AMAZON_DOMAIN=amazon.com
RAINFOREST_CUSTOMER_LOCATION=
RAINFOREST_CUSTOMER_ZIPCODE=
RAINFOREST_LANGUAGE=
RAINFOREST_CURRENCY=USD
RAINFOREST_REQUEST_TIMEOUT_MS=30000

# Amazon affiliate links
AMAZON_ASSOCIATE_TAG=yourstore-20
AMAZON_MARKETPLACE=www.amazon.com
```

Deprecate for PassivePress runtime:

```bash
AMAZON_ACCESS_KEY=
AMAZON_SECRET_KEY=
AMAZON_REGION=
```

Do not remove deprecated vars immediately; leave backward-compatible comments so existing env files do not break unexpectedly.

## 4. RainforestAPI Client Design

Create a new provider module:

```txt
agents/lib/rainforest-api.ts
```

Recommended exports:

```ts
export interface RainforestSearchResult {
  asin: string;
  title: string;
}

export async function searchItems(
  keywords: string,
  searchIndex?: string,
  itemCount?: number,
): Promise<RainforestSearchResult[]>;

export async function getItems(asins: string[]): Promise<AmazonProduct[]>;

export async function getProduct(asin: string): Promise<AmazonProduct | null>;
```

Keep `searchItems()` and `getItems()` export names so `3-product-researcher.ts` can switch imports with minimal changes.

### Request helper

All requests use:

```txt
GET https://api.rainforestapi.com/request
```

Base helper:

```ts
async function rainforestRequest<T>(params: Record<string, string | number | boolean | undefined>): Promise<T>
```

Always include:

- `api_key`
- `type`
- `amazon_domain`
- `output=json`
- optional `associate_id` when `AMAZON_ASSOCIATE_TAG` is set
- optional location/language/currency settings

Validation:

- Throw clear error if `RAINFOREST_API_KEY` is missing.
- Throw if `request_info.success === false`.
- Include HTTP status and Rainforest error message in thrown errors.
- Use timeout via `AbortController`.

## 5. Search Mapping

Rainforest search request:

```txt
type=search
amazon_domain=amazon.com
search_term=<query>
sort_by=average_review
page=1
fields=search_results.asin,search_results.title,search_results.link,search_results.rating,search_results.ratings_total,search_results.price,search_results.image,search_results.is_prime,search_results.sponsored,search_results.categories
```

Filtering rules:

- Drop sponsored results when there are enough organic results.
- Require `asin` and `title`.
- Prefer products with:
  - rating >= 4 when available
  - ratings_total > 50 when available
  - price present when available
  - not obviously irrelevant to query
- Return top `itemCount` ASIN/title pairs.

Rainforest `search_results[]` to internal search result:

```ts
{
  asin: result.asin,
  title: result.title,
}
```

Potential future improvement: if search result fields already contain sufficient data, use them as partial product records before calling `type=product`, reducing credits.

## 6. Product Mapping

Rainforest product request:

```txt
type=product
amazon_domain=amazon.com
asin=<ASIN>
fields=product.asin,product.title,product.brand,product.rating,product.ratings_total,product.price,product.buybox_winner,product.images,product.feature_bullets,product.specifications,product.categories,product.bestsellers_rank,product.description,product.main_image,request_metadata.amazon_url
```

Map `data.product` to `AmazonProduct`:

```ts
const price = product.price ?? product.buybox_winner?.price;

{
  asin: product.asin,
  title: product.title,
  brand: product.brand ?? "",
  price: {
    current: price?.value ?? 0,
    currency: price?.currency ?? process.env.RAINFOREST_CURRENCY ?? "USD",
  },
  rating: product.rating ?? 0,
  reviewCount: product.ratings_total ?? 0,
  features: product.feature_bullets ?? [],
  imageUrl: product.main_image?.link ?? product.images?.[0]?.link ?? product.images?.[0] ?? "",
  affiliateUrl: product.linkWithAssociateId ?? product.link ?? request_metadata.amazon_url ?? buildAmazonAffiliateUrl(asin),
  category: product.categories?.at(-1)?.name ?? product.categories?.at(-1) ?? "",
  isPrime: Boolean(product.buybox_winner?.is_prime),
  availability: product.buybox_winner?.availability?.raw ?? product.availability?.raw ?? "Check Amazon for current availability",
}
```

Affiliate URL rules:

1. If Rainforest returns a link and `associate_id` was supplied, prefer that returned link.
2. If no usable link exists, call existing `buildAmazonAffiliateUrl(asin)`.
3. Do not cloak links. Keep normal Amazon `/dp/ASIN?tag=...` links.

## 7. Optional Reviews Support

Do not add reviews to the first migration unless needed for quality.

Future optional stage:

```txt
type=reviews
asin=<ASIN>
review_stars=all_critical
review_sort=most_recent
filter_by_reviewer=verified_purchases
```

Use only for Writer pros/cons and common complaints. Keep review body snippets out of final content unless summarized carefully.

## 8. Optional Bestseller/Deals Support

After the base search/product migration works, update TrendScout to optionally use Rainforest:

- `type=bestsellers` for product trend discovery
- `type=deals` for deal-focused posts
- `type=autocomplete` for query expansion

Do this later to avoid changing too many stages at once.

Recommended category mapping for future Rainforest category IDs:

```ts
const RAINFOREST_CATEGORY_IDS = {
  tech: ["172282"],              // Electronics
  "home-appliances": ["1055398"], // Home & Kitchen rough starting point; verify
  fitness: ["3375251"],          // Sports & Outdoors rough starting point; verify
  outdoors: ["3375251"],
  kitchen: ["284507"],
};
```

Verify IDs via Rainforest Categories API before use:

```txt
GET https://api.rainforestapi.com/categories?api_key=KEY&amazon_domain=amazon.com
```

## 9. Cache Strategy

Keep existing Convex `productCache` table.

Cache key remains ASIN.

TTL:

- Default: 24 hours.
- Config: existing `PRODUCT_CACHE_TTL_HOURS` or affiliate settings `cacheTtlHours`.

Cache only normalized `AmazonProduct` objects, not raw Rainforest payloads, unless raw debugging is explicitly needed.

## 10. ProductResearcher Flow After Migration

Current `3-product-researcher.ts` should become:

1. Normalize target product queries.
2. For each query, call Rainforest `searchItems(query, searchIndex, 3)`.
3. Deduplicate ASINs.
4. Load fresh cached products from Convex.
5. Fetch missing ASINs using Rainforest `getItems(missingAsins)`.
6. Cache fresh products.
7. Continue web research best-effort.
8. Return `ProductResearchData` as before.

Fallback behavior:

- If `RAINFOREST_API_KEY` is missing, keep current placeholder fallback for dry runs only.
- In live publish mode, consider failing hard instead of publishing placeholder product data. This avoids creating fake affiliate posts.

Recommended future config:

```bash
ALLOW_PLACEHOLDER_PRODUCTS_IN_LIVE=false
```

## 11. Admin Settings Updates

Current admin affiliate settings store Amazon associate tag/public cache settings.

Add only non-secret provider settings to admin if useful:

- `provider`: `rainforestapi`
- `amazonDomain`: `amazon.com`
- `currency`: `USD`
- `cacheTtlHours`: existing

Do not store `RAINFOREST_API_KEY` in Convex/admin UI unless encrypted secret storage is added. Keep it in environment variables.

## 12. Prompt/Skill Updates

Update:

```txt
agents/skills/product-researcher.md
agents/skills/writer-affiliate.md
agents/skills/affiliate-linker.md
```

Main wording changes:

- Replace “Amazon PA API” with “RainforestAPI-backed Amazon product data”.
- Tell Writer that product facts come from normalized Rainforest data.
- Keep rule: never fabricate specs, prices, ratings, availability, review counts, or Prime status.
- Mention prices are cached at publish time and may vary.

## 13. Legal/Compliance Notes

Using RainforestAPI does not remove affiliate/compliance requirements:

- FTC affiliate disclosure must appear before affiliate links.
- Links must be normal Amazon affiliate URLs with `tag=`.
- Prices must include “price may vary” copy.
- Avoid saying “live price” unless it is refreshed at render time. Current system is cached-at-publish-time.
- Do not claim PA API official status if using RainforestAPI.

## 14. Testing Plan

### Unit/targeted tests

Add or run targeted tests for:

- Rainforest search response normalization.
- Rainforest product response normalization.
- Missing price handling.
- Missing image handling.
- Returned affiliate URL includes associate tag.
- Product cache read/write still works.

Suggested new script:

```json
"test:rainforest": "tsx lib/rainforest-api.ts"
```

Standalone smoke command:

```bash
cd /home/el/projects/passivepress/agents
RAINFOREST_API_KEY=... AMAZON_ASSOCIATE_TAG=... pnpm exec tsx lib/rainforest-api.ts "Sony WH-1000XM5"
```

### Pipeline dry run

```bash
cd /home/el/projects/passivepress/agents
pnpm run dry-run
```

Acceptance criteria:

- ProductResearcher logs Rainforest products loaded, not placeholder fallback.
- `products.length > 0`.
- prices, ratings, review counts, images populate when available.
- Writer uses real product names/ASIN placeholders.
- AffiliateLinker resolves all placeholders.
- no unresolved `{{PRODUCT...}}`, `{{PRICE...}}`, `{{BUY_BUTTON...}}`, or `{{AFFILIATE_TABLE...}}` remains.

### Live publish gate

Before first live post:

- `RAINFOREST_API_KEY` set.
- `AMAZON_ASSOCIATE_TAG` set.
- Convex deploy key fixed for `blessed-clam-266`.
- Convex functions deployed.
- Frontend deployed.
- Browser click tracking verified.

## 15. Implementation Order

1. Add env docs to `agents/.env.example`.
2. Add `agents/lib/rainforest-api.ts`.
3. Change `3-product-researcher.ts` imports from `amazon-pa-api.ts` to `rainforest-api.ts`.
4. Keep old `amazon-pa-api.ts` temporarily but mark deprecated.
5. Update product researcher skill docs.
6. Run `pnpm exec tsc --noEmit`.
7. Run Rainforest standalone smoke test with real key.
8. Run full dry run.
9. Inspect generated article quality.
10. Deploy once Convex deploy key is corrected.
11. Run first live post.

## 16. Rollback Plan

Because the internal `AmazonProduct` shape remains unchanged, rollback is simple:

- Revert `3-product-researcher.ts` import to `amazon-pa-api.ts`.
- Keep product cache table unchanged.
- Keep AffiliateLinker/frontend unchanged.

## 17. Open Questions

- Should live publishing fail if RainforestAPI is unavailable, or allow placeholder products? Recommended: fail live, allow placeholders only in dry-run.
- Should TrendScout use Rainforest bestsellers/deals immediately, or only after base ProductResearcher migration? Recommended: base migration first.
- Which Amazon domains/currencies are primary? Default to `amazon.com` + `USD` unless operator chooses otherwise.
- Should reviews be fetched for every product? Recommended: no initially, because it increases credit usage.

## 18. Definition of Done

The RainforestAPI migration is complete when:

- `agents/lib/rainforest-api.ts` maps search/product responses into existing `AmazonProduct` objects.
- ProductResearcher uses RainforestAPI successfully with a real key.
- Full dry run produces real product names, ASINs, prices, ratings, images, and affiliate links.
- Product cache stores normalized Rainforest product data.
- No Amazon PA API credentials are required for normal operation.
- Build, tests, and agent TypeScript checks pass.
- First live PassivePress post can publish without placeholder product data.
