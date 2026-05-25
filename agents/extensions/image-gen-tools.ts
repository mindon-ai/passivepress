/**
 * extensions/image-gen-tools.ts
 * pi AgentTool for Agent 3 — ImageGen.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

export interface ImageSpec {
  prompt: string;
  altText: string;
}

const returnImageSpecParams = Type.Object({
  prompt: Type.String({
    description: "Stable Diffusion prompt, max 120 chars, single line, ends with negative constraints clause",
  }),
  altText: Type.String({
    description: "Accessibility alt text describing the visual, max 125 chars",
  }),
});

export function createReturnImageSpecTool(
  onResult: (spec: ImageSpec) => void,
  options: { once?: boolean; maxPromptChars?: number } = {}
): AgentTool<typeof returnImageSpecParams> {
  let accepted = false;

  return {
    name: "return_image_spec",
    label: "Return Image Spec",
    description: "Call once with the final image generation prompt and alt text.",
    parameters: returnImageSpecParams,
    execute: async (_id, params) => {
      if (options.once !== false && accepted) {
        return {
          content: [{ type: "text", text: "Image spec already captured. Do not call return_image_spec again." }],
          details: { duplicateCall: true },
          terminate: true,
        };
      }

      // Enforce prompt length
      const maxPromptChars = options.maxPromptChars ?? 120;
      if (params.prompt.length > maxPromptChars) {
        return {
          content: [{ type: "text", text: `Prompt too long (${params.prompt.length} chars). Keep it under ${maxPromptChars} chars. Try again.` }],
          details: { rejected: true },
        };
      }

      accepted = true;
      onResult(params as ImageSpec);
      return {
        content: [{ type: "text", text: "Image spec captured. Stop now." }],
        details: { accepted: true },
        terminate: true,
      };
    },
  };
}
