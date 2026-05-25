import { getDataVizConfig } from "../lib/convex-client.ts";
import { toSlug } from "../lib/slug.ts";
import { loadSkill } from "../lib/skill-loader.ts";
import { runOneShotPiAgent } from "../lib/pi-agent-utils.ts";
import { createReturnDatavizTool } from "../extensions/dataviz-tools.ts";
import type { ChosenTopic, DataVizChart, DataVizConfig, DataVizResult, ProductResearchData, ResearchData } from "../types/pipeline.ts";

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

function isProductResearch(research?: ResearchData): research is ProductResearchData {
  return Array.isArray((research as ProductResearchData | undefined)?.products);
}

function buildProductComparison(topic: ChosenTopic, research: ProductResearchData, config: DataVizConfig): DataVizResult {
  const products = research.products
    .filter((product) => product.price?.current > 0 || product.rating > 0 || product.reviewCount > 0)
    .slice(0, config.chartRules.maxDataPointsPerChart);

  if (products.length < 2) return { charts: [], content: "" };

  const charts: DataVizChart[] = [];
  const priceProducts = products.filter((product) => product.price?.current > 0);
  if (priceProducts.length >= 2) {
    charts.push({
      id: `${toSlug(topic.title)}-price-comparison`,
      title: "Publish-time price comparison",
      description: "Cached Amazon prices for the products included in this guide.",
      type: "bar",
      xKey: "product",
      series: [{ key: "price", label: `Price (${priceProducts[0].price.currency || "USD"})`, color: DEFAULT_COLORS[0] }],
      data: priceProducts.map((product) => ({ product: product.title.slice(0, 34), price: product.price.current })),
      insight: "Prices are cached at publish time and may vary on Amazon.",
      sourceLabel: "Amazon PA API at publish time",
    });
  }

  const ratedProducts = products.filter((product) => product.rating > 0);
  if (ratedProducts.length >= 2 && charts.length < config.chartRules.maxCharts) {
    charts.push({
      id: `${toSlug(topic.title)}-rating-comparison`,
      title: "Customer rating comparison",
      description: "Amazon star ratings for products in the guide.",
      type: "bar",
      xKey: "product",
      series: [{ key: "rating", label: "Rating", color: DEFAULT_COLORS[1] }],
      data: ratedProducts.map((product) => ({ product: product.title.slice(0, 34), rating: product.rating })),
      insight: "Use ratings as one signal alongside price, availability, features, and review count.",
      sourceLabel: "Amazon PA API at publish time",
    });
  }

  const content = charts.map((chart) =>
    `### ${chart.title}\n\n${chart.description} ${chart.insight ?? ""}\n\n\`\`\`chart\n${JSON.stringify(chart)}\n\`\`\``
  ).join("\n\n");

  return { charts, content: config.contentRules.includeMarkdownContent ? content : "" };
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

export async function run(topic: ChosenTopic, research?: ProductResearchData | ResearchData): Promise<DataVizResult> {
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

  if (isProductResearch(research) && research.products.length >= 2) {
    const productResult = buildProductComparison(topic, research, config);
    if (productResult.charts.length > 0) {
      console.log(`[DataViz] Prepared ${productResult.charts.length} product comparison chart(s)`);
      return productResult;
    }
  }

  if (countNumericBenchmarks(research) < config.chartRules.minNumericBenchmarks) {
    console.log("[DataViz] Not enough numeric benchmark/product data — skipping charts.");
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

