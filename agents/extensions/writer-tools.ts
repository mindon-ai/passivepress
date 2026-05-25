/**
 * extensions/writer-tools.ts
 * pi AgentTools for Agent 4 — Writer.
 *
 * Two tools:
 *   get_existing_posts  — fetches slugs+titles from Convex for internal linking
 *   return_draft        — captures the complete PostDraft (content + metadata)
 *                         Rejects if article < 1100 words so the agent retries.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listPublishedPostLinks } from "../lib/convex-client.ts";
import { countWords } from "../lib/reading-time.ts";
import type { PostDraft } from "../types/pipeline.ts";

export interface WriterMetadata {
  slug: string;
  title: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
}

// ─── Tool 1: get_existing_posts ───────────────────────────────────────────────

const getExistingPostsParams = Type.Object({});

export const getExistingPostsTool: AgentTool<typeof getExistingPostsParams> = {
  name: "get_existing_posts",
  label: "Get Published Posts",
  description:
    "Returns slug and title of the 30 most-recent published posts. " +
    "Call once near the start to choose 2–4 natural internal links for the article.",
  parameters: getExistingPostsParams,
  execute: async () => {
    const posts = await listPublishedPostLinks();
    const formatted = posts
      .slice(0, 30)
      .map((p) => `/${p.slug}  —  ${p.title}`)
      .join("\n");
    return {
      content: [{ type: "text", text: formatted || "No published posts yet." }],
      details: { count: posts.length },
    };
  },
};

// ─── Tool 2: return_draft ─────────────────────────────────────────────────────

const returnDraftParams = Type.Object({
  slug:            Type.String({ description: "URL-safe kebab-case, max 60 chars" }),
  title:           Type.String({ description: "Final headline, max 80 chars" }),
  excerpt:         Type.String({ description: "2 sentences, max 180 chars total" }),
  metaTitle:       Type.String({ description: "SEO title, 50–60 chars" }),
  metaDescription: Type.String({ description: "SEO description, 120–155 chars" }),
  content:         Type.String({ description: "Full Markdown article body, minimum 1100 words" }),
});

const returnMetadataParams = Type.Object({
  slug:            Type.String({ description: "URL-safe kebab-case, max 60 chars" }),
  title:           Type.String({ description: "Final headline, max 80 chars" }),
  excerpt:         Type.String({ description: "2 sentences, max 180 chars total" }),
  metaTitle:       Type.String({ description: "SEO title, 50–60 chars" }),
  metaDescription: Type.String({ description: "SEO description, 120–155 chars" }),
});

export function createReturnDraftTool(
  onResult: (draft: PostDraft) => void,
  options: { minWords?: number } = {}
): AgentTool<typeof returnDraftParams> {
  return {
    name: "return_draft",
    label: "Return Article Draft",
    description:
      "Call when the complete article is ready. " +
      "The content field must contain the full Markdown body (minimum 1100 words). " +
      "Do NOT call this until the article is complete — the tool will reject short content. " +
      "Return the final article body in the content field, not an assistant summary or explanation.",
    parameters: returnDraftParams,
    execute: async (_id, params) => {
      const wordCount = countWords(params.content);

      // Self-enforcing quality gate — rejection causes the agent to keep writing
      const minWords = options.minWords ?? 1100;
      if (wordCount < minWords) {
        return {
          content: [{
            type: "text",
            text:
              `Article rejected: only ${wordCount} words. ` +
              `Minimum is ${minWords} words. Continue writing the article and call return_draft again when complete.`,
          }],
          details: { wordCount, rejected: true },
        };
      }

      onResult({
        slug:            params.slug,
        title:           params.title,
        excerpt:         params.excerpt,
        metaTitle:       params.metaTitle,
        metaDescription: params.metaDescription,
        content:         params.content,
        keywords:        [],   // injected by the agent runner from ChosenTopic
        readingTime:     Math.ceil(wordCount / 200),
      });

      return {
        content: [{ type: "text", text: `Draft captured: ${wordCount} words.` }],
        details: { wordCount },
      };
    },
  };
}

export function createReturnMetadataTool(
  onResult: (metadata: WriterMetadata) => void,
  options: { once?: boolean } = {}
): AgentTool<typeof returnMetadataParams> {
  let accepted = false;

  return {
    name: "return_metadata",
    label: "Return Article Metadata",
    description:
      "Call once with the final slug, title, excerpt, metaTitle, and metaDescription. " +
      "Do not include article body content in this tool.",
    parameters: returnMetadataParams,
    execute: async (_id, params) => {
      if (options.once !== false && accepted) {
        return {
          content: [{ type: "text", text: "Metadata already captured. Do not call return_metadata again." }],
          details: { duplicateCall: true },
          terminate: true,
        };
      }

      accepted = true;
      onResult(params as WriterMetadata);
      return {
        content: [{ type: "text", text: "Metadata captured. Stop now." }],
        details: { accepted: true },
        terminate: true,
      };
    },
  };
}
