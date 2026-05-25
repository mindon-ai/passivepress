/**
 * Shared utilities for LLM interaction and JSON parsing.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  result: {
    response: string;
  };
  success: boolean;
  errors: unknown[];
  result_info?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  };
}

/**
 * Parse JSON from LLM response — handles markdown code fences and common
 * LLM JSON corruption (trailing commas, unescaped control characters).
 */
export function parseLLMJson<T>(raw: string): T {
  let cleaned = raw.trim();
  
  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```[a-z]*\n?/, "")
      .replace(/```\s*$/, "")
      .trim();
  }

  // Find JSON object/array boundaries
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    const lastBrace = cleaned.lastIndexOf("}");
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  } else if (firstBracket !== -1) {
    const lastBracket = cleaned.lastIndexOf("]");
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Attempt simple repair for trailing commas or unescaped newlines
    const repaired = cleaned
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/(?<=":"[^"]*)[\n\r\t](?=[^"]*")/g, " ");

    return JSON.parse(repaired) as T;
  }
}
