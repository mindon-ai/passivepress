// agents/lib/meta-analyzer.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPublishedPostBySlug, listPublishedPosts } from "./convex-client.ts";
import { MIN_ARTICLE_WORDS } from "./content-rules.ts";
import { fetchGAData } from "./meta-ga-client.ts";
import type { AuditContext, LLMCallBreakdown, PipelineMetrics, PostAudit } from "../types/meta.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const AGENTS_ROOT = path.resolve(__dirname, "..");
const LOGS_DIR = path.join(AGENTS_ROOT, "logs");

export interface AnalyzerOptions {
  lastN: number;
}

interface LogSummary {
  runId: string;
  timestamp: string;
  dryRun: boolean;
  chosen: { title: string; category: string; angle: string };
  draft: { slug: string; readingTime: number };
  telemetry: {
    steps: Array<{ name: string; status: string; durationMs?: number; details?: string }>;
    llmCalls: Array<{
      label: string;
      maxTokens?: number;
      durationMs: number;
      usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;
    }>;
    totals: { totalTokens?: number; llmCalls?: number; imageCalls?: number; durationMs?: number };
  };
  hasTelemetry: boolean;
}

export async function buildAuditContext(opts: AnalyzerOptions): Promise<AuditContext> {
  const logs = readPipelineLogs(opts.lastN);
  const pipeline = computePipelineMetrics(logs);
  const [posts, gaData] = await Promise.all([auditPublishedPosts(), fetchGAData()]);

  return {
    generatedAt: new Date().toISOString(),
    pipeline,
    posts,
    agentSources: readAgentSources(),
    frontendSources: readFrontendSources(),
    backendSources: readBackendSources(),
    gaData,
    constraints: {
      neverModify: ["pipeline.ts", ".env*"],
      neverDelete: ["convex posts"],
      neverAutoPush: true,
      requireBackupBefore: [
        "agents/agents/1-trend-scout.ts",
        "agents/agents/2-topic-picker.ts",
        "agents/agents/3-image-gen.ts",
        "agents/agents/4-writer.ts",
        "agents/agents/5-publisher.ts",
        "src/components/PostCard.tsx",
        "src/components/SEO.tsx",
        "src/components/Header.tsx",
        "src/components/Footer.tsx",
        "src/pages/Index.tsx",
        "src/pages/Post.tsx",
        "convex/posts.ts",
        "convex/http.ts",
      ],
      schemaChangeRequiresReview: true,
    },
  };
}

function readPipelineLogs(lastN: number): LogSummary[] {
  if (!fs.existsSync(LOGS_DIR)) return [];

  const files = fs.readdirSync(LOGS_DIR)
    .filter((f) => f.endsWith(".json") && !f.includes("error") && !f.startsWith("meta-"))
    .map((f) => ({
      file: f,
      fullPath: path.join(LOGS_DIR, f),
      mtime: fs.statSync(path.join(LOGS_DIR, f)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  const summaries: LogSummary[] = [];

  for (const { fullPath, file } of files) {
    if (summaries.length >= lastN) break;

    try {
      const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      const totals = raw.telemetry?.totals ?? {};
      const steps = raw.telemetry?.steps ?? [];
      const llmCalls = raw.telemetry?.llmCalls ?? [];
      const hasChosen = Boolean(raw.chosen?.title || raw.chosen?.category);
      const hasDraft = Boolean(raw.draft?.slug || raw.draft?.title);
      const hasUsableTelemetry = steps.length > 0 || llmCalls.length > 0 || (totals.totalTokens ?? 0) > 0;

      if (!hasChosen && !hasDraft && !hasUsableTelemetry) {
        continue;
      }

      summaries.push({
        runId: raw.runId ?? file.replace(/\.json$/, ""),
        timestamp: raw.timestamp ?? new Date(0).toISOString(),
        dryRun: raw.dryRun ?? false,
        chosen: {
          title: raw.chosen?.title ?? "",
          category: raw.chosen?.category ?? "unknown",
          angle: raw.chosen?.angle ?? "",
        },
        draft: {
          slug: raw.draft?.slug ?? "",
          readingTime: raw.draft?.readingTime ?? 0,
        },
        telemetry: { steps, llmCalls, totals },
        hasTelemetry: hasUsableTelemetry,
      });
    } catch (e) {
      console.warn(`[MetaAnalyzer] Could not parse log ${file}:`, e);
    }
  }

  return summaries;
}

function computePipelineMetrics(logs: LogSummary[]): PipelineMetrics {
  const runsWithTelemetry = logs.filter((l) => l.hasTelemetry);
  const categoryDistribution: Record<string, number> = {
    "ai-news": 0,
    llms: 0,
    "image-ai": 0,
    "ai-coding": 0,
    "ai-business": 0,
    "ai-research": 0,
  };

  for (const log of logs) {
    const category = log.chosen.category || "unknown";
    categoryDistribution[category] = (categoryDistribution[category] ?? 0) + 1;
  }

  const dominantEntry = Object.entries(categoryDistribution).sort((a, b) => b[1] - a[1])[0] ?? ["unknown", 0];
  const dominantCategory = dominantEntry[0];
  const dominantCategoryPct = logs.length ? dominantEntry[1] / logs.length : 0;

  const llmGroups = new Map<string, { completions: number[]; maxTokens: number[]; durations: number[] }>();
  const stepFailures: Record<string, number> = {};
  let continuationTriggerCount = 0;
  let imageGenFallbackCount = 0;

  for (const log of logs) {
    for (const step of log.telemetry.steps) {
      if (step.status === "error") {
        stepFailures[step.name] = (stepFailures[step.name] ?? 0) + 1;
      }
      if (step.name === "ImageGen" && /fallback|unsplash/i.test(step.details ?? "")) {
        imageGenFallbackCount += 1;
      }
    }

    for (const call of log.telemetry.llmCalls) {
      const group = llmGroups.get(call.label) ?? { completions: [], maxTokens: [], durations: [] };
      group.completions.push(call.usage?.completionTokens ?? 0);
      group.maxTokens.push(call.maxTokens ?? 0);
      group.durations.push(call.durationMs ?? 0);
      llmGroups.set(call.label, group);

      if (/continuation/i.test(call.label)) continuationTriggerCount += 1;
    }
  }

  const llmCallBreakdown: LLMCallBreakdown[] = [...llmGroups.entries()].map(([label, group]) => {
    const avgCompletion = average(group.completions);
    const maxTokensBudget = Math.max(...group.maxTokens, 0);
    const avgDurationMs = average(group.durations);
    return {
      label,
      avgCompletion,
      maxTokensBudget,
      avgDurationMs,
      hitsBudget: maxTokensBudget > 0 ? avgCompletion >= maxTokensBudget * 0.9 : false,
    };
  });

  return {
    runsAnalyzed: logs.length,
    runsWithTelemetry: runsWithTelemetry.length,
    dateRange: {
      from: logs[logs.length - 1]?.timestamp ?? new Date().toISOString(),
      to: logs[0]?.timestamp ?? new Date().toISOString(),
    },
    categoryDistribution,
    dominantCategory,
    dominantCategoryPct,
    avgTotalTokens: average(runsWithTelemetry.map((l) => l.telemetry.totals.totalTokens ?? 0)),
    maxTotalTokens: Math.max(...runsWithTelemetry.map((l) => l.telemetry.totals.totalTokens ?? 0), 0),
    avgWriterTokens: average(findCallTotals(runsWithTelemetry, "Writer: article")),
    avgTopicPickerTokens: average(findCallTotals(runsWithTelemetry, "TopicPicker")),
    avgImageGenPromptTokens: average(findCallTotals(runsWithTelemetry, "ImageGen")),
    avgTotalDurationMs: average(runsWithTelemetry.map((l) => sumStepDurations(l.telemetry.steps))),
    avgWriterDurationMs: average(runsWithTelemetry.map((l) => findStepDuration(l.telemetry.steps, "Writer"))),
    continuationTriggerCount,
    imageGenFallbackCount,
    llmCallBreakdown,
    stepFailures,
    recentSlugs: logs.slice(0, 5).map((l) => l.draft.slug).filter(Boolean),
    recentTitles: logs.slice(0, 5).map((l) => l.chosen.title).filter(Boolean),
    recentCategories: logs.slice(0, 5).map((l) => l.chosen.category).filter(Boolean),
  };
}

async function auditPublishedPosts(): Promise<PostAudit[]> {
  const posts = await listPublishedPosts(5).catch(() => []);
  const audits = await Promise.all(
    posts.map(async (post) => {
      const full = await getPublishedPostBySlug(post.slug).catch(() => null);
      if (!full) {
        return {
          slug: post.slug,
          title: post.title,
          category: post.category?.slug ?? "unknown",
          wordCount: 0,
          readingTime: post.reading_time ?? 0,
          hasExcerpt: Boolean(post.excerpt?.trim()),
          hasMetaTitle: false,
          hasMetaDescription: false,
          hasKeywords: false,
          hasFeaturedImage: Boolean(post.featured_image?.trim()),
          sections: {
            hasKeyTakeaways: false,
            hasFAQ: false,
            hasConclusion: false,
            hasTableOfContents: false,
            hasCodeBlock: false,
            hasCallout: false,
            hasComparisonTable: false,
          },
          seo: {
            titleLength: post.title.length,
            metaTitleLength: 0,
            metaDescLength: 0,
            keywordCount: 0,
          },
          issues: ["Could not fetch full post content from Convex"],
        } satisfies PostAudit;
      }
      return auditPostContent(full.slug, full.content, {
        title: full.title,
        category: full.category,
        excerpt: full.excerpt,
        metaTitle: full.meta_title,
        metaDescription: full.meta_description,
        keywords: full.keywords,
        featuredImage: full.featured_image,
        readingTime: full.reading_time,
      });
    })
  );

  for (const audit of audits) {
    if (audit.wordCount < MIN_ARTICLE_WORDS) audit.issues.push(`wordCount too low (${audit.wordCount})`);
    if (!audit.sections.hasFAQ) audit.issues.push("Missing ## FAQ");
    if (!audit.sections.hasKeyTakeaways) audit.issues.push("Missing ## Key Takeaways");
    if (!audit.sections.hasConclusion) audit.issues.push("Missing ## Conclusion");
    if (audit.seo.metaTitleLength > 0 && (audit.seo.metaTitleLength < 50 || audit.seo.metaTitleLength > 60)) {
      audit.issues.push(`metaTitle length out of range (${audit.seo.metaTitleLength})`);
    }
    if (audit.seo.metaDescLength > 0 && (audit.seo.metaDescLength < 120 || audit.seo.metaDescLength > 155)) {
      audit.issues.push(`metaDescription length out of range (${audit.seo.metaDescLength})`);
    }
    if (audit.seo.keywordCount < 5) audit.issues.push(`keywordCount too low (${audit.seo.keywordCount})`);
  }

  return audits;
}

function auditPostContent(
  slug: string,
  content: string,
  meta: {
    title: string;
    category: { slug: string; name: string } | null;
    excerpt: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    keywords: string[] | null;
    featuredImage: string | null;
    readingTime: number | null;
  },
): PostAudit {
  const words = content.trim().split(/\s+/).filter((w) => w.length > 0);

  return {
    slug,
    title: meta.title,
    category: meta.category?.slug ?? "unknown",
    wordCount: words.length,
    readingTime: meta.readingTime ?? 0,
    hasExcerpt: Boolean(meta.excerpt?.trim()),
    hasMetaTitle: Boolean(meta.metaTitle?.trim()),
    hasMetaDescription: Boolean(meta.metaDescription?.trim()),
    hasKeywords: (meta.keywords?.length ?? 0) > 0,
    hasFeaturedImage: Boolean(meta.featuredImage?.trim()),
    sections: {
      hasKeyTakeaways: /^## key takeaways/im.test(content),
      hasFAQ: /^## faq/im.test(content),
      hasConclusion: /^## conclusion/im.test(content),
      hasTableOfContents: /^## contents/im.test(content),
      hasCodeBlock: /```[a-z]/i.test(content),
      hasCallout: /^> [💡⚠️📌✅]/m.test(content),
      hasComparisonTable: /^\|.+\|.+\|/m.test(content),
    },
    seo: {
      titleLength: meta.title?.length ?? 0,
      metaTitleLength: meta.metaTitle?.length ?? 0,
      metaDescLength: meta.metaDescription?.length ?? 0,
      keywordCount: meta.keywords?.length ?? 0,
    },
    issues: [],
    content,
  };
}

function readAgentSources(): Record<string, string> {
  return readFiles([
    "agents/agents/1-trend-scout.ts",
    "agents/agents/2-topic-picker.ts",
    "agents/agents/3-image-gen.ts",
    "agents/agents/4-writer.ts",
    "agents/agents/5-publisher.ts",
  ]);
}

function readFrontendSources(): Record<string, string> {
  return readFiles([
    "src/components/PostCard.tsx",
    "src/components/SEO.tsx",
    "src/components/Header.tsx",
    "src/components/Footer.tsx",
    "src/pages/Index.tsx",
    "src/pages/Post.tsx",
  ]);
}

function readBackendSources(): Record<string, string> {
  return readFiles([
    "convex/schema.ts",
    "convex/posts.ts",
    "convex/http.ts",
  ]);
}

function readFiles(paths: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of paths) {
    const abs = path.join(PROJECT_ROOT, rel);
    try {
      out[rel] = fs.readFileSync(abs, "utf-8");
    } catch (err) {
      out[rel] = `[READ ERROR] ${String(err)}`;
    }
  }
  return out;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function sumStepDurations(steps: Array<{ durationMs?: number }>): number {
  return steps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0);
}

function findStepDuration(steps: Array<{ name: string; durationMs?: number }>, name: string): number {
  return steps.find((s) => s.name === name)?.durationMs ?? 0;
}

function findCallTotals(logs: LogSummary[], labelIncludes: string): number[] {
  return logs.flatMap((log) =>
    log.telemetry.llmCalls
      .filter((call) => call.label.includes(labelIncludes))
      .map((call) => call.usage?.totalTokens ?? 0)
  );
}

if (process.argv[1]?.endsWith("meta-analyzer.ts")) {
  const ctx = await buildAuditContext({ lastN: 10 });
  console.log(JSON.stringify(ctx, null, 2));
}
