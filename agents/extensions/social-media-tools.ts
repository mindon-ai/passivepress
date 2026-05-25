import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { SocialGeneratedCopy } from "../types/social.ts";

const hashtagArray = Type.Optional(Type.Array(Type.String({ description: "Hashtag without the leading # is preferred." })));

const returnSocialPostsParams = Type.Object({
  shared: Type.Object({
    brandFooter: Type.String({ description: "Reusable brand footer or signature for the campaign." }),
  }),
  x: Type.Object({
    text: Type.String({ description: "Concise X post body before deterministic URL handling." }),
    hashtags: hashtagArray,
    cta: Type.Optional(Type.String()),
    threadParts: Type.Optional(Type.Array(Type.String())),
  }),
});

export function createReturnSocialPostsTool(
  onResult: (result: SocialGeneratedCopy) => void,
  options: { once?: boolean } = {},
): AgentTool<typeof returnSocialPostsParams> {
  let accepted = false;

  return {
    name: "return_social_posts",
    label: "Return Social Posts",
    description: "Call once with the final platform-specific social copy payload.",
    parameters: returnSocialPostsParams,
    execute: async (_id, params) => {
      if (options.once !== false && accepted) {
        return {
          content: [{ type: "text", text: "Social copy already captured. Do not call return_social_posts again." }],
          details: { duplicateCall: true },
          terminate: true,
        };
      }

      accepted = true;
      onResult(params as SocialGeneratedCopy);
      return {
        content: [{ type: "text", text: "Social copy captured. Stop now." }],
        details: { accepted: true },
        terminate: true,
      };
    },
  };
}
