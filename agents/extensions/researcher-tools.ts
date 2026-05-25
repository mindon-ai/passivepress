/**
 * extensions/researcher-tools.ts
 *
 * pi AgentTool definitions for the Researcher agent (Agent 8).
 * Uses @earendil-works/pi-agent-core AgentTool + @earendil-works/pi-ai Type.
 *
 * - searchTechnicalTool  → stateless, defined at module level
 * - createReturnTool()   → factory, call once per run() to capture the result
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { searchTechnical } from "./search-tools.ts";
import type { ResearchData } from "../types/pipeline.ts";

// ─── Tool 1: search_technical (stateless) ────────────────────────────────────

const searchTechnicalParams = Type.Object({
  query: Type.String({
    description: "Search query — be specific, include model/paper/benchmark names",
  }),
  num: Type.Optional(
    Type.Number({ description: "Max results to return (default 10, max 15)" })
  ),
});

export function createSearchTechnicalTool(
  maxCalls = 3,
  options: { defaultResultsPerSearch?: number; maxResultsPerSearch?: number; queryScope?: string } = {}
): AgentTool<typeof searchTechnicalParams> {
  let callCount = 0;

  return {
    name: "search_technical",
    label: "Search Technical Sources",
    description:
      "Search arXiv, GitHub, HuggingFace, and PapersWithCode for papers, benchmarks, and code. " +
      `Hard limit: ${maxCalls} calls total. After that, synthesize and call return_research.`,
    parameters: searchTechnicalParams,
    execute: async (_id, params) => {
      callCount += 1;
      if (callCount > maxCalls) {
        return {
          content: [{
            type: "text",
            text: `Search limit reached (${maxCalls} total calls). Do not search again. Synthesize the best grounded result you already have and call return_research now.`,
          }],
          details: { query: params.query, count: 0, blocked: true, callCount, maxCalls },
        };
      }

      const requestedNum = params.num ?? options.defaultResultsPerSearch ?? 10;
      const num = Math.min(requestedNum, options.maxResultsPerSearch ?? 15);
      console.log(`  [search_technical] ${params.query}`);
      const results = await searchTechnical(params.query, { num, queryScope: options.queryScope });
      console.log(`  → ${results.length} results`);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        details: { query: params.query, count: results.length, callCount, maxCalls },
      };
    },
  };
}

// Note: use createSearchTechnicalTool() directly rather than this module-level instance,
// since 8-researcher.ts always needs a fresh stateful instance via createSearchTechnicalTool(3).
// export const searchTechnicalTool = createSearchTechnicalTool();

// ─── Tool 2: return_research (stateful — factory per run) ─────────────────────

const returnResearchParams = Type.Object({
  papers: Type.Array(
    Type.Object({
      title: Type.String(),
      authors: Type.Array(Type.String()),
      summary: Type.String({
        description: "2–3 sentence summary of the key contribution",
      }),
      url: Type.String(),
      published: Type.String({ description: "YYYY-MM-DD or year" }),
    }),
    { description: "Papers and technical reports found. Empty array if none." }
  ),
  codeSnippets: Type.Array(
    Type.Object({
      language: Type.String({ description: "e.g. python, typescript, bash" }),
      code: Type.String(),
      source: Type.String({ description: "URL or description of where this came from" }),
    }),
    { description: "Runnable code examples found. Empty array if none." }
  ),
  benchmarks: Type.Array(
    Type.Object({
      name: Type.String({ description: "e.g. MMLU, HumanEval, SWE-bench" }),
      score: Type.String({ description: "e.g. 83.2% or 58 points" }),
      context: Type.String({ description: "One sentence: what model, what setting, vs what baseline" }),
    }),
    { description: "Concrete benchmark scores found. Empty array if none — never fabricate." }
  ),
  keyFindings: Type.Array(Type.String(), {
    description: "3–5 one-sentence findings grounded in the search results",
  }),
});

/**
 * Call once per Researcher run to get a return_research tool that
 * writes its result into the provided callback.
 */
export function createReturnTool(
  onResult: (data: ResearchData) => void,
  options: { once?: boolean } = {}
): AgentTool<typeof returnResearchParams> {
  let accepted = false;

  return {
    name: "return_research",
    label: "Return Research Data",
    description:
      "Call this when you have gathered enough data from search results. " +
      "Passes the structured ResearchData to the pipeline and ends the task.",
    parameters: returnResearchParams,
    execute: async (_id, params) => {
      if (options.once !== false && accepted) {
        return {
          content: [{ type: "text", text: "Research data already captured. Do not call return_research again." }],
          details: { duplicateCall: true },
          terminate: true,
        };
      }

      accepted = true;
      onResult(params as ResearchData);
      return {
        content: [{ type: "text", text: "Research data captured. Task complete. Stop now." }],
        details: { accepted: true },
        terminate: true,
      };
    },
  };
}
