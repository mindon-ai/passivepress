/**
 * extensions/topic-picker-tools.ts
 * pi AgentTool for Agent 2 — TopicPicker.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

// Raw LLM choice before TypeScript resolves categoryId + validates
export interface RawTopicChoice {
  title: string;
  angle: string;
  category: string;
  keywords: string[];
  sourceUrls: string[];
  contentType?: string;
  targetProducts?: string[];
  affiliateCategory?: string;
}

const returnTopicParams = Type.Object({
  title: Type.String({ description: "Technical article headline, max 80 chars, no clickbait" }),
  angle: Type.String({ description: "2–3 sentence technical thesis explaining why this matters now" }),
  category: Type.String({ description: "Exactly one affiliate category/niche, e.g. tech | home-appliances | fitness | outdoors | kitchen" }),
  keywords: Type.Optional(Type.Array(Type.String(), { description: "5–10 highly specific buyer-intent SEO tags" })),
  sourceUrls: Type.Optional(Type.Array(Type.String(), { description: "Primary source URLs for this topic" })),
  contentType: Type.Optional(Type.String({ description: "buyer-guide | single-review | comparison | top-n-list" })),
  targetProducts: Type.Optional(Type.Array(Type.String(), { description: "Product names or models to research via RainforestAPI-backed Amazon product data" })),
  affiliateCategory: Type.Optional(Type.String({ description: "Amazon SearchIndex/category hint, e.g. Electronics, HomeAndKitchen, SportsAndOutdoors" })),
});

export function createReturnTopicTool(
  onResult: (choice: RawTopicChoice) => void,
  options: { once?: boolean } = {}
): AgentTool<typeof returnTopicParams> {
  let accepted = false;

  return {
    name: "return_topic",
    label: "Return Chosen Topic",
    description: "Call once when you have made your final editorial decision. Passes the choice to the pipeline.",
    parameters: returnTopicParams,
    execute: async (_id, params) => {
      if (options.once !== false && accepted) {
        return {
          content: [{ type: "text", text: "Topic choice already captured. Do not call return_topic again." }],
          details: { duplicateCall: true },
          terminate: true,
        };
      }

      accepted = true;
      const partial = params as Partial<RawTopicChoice>;
      const normalized: RawTopicChoice = {
        title: String(partial.title ?? ""),
        angle: String(partial.angle ?? ""),
        category: String(partial.category ?? ""),
        keywords: Array.isArray(partial.keywords) ? partial.keywords : [],
        sourceUrls: Array.isArray(partial.sourceUrls) ? partial.sourceUrls : [],
        contentType: partial.contentType,
        targetProducts: Array.isArray(partial.targetProducts) ? partial.targetProducts : [],
        affiliateCategory: partial.affiliateCategory,
      };
      onResult(normalized);
      return {
        content: [{ type: "text", text: "Topic choice captured. Stop now." }],
        details: { accepted: true },
        terminate: true,
      };
    },
  };
}
