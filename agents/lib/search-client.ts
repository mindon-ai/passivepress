// Web search client using Serper.dev (Google Search API)
import "dotenv/config";
import { fetchWithTimeout } from "./http-utils.ts";

const SERPER_API_KEY = process.env.SERPER_API_KEY ?? "";

export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

export interface HNStory {
  title: string;
  url: string;
  points: number;
  created_at: string;
}

export interface RedditPost {
  title: string;
  url: string;
  score: number;
  created_utc: number;
  subreddit: string;
}

export interface ArxivPaper {
  title: string;
  link: string;
  summary: string;
  published: string;
}

/**
 * Search Google via Serper.dev.
 */
export async function searchGoogle(
  query: string,
  options: { num?: number; tbs?: string } = {}
): Promise<SerperResult[]> {
  const response = await fetchWithTimeout("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: options.num ?? 10,
      tbs: options.tbs ?? "qdr:d", // last 24h by default
    }),
  }, 10_000);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Serper search failed [${response.status}]: ${text}`);
  }

  const data = (await response.json()) as {
    organic?: Array<{
      title: string;
      link: string;
      snippet: string;
      date?: string;
    }>;
  };

  return (data.organic ?? []).map((item) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
    date: item.date,
  }));
}

/**
 * Fetch trending AI stories from Hacker News via Algolia API.
 */
export async function fetchHackerNews(
  query: string,
  hoursBack = 24,
  options: { minPoints?: number; resultsPerPage?: number } = {}
): Promise<HNStory[]> {
  const cutoff = Math.floor(Date.now() / 1000) - hoursBack * 3600;
  const minPoints = options.minPoints ?? 5;
  const resultsPerPage = options.resultsPerPage ?? 20;
  const url =
    `https://hn.algolia.com/api/v1/search?` +
    `query=${encodeURIComponent(query)}` +
    `&tags=story` +
    `&hitsPerPage=${resultsPerPage}` +
    `&numericFilters=created_at_i>${cutoff},points>${minPoints}`;

  const response = await fetchWithTimeout(url, {}, 10_000);
  if (!response.ok) {
    throw new Error(`HN API failed [${response.status}]`);
  }

  const data = (await response.json()) as {
    hits: Array<{
      title: string;
      url: string;
      points: number;
      created_at: string;
    }>;
  };

  return (data.hits ?? [])
    .filter((hit) => hit.url && hit.title)
    .map((hit) => ({
      title: hit.title,
      url: hit.url,
      points: hit.points ?? 0,
      created_at: hit.created_at,
    }));
}

/**
 * Fetch top posts from a subreddit via the JSON API (no auth needed).
 */
export async function fetchSubreddit(
  subreddit: string,
  timeframe: "day" | "week" = "day",
  limit = 10
): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?t=${timeframe}&limit=${limit}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "PassivePressBot/1.0 (affiliate product research)",
    },
  }, 10_000);

  if (!response.ok) {
    throw new Error(`Reddit API failed for r/${subreddit} [${response.status}]`);
  }

  const data = (await response.json()) as {
    data: {
      children: Array<{
        data: {
          title: string;
          url: string;
          score: number;
          created_utc: number;
          subreddit: string;
          permalink: string;
          is_self: boolean;
          selftext?: string;
        };
      }>;
    };
  };

  return (data.data?.children ?? []).map((child) => ({
    title: child.data.title,
    // Always point to the Reddit discussion thread so the Writer agent gets
    // community context rather than an external article URL that may be
    // paywalled or unavailable.
    url: `https://www.reddit.com${child.data.permalink}`,
    score: child.data.score,
    created_utc: child.data.created_utc,
    subreddit: child.data.subreddit,
  }));
}

/**
 * Fetch latest papers from arXiv RSS feed (cs.AI category).
 */
export async function fetchArxivRSS(category = "cs.AI"): Promise<ArxivPaper[]> {
  const safeCategory = category.trim() || "cs.AI";
  const url = `https://export.arxiv.org/rss/${encodeURIComponent(safeCategory)}`;

  const response = await fetchWithTimeout(url, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  }, 10_000);

  if (!response.ok) {
    throw new Error(`arXiv RSS failed [${response.status}]`);
  }

  const text = await response.text();

  // Simple regex-based RSS parsing (no DOM parser in Node.js by default)
  const items: ArxivPaper[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(text)) !== null) {
    const item = match[1];
    const title = extractTag(item, "title");
    const link = extractTag(item, "link") || extractTag(item, "guid");
    const summary = extractTag(item, "description");
    const pubDate = extractTag(item, "pubDate");

    if (title && link) {
      items.push({
        title: stripHtml(title),
        link,
        summary: stripHtml(summary ?? ""),
        published: pubDate ?? "",
      });
    }
  }

  return items.slice(0, 20);
}

function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i"));
  return match?.[1]?.trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
