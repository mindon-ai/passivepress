export function buildCanonicalArticleUrl(siteUrl: string, slug: string): string {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, "");
  const normalizedSlug = slug.replace(/^\/+/, "");
  return `${normalizedSiteUrl}/${normalizedSlug}`;
}
