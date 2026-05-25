/**
 * extensions/search-tools.ts
 * Typed tool definitions for all web search and data-fetching operations.
 *
 * Wraps the existing lib/search-client.ts into a clean, typed interface
 * that can be called directly by agents or registered as pi tools in Phase 3.
 *
 * Direct usage:
 *   import { searchAI, fetchArxiv, fetchHN } from "./extensions/search-tools.ts";
 */

import {
  searchGoogle,
  fetchHackerNews,
  fetchSubreddit,
  fetchArxivRSS,
} from "../lib/search-client.ts";

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  source: string;
}

export interface HNStory {
  title: string;
  url: string;
  points: number;
  created_at: string;
}

export interface ArxivPaper {
  title: string;
  link: string;
  published: string;
  summary: string;
}

// ─── Tool: search_ai_news ─────────────────────────────────────────────────────

/**
 * Search for recent AI news articles via Serper/Google.
 * Scoped to top-tier tech outlets by default.
 */
export async function searchAINews(
  query: string,
  options: { num?: number; daysBack?: number } = {}
): Promise<SearchResult[]> {
  const { num = 15, daysBack = 1 } = options;
  const tbs = daysBack <= 1 ? "qdr:d" : daysBack <= 7 ? "qdr:w" : "qdr:m";
  const results = await searchGoogle(query, { num, tbs });
  return results.map((r) => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet ?? "",
    source: (() => {
      try { return new URL(r.link).hostname.replace("www.", ""); }
      catch { return r.link; }
    })(),
  }));
}

// ─── Tool: search_technical ───────────────────────────────────────────────────

/**
 * Search for technical content (papers, GitHub repos, benchmarks).
 * Adds arXiv and GitHub to the query scope.
 */
export async function searchTechnical(
  query: string,
  options: { num?: number; queryScope?: string } = {}
): Promise<SearchResult[]> {
  const { num = 10, queryScope = "site:arxiv.org OR site:github.com OR site:huggingface.co OR site:paperswithcode.com" } = options;
  const scopedQuery = queryScope.trim() ? `${query} ${queryScope}` : query;
  const results = await searchGoogle(scopedQuery, { num });
  return results.map((r) => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet ?? "",
    source: (() => {
      try { return new URL(r.link).hostname.replace("www.", ""); }
      catch { return r.link; }
    })(),
  }));
}

// ─── Tool: fetch_hacker_news ──────────────────────────────────────────────────

/**
 * Fetch top AI/ML stories from Hacker News algolia API.
 * @param withinHours  Only return stories published within this many hours (default 48)
 */
export async function fetchHN(
  query: string,
  withinHours = 48
): Promise<HNStory[]> {
  const stories = await fetchHackerNews(query, withinHours);
  return stories.map((s) => ({
    title: s.title,
    url: s.url,
    points: s.points,
    created_at: s.created_at,
  }));
}

// ─── Tool: fetch_arxiv ────────────────────────────────────────────────────────

/**
 * Fetch the latest papers from arXiv cs.AI/cs.CL RSS feed.
 */
export async function fetchArxiv(): Promise<ArxivPaper[]> {
  const papers = await fetchArxivRSS();
  return papers.map((p) => ({
    title: p.title,
    link: p.link,
    published: p.published,
    summary: p.summary ?? "",
  }));
}

// ─── Tool: fetch_subreddit ────────────────────────────────────────────────────

/**
 * Fetch top posts from a subreddit.
 * @param subreddit   e.g. "MachineLearning"
 * @param timeframe   "day" | "week" | "month"
 * @param limit       max posts (default 8)
 */
export async function fetchReddit(
  subreddit: string,
  timeframe: "day" | "week" | "month" = "day",
  limit = 8
): Promise<{ title: string; url: string; score: number; created_utc: number }[]> {
  const apiTimeframe: "day" | "week" = timeframe === "month" ? "week" : timeframe;
  const posts = await fetchSubreddit(subreddit, apiTimeframe, limit);
  return posts.map((p) => ({
    title: p.title,
    url: p.url,
    score: p.score,
    created_utc: p.created_utc,
  }));
}

// ─── Pi extension stub (Phase 3) ──────────────────────────────────────────────
// Replace with:
// export default function searchExtension(pi: ExtensionAPI) {
//   pi.registerTool({ name: "search_ai_news", ... });
//   pi.registerTool({ name: "search_technical", ... });
//   pi.registerTool({ name: "fetch_hacker_news", ... });
//   pi.registerTool({ name: "fetch_arxiv", ... });
// }
