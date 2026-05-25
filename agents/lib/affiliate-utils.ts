import type { AffiliateLink, AmazonProduct } from "../types/pipeline.ts";

export function buildAmazonAffiliateUrl(asin: string, associateTag = process.env.AMAZON_ASSOCIATE_TAG ?? "", marketplace = process.env.AMAZON_MARKETPLACE ?? "www.amazon.com"): string {
  const cleanAsin = asin.trim().toUpperCase();
  const host = marketplace.trim() || "www.amazon.com";
  const url = new URL(`https://${host}/dp/${encodeURIComponent(cleanAsin)}`);
  if (associateTag.trim()) url.searchParams.set("tag", associateTag.trim());
  return url.toString();
}

export function formatPrice(product?: AmazonProduct): string {
  if (!product?.price || typeof product.price.current !== "number" || product.price.current <= 0) {
    return "See price";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: product.price.currency || "USD",
    }).format(product.price.current);
  } catch {
    return `${product.price.currency || "$"}${product.price.current.toFixed(2)}`;
  }
}

function escapePipes(value: string): string {
  return value.replace(/\|/g, "\\|").trim();
}

function productByAsin(products: AmazonProduct[]): Map<string, AmazonProduct> {
  return new Map(products.map((product) => [product.asin.toUpperCase(), product]));
}

function metadataFor(product: AmazonProduct | undefined, asin: string, type: AffiliateLink["placeholderType"], position: number): AffiliateLink {
  const affiliateUrl = product?.affiliateUrl || buildAmazonAffiliateUrl(asin);
  return {
    asin: asin.toUpperCase(),
    productTitle: product?.title || asin.toUpperCase(),
    affiliateUrl,
    placeholderType: type,
    positionInContent: position,
    priceAtPublish: product?.price?.current,
    currencyAtPublish: product?.price?.currency,
  };
}

export function resolveAffiliatePlaceholders(content: string, products: AmazonProduct[]): { content: string; affiliateLinks: AffiliateLink[] } {
  const productsMap = productByAsin(products);
  const affiliateLinks: AffiliateLink[] = [];

  const resolved = content.replace(/\{\{(PRODUCT|AFFILIATE_TABLE|BUY_BUTTON|PRICE):([^}]+)\}\}/g, (match, rawType: string, rawPayload: string, offset: number) => {
    const type = rawType as "PRODUCT" | "AFFILIATE_TABLE" | "BUY_BUTTON" | "PRICE";

    if (type === "AFFILIATE_TABLE") {
      const asins = rawPayload.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
      const rows = asins.map((asin) => {
        const product = productsMap.get(asin);
        affiliateLinks.push(metadataFor(product, asin, "table", offset));
        const title = escapePipes(product?.title || asin);
        const price = formatPrice(product);
        const rating = product?.rating ? `${product.rating.toFixed(1)} / 5` : "—";
        const url = product?.affiliateUrl || buildAmazonAffiliateUrl(asin);
        return `| ${title} | ${price} | ${rating} | [Check price](${url}) |`;
      });
      return [
        "| Product | Price | Rating | Buy |",
        "|---|---:|---:|---|",
        ...rows,
        "",
        "_Prices are cached at publish time and may vary on Amazon._",
      ].join("\n");
    }

    const [asinRaw, ...rest] = rawPayload.split(":");
    const asin = (asinRaw || "").trim().toUpperCase();
    if (!asin) return match;
    const product = productsMap.get(asin);

    if (type === "PRODUCT") {
      const label = rest.join(":").trim() || product?.title || asin;
      affiliateLinks.push(metadataFor(product, asin, "inline", offset));
      return `[${label}](${product?.affiliateUrl || buildAmazonAffiliateUrl(asin)})`;
    }

    if (type === "BUY_BUTTON") {
      const label = rest.join(":").trim() || "Check price on Amazon";
      affiliateLinks.push(metadataFor(product, asin, "cta", offset));
      const url = product?.affiliateUrl || buildAmazonAffiliateUrl(asin);
      return `\n\n@@AFFILIATE_CTA:${asin}:${encodeURIComponent(label)}:${encodeURIComponent(url)}@@\n\n`;
    }

    if (type === "PRICE") {
      affiliateLinks.push(metadataFor(product, asin, "price", offset));
      return formatPrice(product);
    }

    return match;
  });

  return { content: resolved, affiliateLinks };
}
