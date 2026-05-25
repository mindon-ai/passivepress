import { useEffect } from "react";

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
  author?: string;
  keywords?: string[];
  jsonLd?: Record<string, unknown>;
}

const setMeta = (selector: string, attr: string, value: string) => {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    const [, key, name] = selector.match(/\[(.+?)="(.+?)"\]/) || [];
    if (key && name) el.setAttribute(key, name);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
};

export const SEO = ({ title, description, canonical, image, type = "website", publishedTime, author, keywords, jsonLd }: SEOProps) => {
  useEffect(() => {
    const fullTitle = title.length > 60 ? title.slice(0, 57) + "…" : title;
    document.title = fullTitle;

    const url = canonical || window.location.href;
    const absoluteImage = image
      ? image.startsWith("http://") || image.startsWith("https://")
        ? image
        : new URL(image, window.location.origin).toString()
      : undefined;

    setMeta('meta[name="description"]', "content", description.slice(0, 160));
    if (keywords?.length) setMeta('meta[name="keywords"]', "content", keywords.join(", "));

    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description.slice(0, 160));
    setMeta('meta[property="og:type"]', "content", type);
    if (absoluteImage) setMeta('meta[property="og:image"]', "content", absoluteImage);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description.slice(0, 160));
    setMeta('meta[name="twitter:card"]', "content", absoluteImage ? "summary_large_image" : "summary");
    if (absoluteImage) setMeta('meta[name="twitter:image"]', "content", absoluteImage);

    let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", url);
    setMeta('meta[property="og:url"]', "content", url);

    if (publishedTime) setMeta('meta[property="article:published_time"]', "content", publishedTime);
    if (author) setMeta('meta[property="article:author"]', "content", author);

    // JSON-LD
    const existing = document.getElementById("page-jsonld");
    if (existing) existing.remove();
    if (jsonLd) {
      const script = document.createElement("script");
      script.id = "page-jsonld";
      script.type = "application/ld+json";
      script.text = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
  }, [title, description, canonical, image, type, publishedTime, author, keywords, JSON.stringify(jsonLd)]);

  return null;
};
