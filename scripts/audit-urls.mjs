/**
 * audit-urls.mjs
 * Fetches all published posts from Convex and scans for external URLs in content.
 * Flags URLs by category: download extensions, suspicious TLDs, shortened URLs, etc.
 */

const CONVEX_URL = (process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "https://blessed-clam-266.convex.cloud").replace(/\/$/, "");

// Regex to extract all http/https URLs from markdown content
const URL_REGEX = /https?:\/\/[^\s\)\]\'"<>]+/gi;

// Known safe domains (no need to flag these)
const SAFE_DOMAINS = [
  "arxiv.org",
  "github.com",
  "openai.com",
  "anthropic.com",
  "google.com",
  "deepmind.com",
  "huggingface.co",
  "meta.com",
  "microsoft.com",
  "nature.com",
  "sciencedirect.com",
  "proceedings.neurips.cc",
  "paperswithcode.com",
  "semanticscholar.org",
  "doi.org",
  "ieee.org",
  "acm.org",
  "youtube.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "reddit.com",
  "techcrunch.com",
  "wired.com",
  "theverge.com",
  "arstechnica.com",
  "venturebeat.com",
  "towardsdatascience.com",
  "medium.com",
  "wikipedia.org",
  "passivepress.qzz.io",
  "convex.cloud",
  "convex.site",
  "googletagmanager.com",
  "googleapis.com",
];

// Suspicious patterns
const SUSPICIOUS_EXTENSIONS = /\.(exe|dmg|apk|msi|bat|sh|ps1|deb|rpm|pkg|zip|rar|7z|tar\.gz|jar|dll|sys|vbs|scr|pif|cmd|com|gadget)(\?|$)/i;
const SUSPICIOUS_TLDS = /\.(tk|ml|ga|cf|gq|pw|top|xyz|click|download|loan|win|bid|stream|review|accountant|science|date|faith|racing|party|trade|webcam|country|kim|men|accountant|work|link|ws|cc|su)\b/i;
const URL_SHORTENERS = /^https?:\/\/(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|buff\.ly|ift\.tt|dlvr\.it|short\.io|rb\.gy|cutt\.ly|is\.gd|v\.gd|0\.fyi|tr\.im|mcaf\.ee)\//i;
const IP_BASED_URL = /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isSafe(url) {
  const domain = getDomain(url);
  if (!domain) return false;
  return SAFE_DOMAINS.some((safe) => domain === safe || domain.endsWith("." + safe));
}

function classifyUrl(url) {
  const flags = [];
  if (SUSPICIOUS_EXTENSIONS.test(url)) flags.push("DOWNLOAD_EXTENSION");
  if (SUSPICIOUS_TLDS.test(url)) flags.push("SUSPICIOUS_TLD");
  if (URL_SHORTENERS.test(url)) flags.push("URL_SHORTENER");
  if (IP_BASED_URL.test(url)) flags.push("IP_BASED");
  return flags;
}

async function fetchAllPosts() {
  // Use Convex HTTP query API
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "posts:listPublished",
      args: {},
      format: "json",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex query failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.value ?? data;
}

async function fetchPostContent(slug) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "posts:getBySlug",
      args: { slug },
      format: "json",
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.value ?? data;
}

async function main() {
  console.log("Fetching published posts from Convex...\n");

  let posts;
  try {
    posts = await fetchAllPosts();
  } catch (err) {
    console.error("ERROR fetching posts:", err.message);
    process.exit(1);
  }

  if (!Array.isArray(posts)) {
    console.log("Raw response:", JSON.stringify(posts, null, 2));
    process.exit(1);
  }

  console.log(`Found ${posts.length} published posts.\n`);

  const allUrls = new Map(); // url -> [{slug, context}]
  const flaggedUrls = new Map(); // url -> {flags, posts}
  const unknownDomains = new Map(); // domain -> [{slug, url}]

  for (const postCard of posts) {
    const slug = postCard.slug;
    process.stdout.write(`  Scanning: ${slug} ... `);

    const post = await fetchPostContent(slug);
    if (!post) {
      console.log("SKIP (not found)");
      continue;
    }

    const content = [
      post.content ?? "",
      post.excerpt ?? "",
    ].join("\n");

    const urls = [...new Set(content.match(URL_REGEX) ?? [])];
    console.log(`${urls.length} URLs`);

    for (const url of urls) {
      // Track all
      if (!allUrls.has(url)) allUrls.set(url, []);
      allUrls.get(url).push(slug);

      // Skip known safe
      if (isSafe(url)) continue;

      // Classify flags
      const flags = classifyUrl(url);
      if (flags.length > 0) {
        if (!flaggedUrls.has(url)) flaggedUrls.set(url, { flags, slugs: [] });
        flaggedUrls.get(url).slugs.push(slug);
      } else {
        // Unknown domain — not flagged but not in safe list
        const domain = getDomain(url);
        if (domain) {
          if (!unknownDomains.has(domain)) unknownDomains.set(domain, []);
          unknownDomains.get(domain).push({ slug, url });
        }
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("AUDIT RESULTS");
  console.log("=".repeat(60));

  if (flaggedUrls.size === 0) {
    console.log("\n[CLEAR] No URLs with suspicious flags found.");
  } else {
    console.log(`\n[!!! FLAGGED URLS - ${flaggedUrls.size} total !!!]`);
    for (const [url, { flags, slugs }] of flaggedUrls) {
      console.log(`\n  URL:   ${url}`);
      console.log(`  Flags: ${flags.join(", ")}`);
      console.log(`  Posts: ${slugs.join(", ")}`);
    }
  }

  console.log("\n" + "-".repeat(60));
  console.log(`UNKNOWN DOMAINS (not in safe list, not flagged) — ${unknownDomains.size} unique domains`);
  console.log("-".repeat(60));

  const sortedUnknown = [...unknownDomains.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [domain, refs] of sortedUnknown) {
    console.log(`\n  ${domain}  (${refs.length} link${refs.length > 1 ? "s" : ""})`);
    for (const { slug, url } of refs.slice(0, 3)) {
      const shortUrl = url.length > 90 ? url.slice(0, 90) + "..." : url;
      console.log(`    [${slug}]  ${shortUrl}`);
    }
    if (refs.length > 3) console.log(`    ... and ${refs.length - 3} more`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`SUMMARY: ${allUrls.size} unique URLs | ${flaggedUrls.size} flagged | ${unknownDomains.size} unknown domains`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
