import "dotenv/config";
import { getPublishedPostBySlug, listPublishedPosts } from "../lib/convex-client.ts";
import { buildSocialInputFromPublishedPost } from "../lib/social/content-builder.ts";
import { resolveSocialConfig } from "../lib/social/config.ts";
import { publishToX } from "../lib/social/platforms/x.ts";
import type { SocialGeneratedCopy } from "../types/social.ts";

export async function runSocialXSmoke() {
  const slug = process.argv[2];
  const mode = process.argv.includes("--live") ? "live" : "dry";
  const config = resolveSocialConfig();

  let post = slug ? await getPublishedPostBySlug(slug) : null;
  if (!post) {
    const recent = await listPublishedPosts(1);
    if (recent.length === 0) throw new Error("No published posts found for X smoke test.");
    post = await getPublishedPostBySlug(recent[0].slug);
  }
  if (!post) throw new Error("Unable to resolve a published post for X smoke testing.");

  const input = buildSocialInputFromPublishedPost(post, config);
  const teaser = input.snippets[0] ?? input.excerpt;
  const topicHashtags = input.keywords.slice(0, 2).map((tag) => tag.replace(/[^a-zA-Z0-9]+/g, "")).filter(Boolean);
  const copy: SocialGeneratedCopy = {
    shared: { brandFooter: config.brandFooter },
    x: {
      text: `${input.title}\n\n${teaser}`.slice(0, 170).trim(),
      hashtags: ["NeuronPress", ...topicHashtags].slice(0, 3),
    },
  };

  const result = await publishToX({
    config,
    input,
    copy,
    dryRun: mode !== "live",
  });

  console.log(JSON.stringify({
    mode,
    slug: input.slug,
    canonicalUrl: input.canonicalUrl,
    result,
  }, null, 2));
}

if (process.argv[1]?.endsWith("social-x-smoke.ts")) {
  runSocialXSmoke().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
