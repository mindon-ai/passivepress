import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/sitemap.xml",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const posts = await ctx.runQuery(api.posts.listPublished, { limit: 1000 });
    const categories = await ctx.runQuery(api.categories.listAll, {});

    // Use SITE_URL env var (set in Convex dashboard) so the sitemap uses the real
    // public domain rather than the convex.site origin of the request.
    const siteUrl = (process.env.SITE_URL ?? "https://passivepress.qzz.io").replace(/\/$/, "");

    const entries = [
      `${siteUrl}/`,
      `${siteUrl}/about`,
      `${siteUrl}/privacy`,
      `${siteUrl}/terms`,
      `${siteUrl}/sitemap`,
      ...categories.map((category) => `${siteUrl}/category/${category.slug}`),
      // Posts live at /<slug> (root), NOT /post/<slug>.
      ...posts.map((post) => `${siteUrl}/${post.slug}`),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      entries.map((entry) => `  <url><loc>${entry}</loc></url>`).join("\n") +
      `\n</urlset>\n`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }),
});

/**
 * POST /agent/publish
 * Called by the external Node.js agent pipeline to publish AI-generated posts.
 * Protected by a shared secret header (x-agent-secret).
 */
http.route({
  path: "/api/track-click",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

http.route({
  path: "/api/track-click",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let body: { asin?: string; postSlug?: string; referrer?: string };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    if (!body.asin || !body.postSlug) {
      return new Response(JSON.stringify({ error: "Missing asin or postSlug" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    const result = await ctx.runMutation(api.affiliateLinks.trackClick, {
      asin: body.asin,
      postSlug: body.postSlug,
      referrer: body.referrer,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }),
});

http.route({
  path: "/agent/publish",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verify shared secret
    const secret = request.headers.get("x-agent-secret");
    const expectedSecret = process.env.AGENT_SECRET ?? "passivepress-agent-secret";

    if (!secret || secret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: {
      slug: string;
      title: string;
      excerpt: string | null;
      content: string;
      featured_image: string | null;
      featured_image_storage_id?: string | null;
      featured_image_alt: string | null;
      meta_title: string | null;
      meta_description: string | null;
      keywords: string[];
      category_id: string | null;
      reading_time: number;
      affiliateLinks?: Array<{
        asin: string;
        productTitle: string;
        affiliateUrl: string;
        placeholderType: "inline" | "table" | "cta" | "price";
        positionInContent?: number;
        priceAtPublish?: number;
        currencyAtPublish?: string;
      }>;
    };

    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Basic validation
    if (!body.slug || !body.title || !body.content) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: slug, title, content" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const postId = await ctx.runMutation(internal.posts.insertFromAgent, {
        slug: body.slug,
        title: body.title,
        excerpt: body.excerpt,
        content: body.content,
        featured_image: body.featured_image,
        featured_image_storage_id: body.featured_image_storage_id as any,
        featured_image_alt: body.featured_image_alt,
        meta_title: body.meta_title,
        meta_description: body.meta_description,
        keywords: body.keywords ?? [],
        category_id: body.category_id as any,
        reading_time: body.reading_time ?? 5,
        affiliateLinks: body.affiliateLinks ?? [],
      });

      return new Response(JSON.stringify({ postId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
