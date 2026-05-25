import { getDataVizConfig } from "../lib/convex-client.ts";
import { toSlug } from "../lib/slug.ts";
import { loadSkill } from "../lib/skill-loader.ts";
import { runOneShotPiAgent } from "../lib/pi-agent-utils.ts";
import { createReturnDatavizTool } from "../extensions/dataviz-tools.ts";
import type { ChosenTopic, DataVizConfig, DataVizResult, ResearchData } from "../types/pipeline.ts";

const DEFAULT_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const DEFAULT_DATAVIZ_CONFIG: DataVizConfig = {
  generation: {
    enabled: true,
    requireResearch: true,
    allowEmptyResult: true,
    requireReturnTool: false,
  },
  chartRules: {
    minNumericBenchmarks: 2,
    maxCharts: 2,
    maxDataPointsPerChart: 6,
    maxSeriesPerChart: 3,
    allowedChartTypes: ["bar", "line", "area"],
    defaultChartType: "bar",
  },
  promptControls: {
    includeAngle: true,
    includeCategory: true,
    includeKeywords: true,
    includeKeyFindings: true,
    includeBenchmarks: true,
    customInstruction: "",
  },
  contentRules: {
    includeMarkdownContent: true,
    sentencesPerChart: 2,
    requireChartFences: true,
  },
};

// slugify is imported from ../lib/slug.ts as toSlug — used for chart IDs below

function normalizeNumericValue(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = Number(trimmed.replace(/[%,$]/g, ""));
    if (trimmed !== "" && Number.isFinite(numeric) && /^-?[\d.]+[%,$]?$/.test(trimmed)) {
      return numeric;
    }
    return trimmed;
  }
  return String(value ?? "");
}

function sanitizeCharts(raw: DataVizResult["charts"], config: DataVizConfig): DataVizResult["charts"] {
  return raw
    .filter(
      (chart) =>
        chart &&
        chart.title &&
        chart.xKey &&
        Array.isArray(chart.series) &&
        chart.series.length > 0 &&
        Array.isArray(chart.data) &&
        chart.data.length > 0,
    )
    .map((chart, index) => ({
      ...chart,
      id: chart.id?.trim() || `${toSlug(chart.title)}-${index + 1}`,
      type: config.chartRules.allowedChartTypes.includes(chart.type) ? chart.type : config.chartRules.defaultChartType,
      description: chart.description?.trim() || chart.title,
      insight: chart.insight?.trim() || undefined,
      sourceLabel: chart.sourceLabel?.trim() || undefined,
      series: chart.series.slice(0, config.chartRules.maxSeriesPerChart).map((series, seriesIndex) => ({
        ...series,
        key: series.key.trim(),
        label: series.label?.trim() || series.key,
        color: series.color?.trim() || DEFAULT_COLORS[seriesIndex % DEFAULT_COLORS.length],
      })),
      data: chart.data.slice(0, config.chartRules.maxDataPointsPerChart).map((row) => {
        const next: Record<string, string | number> = {};
        for (const [key, value] of Object.entries(row)) {
          next[key] = normalizeNumericValue(value);
        }
        return next;
      }),
    }))
    .slice(0, config.chartRules.maxCharts);
}

function countNumericBenchmarks(research?: ResearchData): number {
  if (!research?.benchmarks?.length) return 0;
  return research.benchmarks.filter((benchmark) => Number.isFinite(Number(String(benchmark.score).replace(/[%,$]/g, "").trim()))).length;
}

function buildPrompt(topic: ChosenTopic, research: ResearchData, config: DataVizConfig): string {
  const sections = [
    `Design up to ${config.chartRules.maxCharts} publication-ready charts only if the research contains concrete quantitative evidence.`,
    `Topic title: ${topic.title}`,
  ];
  if (config.promptControls.includeAngle) sections.push(`Editorial angle: ${topic.angle}`);
  if (config.promptControls.includeCategory) sections.push(`Category: ${topic.category}`);
  if (config.promptControls.includeKeywords) sections.push(`Keywords: ${topic.keywords.join(", ")}`);
  if (config.promptControls.customInstruction.trim()) sections.push(`Custom instruction: ${config.promptControls.customInstruction.trim()}`);

  const researchContext: Record<string, unknown> = {};
  if (config.promptControls.includeBenchmarks) researchContext.benchmarks = research.benchmarks;
  if (config.promptControls.includeKeyFindings) researchContext.keyFindings = research.keyFindings;

  sections.push(`Research context:\n${JSON.stringify(researchContext, null, 2)}`);
  sections.push(
    `Rules: max ${config.chartRules.maxDataPointsPerChart} data points per chart, max ${config.chartRules.maxSeriesPerChart} series per chart, allowed chart types: ${config.chartRules.allowedChartTypes.join(", ")}. ` +
    `${config.contentRules.includeMarkdownContent ? `Write ${config.contentRules.sentencesPerChart} sentences per chart.` : "Return empty content string."} ` +
    `${config.contentRules.requireChartFences ? "Use chartId fences for every chart." : "Chart fences are optional."}`
  );
  sections.push(
    `Call return_dataviz exactly once with your final result. ` +
    `${config.generation.allowEmptyResult ? "Return an empty charts array and empty content string if the evidence is too qualitative. " : "Only return concrete charts backed by numeric evidence. "}` +
    `After calling return_dataviz, stop immediately and do not make another tool call.`
  );
  return sections.join("\n\n");
}

export async function run(topic: ChosenTopic, research?: ResearchData): Promise<DataVizResult> {
  console.log("[DataViz] Designing chart blocks...");

  let config = DEFAULT_DATAVIZ_CONFIG;
  try {
    config = await getDataVizConfig();
    console.log("[DataViz] Loaded settings from Convex");
  } catch (err) {
    console.warn("[DataViz] Could not load Convex settings; using code defaults:", (err as Error).message);
  }

  if (!config.generation.enabled) {
    console.log("[DataViz] Disabled by settings — skipping charts.");
    return { charts: [], content: "" };
  }

  if (!research) {
    if (config.generation.requireResearch) {
      console.log("[DataViz] No research context available — skipping charts.");
      return { charts: [], content: "" };
    }
    research = { papers: [], codeSnippets: [], benchmarks: [], keyFindings: [] };
  }

  if (countNumericBenchmarks(research) < config.chartRules.minNumericBenchmarks) {
    console.log("[DataViz] Not enough numeric benchmark data — skipping charts.");
    return { charts: [], content: "" };
  }

  let captured: DataVizResult | null = null;
  let returnDatavizCallCount = 0;
  const returnTool = createReturnDatavizTool((result) => {
    captured = result;
  }, { once: true });
  const oneShotResult = await runOneShotPiAgent<DataVizResult>({
    agentId: "DataViz",
    systemPrompt: loadSkill("dataviz"),
    prompt: buildPrompt(topic, research, config),
    tools: [returnTool],
    returnToolName: "return_dataviz",
    getCapturedResult: () => captured,
  });
  returnDatavizCallCount = oneShotResult.returnCallCount;

  if (returnDatavizCallCount > 1) {
    console.warn(`[DataViz] return_dataviz was called ${returnDatavizCallCount} times; only the first call was accepted.`);
  }

  if (!captured && config.generation.requireReturnTool) {
    throw new Error("[DataViz] Agent finished without calling return_dataviz.");
  }

  const parsed = captured ?? { charts: [], content: "" };
  const charts = sanitizeCharts(parsed.charts ?? [], config);
  let content = charts.length > 0 && config.contentRules.includeMarkdownContent ? (parsed.content ?? "").trim() : "";

  // Substitute chartId placeholders with the full JSON spec for frontend rendering
  if (charts.length > 0) {
    for (const chart of charts) {
      // Handle both possible JSON formats the LLM might emit in the content
      const patterns = [
        JSON.stringify({ chartId: chart.id }),
        `{ "chartId": "${chart.id}" }`,
        `{"chartId": "${chart.id}"}`,
      ];

      for (const pattern of patterns) {
        if (content.includes(pattern)) {
          content = content.split(pattern).join(JSON.stringify(chart));
          break;
        }
      }
    }
  }

  console.log(`[DataViz] Prepared ${charts.length} chart(s)`);
  return { charts, content };
}

if (process.argv[1]?.endsWith("9-dataviz.ts")) {
  const mockTopic: ChosenTopic = {
    title: "Open Models Are Catching Up Fast",
    angle: "Benchmark gains are compressing the gap between open and closed AI models.",
    category: "llms",
    categoryId: "placeholder",
    keywords: ["open models", "benchmarks", "MMLU"],
    sourceUrls: ["https://example.com"],
  };

  const mockResearch: ResearchData = {
    papers: [],
    codeSnippets: [],
    benchmarks: [
      { name: "MMLU", score: "81", context: "Model A" },
      { name: "MMLU", score: "77", context: "Model B" },
    ],
    keyFindings: ["Open models narrowed the gap on general benchmarks."],
  };

  const result = await run(mockTopic, mockResearch);
  console.log(JSON.stringify(result, null, 2));
}

