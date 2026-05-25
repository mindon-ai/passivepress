/**
 * Agent 8 — Researcher (pi Agent)
 *
 * A real @earendil-works/pi-agent-core Agent that:
 *  1. Calls search_technical 2–3 times autonomously
 *  2. Decides when it has enough data
 *  3. Calls return_research with typed, structured ResearchData
 *
 * The LLM drives the loop — no manual orchestration.
 * System prompt comes from skills/researcher.md.
 *
 * Provider routing (set in .env):
 *   PI_PROVIDER=anthropic  → ANTHROPIC_API_KEY + PI_MODEL
 *   PI_PROVIDER=openai     → OPENAI_API_KEY    + PI_MODEL
 *   (default)              → CLIPROXY_BASE_URL + CLIPROXY_API_KEY + CLIPROXY_LLM_MODEL
 */

import "dotenv/config";
import { getResearcherConfig } from "../lib/convex-client.ts";
import { loadSkill } from "../lib/skill-loader.ts";
import { runOneShotPiAgent } from "../lib/pi-agent-utils.ts";
import { runLogger } from "../lib/run-logger.ts";
import { createSearchTechnicalTool, createReturnTool } from "../extensions/researcher-tools.ts";
import type { ChosenTopic, ResearchData, ResearcherConfig } from "../types/pipeline.ts";

const DEFAULT_RESEARCHER_CONFIG: ResearcherConfig = {
  search: {
    enabled: true,
    maxSearchCalls: 3,
    defaultResultsPerSearch: 10,
    maxResultsPerSearch: 15,
    queryScope: "site:arxiv.org OR site:github.com OR site:huggingface.co OR site:paperswithcode.com",
  },
  extraction: {
    includePapers: true,
    includeBenchmarks: true,
    includeCodeSnippets: true,
    minKeyFindings: 3,
    maxKeyFindings: 5,
    maxPapers: 5,
    maxBenchmarks: 8,
    maxCodeSnippets: 3,
  },
  promptControls: {
    includeSourceUrls: true,
    includeTopicAngle: true,
    includeCategory: true,
    customInstruction: "",
  },
  fallbackRules: {
    allowEmptyArrays: true,
    allowPartialResults: true,
    requireReturnTool: true,
  },
};

function trimResearchData(data: ResearchData, config: ResearcherConfig): ResearchData {
  return {
    papers: config.extraction.includePapers ? data.papers.slice(0, config.extraction.maxPapers) : [],
    benchmarks: config.extraction.includeBenchmarks ? data.benchmarks.slice(0, config.extraction.maxBenchmarks) : [],
    codeSnippets: config.extraction.includeCodeSnippets ? data.codeSnippets.slice(0, config.extraction.maxCodeSnippets) : [],
    keyFindings: data.keyFindings.slice(0, config.extraction.maxKeyFindings),
  };
}

// ─── Main run() ───────────────────────────────────────────────────────────────

export async function run(topic: ChosenTopic): Promise<ResearchData> {
  console.log(`[Researcher] Starting pi agent for: "${topic.title}"`);

  let config = DEFAULT_RESEARCHER_CONFIG;
  try {
    config = await getResearcherConfig();
    console.log("[Researcher] Loaded settings from Convex");
  } catch (err) {
    console.warn("[Researcher] Could not load Convex settings; using code defaults:", (err as Error).message);
  }

  // 1. Capture result via closure — set when LLM calls return_research
  let researchResult: ResearchData | null = null;
  let returnResearchCallCount = 0;
  const returnTool = createReturnTool((data) => {
    researchResult = data;
  }, { once: true });

  // 2. Build agent
  const searchTool = createSearchTechnicalTool(config.search.enabled ? config.search.maxSearchCalls : 0, {
    defaultResultsPerSearch: config.search.defaultResultsPerSearch,
    maxResultsPerSearch: config.search.maxResultsPerSearch,
    queryScope: config.search.queryScope,
  });
  // 3. Observe the loop — log to console
  const startedAt = Date.now();

  // 4. Prompt — the agent decides when to call tools and when to stop
  const oneShotResult = await runOneShotPiAgent<ResearchData>({
    agentId: "Researcher",
    systemPrompt: loadSkill("researcher"),
    prompt:
      `Research the following topic for a PassivePress buying guide.\n\n` +
      `Topic: ${topic.title}\n` +
      `${config.promptControls.includeTopicAngle ? `Angle: ${topic.angle}\n` : ""}` +
      `${config.promptControls.includeCategory ? `Category: ${topic.category}\n` : ""}` +
      `${config.promptControls.includeSourceUrls ? `Source URLs (start here): ${topic.sourceUrls.join(", ")}\n` : ""}` +
      `${config.promptControls.customInstruction.trim() ? `Custom instruction: ${config.promptControls.customInstruction.trim()}\n` : ""}` +
      `\nSteps:\n` +
      `1. ${config.search.enabled ? `Call search_technical no more than ${config.search.maxSearchCalls} times total, using distinct focused queries` : "Do not call search_technical; synthesize from the provided topic/source context only"}\n` +
      `2. After searching, stop searching and synthesize the best grounded result you have\n` +
      `3. Extract ${config.extraction.includePapers ? `up to ${config.extraction.maxPapers} papers/reports` : "no papers"}, ${config.extraction.includeBenchmarks ? `up to ${config.extraction.maxBenchmarks} benchmarks` : "no benchmarks"}, ${config.extraction.includeCodeSnippets ? `up to ${config.extraction.maxCodeSnippets} code snippets` : "no code snippets"}, and ${config.extraction.minKeyFindings}-${config.extraction.maxKeyFindings} key findings\n` +
      `4. Call return_research exactly once${config.fallbackRules.allowEmptyArrays ? ", even if some arrays are empty" : ""}\n` +
      `5. After calling return_research, stop immediately and do not make another tool call\n` +
      `6. Do not produce any text output — only tool calls`,
    tools: [searchTool, returnTool],
    returnToolName: "return_research",
    getCapturedResult: () => researchResult,
  });
  returnResearchCallCount = oneShotResult.returnCallCount;

  if (returnResearchCallCount > 1) {
    console.warn(`[Researcher] return_research was called ${returnResearchCallCount} times; only the first call was accepted.`);
  }

  // 5. Guard: LLM must have called return_research
  if (!researchResult) {
    if (config.fallbackRules.requireReturnTool) {
      throw new Error(
        "[Researcher] Agent finished without calling return_research. " +
        "Check skills/researcher.md and the model response above."
      );
    }

    researchResult = {
      papers: [],
      benchmarks: [],
      codeSnippets: [],
      keyFindings: config.fallbackRules.allowPartialResults ? [`Research was inconclusive for ${topic.title}.`] : [],
    };
  }

  const finalResearch = trimResearchData(researchResult as ResearchData, config);
  const durationMs = Date.now() - startedAt;
  runLogger.info(
    "Researcher",
    `${finalResearch.papers.length} papers, ${finalResearch.benchmarks.length} benchmarks, ${finalResearch.keyFindings.length} findings in ${durationMs}ms`
  );

  console.log(
    `[Researcher] Done: ${finalResearch.papers.length} papers, ` +
    `${finalResearch.benchmarks.length} benchmarks, ` +
    `${finalResearch.codeSnippets.length} snippets, ` +
    `${finalResearch.keyFindings.length} findings`
  );

  return finalResearch;
}

// ─── Standalone runner ────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("8-researcher.ts")) {
  const mock: ChosenTopic = {
    title: process.argv[2] ?? "DeepSeek-V3 Achieves GPT-4 Parity at a Fraction of the Cost",
    angle: "Open-source efficiency beats closed-source scale.",
    category: "llms",
    categoryId: "placeholder",
    keywords: ["DeepSeek-V3", "LLM efficiency", "open-source LLM"],
    sourceUrls: ["https://arxiv.org/abs/2412.19437"],
  };

  console.log("Running Researcher in standalone mode...\n");
  const result = await run(mock);

  console.log("\n─── Research Output ───────────────────────────────────");
  console.log(JSON.stringify(result, null, 2));
}

