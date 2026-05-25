import fs from "node:fs/promises";
import path from "node:path";

async function loadEnvFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equalsIndex = line.indexOf("=");
      if (equalsIndex === -1) continue;

      const key = line.slice(0, equalsIndex).trim();
      const value = line.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

await loadEnvFile(path.resolve(".env"));
await loadEnvFile(path.resolve(".env.local"));

// Prefer the cloud Convex URL so the script works without a local dev server.
// Priority: CONVEX_URL env > VITE_CONVEX_URL (from .env.local) > localhost fallback.
const CONVEX_URL = (
  process.env.CONVEX_URL
  ?? process.env.VITE_CONVEX_URL
  ?? "http://127.0.0.1:3210"
).replace(/\/$/, "");

// SITE_URL is read from VITE_SITE_URL in .env.local so the generated sitemap
// uses the correct public domain (e.g. https://passivepress.qzz.io).
const SITE_URL = (
  process.env.SITE_URL
  ?? process.env.VITE_SITE_URL
  ?? "https://passivepress.qzz.io"
).replace(/\/$/, "");

async function convexQuery(fnPath, args = {}) {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: fnPath,
      args,
      format: "json",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Convex query failed [${response.status}]: ${text}`);
  }

  const data = await response.json();
  return data.value;
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unique(values) {
  return [...new Set(values)];
}

async function main() {
  const [posts, categories] = await Promise.all([
    convexQuery("posts:listPublished", {}),
    convexQuery("categories:listAll", {}),
  ]);

  // Static pages (no /post/ prefix — posts live at root /:slug per the current routing).
  const urls = unique([
    `${SITE_URL}/`,
    `${SITE_URL}/about`,
    `${SITE_URL}/privacy`,
    `${SITE_URL}/terms`,
    `${SITE_URL}/sitemap`,
    ...categories.map((category) => `${SITE_URL}/category/${category.slug}`),
    // Posts are served at /<slug>, NOT /post/<slug>.
    ...posts.map((post) => `${SITE_URL}/${post.slug}`),
  ]);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")
    + `\n</urlset>\n`;

  const outputPath = path.resolve("public/sitemap.xml");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, xml, "utf8");

  console.log(`Generated ${outputPath}`);
  console.log(`URLs: ${urls.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
