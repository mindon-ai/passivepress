/**
 * PassivePress AI Affiliate Pipeline — Orchestrator
 * Entry point for the full article generation pipeline.
 *
 * Usage:
 *   npx tsx pipeline.ts              ← run once (publish to Convex)
 *   npx tsx pipeline.ts --dry-run    ← run without writing to Convex
 *   npx tsx pipeline.ts --topic "OpenAI o3 mini benchmark"  ← skip TrendScout
 *   npx tsx pipeline.ts --count 3    ← run pipeline 3 times sequentially
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

import * as trendScout from "./agents/1-trend-scout.ts";
import * as topicPicker from "./agents/2-topic-picker.ts";
import * as productResearcher from "./agents/3-product-researcher.ts";
import * as imageGen from "./agents/3-image-gen.ts";
import * as dataViz from "./agents/9-dataviz.ts";
import * as writer from "./agents/4-writer.ts";
import * as affiliateLinker from "./agents/7-affiliate-linker.ts";
import * as publisher from "./agents/5-publisher.ts";
import * as socialMedia from "./agents/10-social-media-agent.ts";
import { formatProjectCommand, spawnProjectCommand, runProjectCommand } from "./lib/project-command.ts";
import { runLogger } from "./lib/run-logger.ts";
import { countWords } from "./lib/reading-time.ts";
import { buildChosenTopicHistoryEntry } from "./lib/content-strategy.ts";
import { sendTelegramMessage, sendTelegramPhoto } from "./lib/telegram.ts";

import type {
  PipelineContext,
  PipelineOptions,
  TrendTopic,
} from "./types/pipeline.ts";
import { PipelineStepError } from "./types/pipeline.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, "logs");

function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function parseArgs(): PipelineOptions & { forceTopic?: string; count: number } {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const topicIdx = args.indexOf("--topic");
  const forceTopic = topicIdx !== -1 ? args[topicIdx + 1] : undefined;
  const countIdx = args.indexOf("--count");
  const count = countIdx !== -1 ? Math.max(1, parseInt(args[countIdx + 1] ?? "1", 10)) : 1;
  const resumeIdx = args.indexOf("--resume-from");
  const resumeFrom = resumeIdx !== -1 ? args[resumeIdx + 1] : undefined;

  return { dryRun, forceTopic, count, resumeFrom };
}

async function spawnAgent(scriptName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawnProjectCommand(formatProjectCommand(scriptName), {
      cwd: __dirname,
      stdio: "inherit",
    });
    proc.on("close", (code) => {
      const exitCode = code ?? 1;
      if (exitCode === 0) resolve(exitCode);
      else reject(new Error(`${scriptName} exited with code ${exitCode}`));
    });
    proc.on("error", reject);
  });
}

/**
 * Regenerate public/sitemap.xml from live Convex data, then commit and push
 * only that file so Cloudflare Pages picks up the latest post URLs without
 * waiting for the next manual deploy.
 *
 * This is non-fatal: if git auth or network fails, the article is still live
 * in Convex (and served by the dynamic /sitemap.xml route on convex.site);
 * the static sitemap will catch up on the next manual deploy.
 */
async function regenerateSitemap(pipelineDir: string): Promise<void> {
  const projectRoot = path.resolve(pipelineDir, "..");
  const sitemapScript = path.join(projectRoot, "scripts", "generate-sitemap.mjs");

  // 1. Regenerate the sitemap XML from live Convex data
  const genResult = await runProjectCommand(`node ${sitemapScript}`, { cwd: projectRoot });
  if (genResult.exitCode !== 0) {
    throw new Error(`generate-sitemap.mjs failed (exit ${genResult.exitCode}): ${genResult.stderr.trim()}`);
  }
  log(`[Sitemap] ${genResult.stdout.trim()}`);

  // 2. Stage public/sitemap.xml only
  const addResult = await runProjectCommand(`git add public/sitemap.xml`, { cwd: projectRoot });
  if (addResult.exitCode !== 0) {
    throw new Error(`git add sitemap failed: ${addResult.stderr.trim()}`);
  }

  // 3. Only commit if there are actual staged changes (guard against no-op)
  const diffResult = await runProjectCommand(`git diff --cached --quiet`, { cwd: projectRoot });
  if (diffResult.exitCode === 0) {
    log("[Sitemap] No sitemap changes staged — sitemap already current.");
    return;
  }

  // 4. Commit — Cloudflare Pages will rebuild from this push and serve the fresh sitemap
  const commitResult = await runProjectCommand(
    `git commit -m "chore: regenerate sitemap after agent publish"`,
    { cwd: projectRoot }
  );
  if (commitResult.exitCode !== 0) {
    throw new Error(`git commit sitemap failed: ${commitResult.stderr.trim()}`);
  }

  // 5. Push to origin — Cloudflare Pages triggers a new build from the push
  const pushResult = await runProjectCommand(`git push origin HEAD`, { cwd: projectRoot });
  if (pushResult.exitCode !== 0) {
    throw new Error(`git push sitemap failed: ${pushResult.stderr.trim()}`);
  }

  log("[Sitemap] Pushed to GitHub — Cloudflare Pages will rebuild with the new post URL.");
}

function loadResumeArtifact(inputPath: string): {
  path: string;
  trends?: TrendTopic[];
  chosen?: PipelineContext["chosen"];
} | null {
  const resolved = path.isAbsolute(inputPath) ? inputPath : path.resolve(LOGS_DIR, inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Resume artifact not found: ${resolved}`);
  }

  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  const trends = Array.isArray(raw.trends) ? raw.trends : undefined;
  const chosen = raw.chosen && typeof raw.chosen.title === "string" ? raw.chosen : undefined;

  if (!trends?.length && !chosen) {
    throw new Error(`Resume artifact has no reusable trends or chosen topic: ${resolved}`);
  }

  return { path: resolved, trends, chosen };
}

async function run(options: PipelineOptions & { forceTopic?: string }): Promise<void> {
  const runId = uuidv4();
  const ctx: Partial<PipelineContext> = { runId };
  const resumeArtifact = options.resumeFrom ? loadResumeArtifact(options.resumeFrom) : null;

  runLogger.startRun(runId, options.dryRun);
  log(`Pipeline start [runId: ${runId}]`);
  log(`Mode: ${options.dryRun ? "DRY RUN" : "PUBLISH"}`);

  // ── Telegram: pipeline start ──────────────────────────────────────
  await sendTelegramMessage(
    `🚀 <b>PassivePress Pipeline Started</b>\n\n` +
    `<b>Mode:</b> ${options.dryRun ? "🧪 DRY RUN" : "📡 LIVE PUBLISH"}\n` +
    `<b>Run ID:</b> <code>${runId}</code>\n` +
    `<b>Time:</b> ${new Date().toUTCString()}`
  );

  fs.mkdirSync(LOGS_DIR, { recursive: true });

  try {
    runLogger.startStep("TrendScout", resumeArtifact?.trends?.length ? `resumed from ${resumeArtifact.path}` : options.forceTopic ? "forced topic provided" : "discovering trends");
    try {
      if (resumeArtifact?.trends?.length) {
        ctx.trends = resumeArtifact.trends;
        log(`Resuming TrendScout output from: ${resumeArtifact.path}`);
        runLogger.succeedStep("TrendScout", `resumed ${ctx.trends.length} topics`);
      } else if (options.forceTopic) {
        log(`Skipping TrendScout — using forced topic: "${options.forceTopic}"`);
        const syntheticTrend: TrendTopic = {
          title: options.forceTopic,
          source: "manual",
          url: "",
          score: 100,
          suggestedCategory: "tech",
        };
        ctx.trends = [syntheticTrend];
        runLogger.succeedStep("TrendScout", `forced topic: ${options.forceTopic}`);
      } else {
        ctx.trends = await trendScout.run();
        log(`Found ${ctx.trends.length} trending topics`);

        if (ctx.trends.length === 0) {
          throw new Error("TrendScout returned no topics — all live sources failed and no fallback topics were available");
        }

        runLogger.succeedStep("TrendScout", `${ctx.trends.length} topics`);
      }
    } catch (err) {
      runLogger.failStep("TrendScout", err as Error);
      throw new PipelineStepError("TrendScout", err as Error);
    }

    runLogger.startStep("TopicPicker", resumeArtifact?.chosen ? `resumed from ${resumeArtifact.path}` : "selecting best topic");
    try {
      if (resumeArtifact?.chosen) {
        ctx.chosen = resumeArtifact.chosen;
        log(`Resuming chosen topic from: ${resumeArtifact.path}`);
      } else {
        ctx.chosen = await topicPicker.run(ctx.trends!);
      }
      log(`Chosen: "${ctx.chosen.title}" → category: ${ctx.chosen.category}`);
      runLogger.succeedStep("TopicPicker", `${ctx.chosen.category} — ${ctx.chosen.title}`);

      // ── Telegram: topic chosen ──────────────────────────────────────
      await sendTelegramMessage(
        `📰 <b>Topic Selected</b>\n\n` +
        `<b>${ctx.chosen.title}</b>\n` +
        `<b>Category:</b> ${ctx.chosen.category}`
      );
    } catch (err) {
      runLogger.failStep("TopicPicker", err as Error);
      throw new PipelineStepError("TopicPicker", err as Error);
    }

    runLogger.startStep("ProductResearcher", "fetching Amazon product data and review research");
    try {
      ctx.research = await productResearcher.run(ctx.chosen!);
      log(`Product research complete: ${ctx.research.products.length} products, ${ctx.research.keyFindings.length} findings`);
      runLogger.succeedStep("ProductResearcher", `${ctx.research.products.length} products, ${ctx.research.keyFindings.length} findings`);
    } catch (err) {
      log(`[ProductResearcher] Warning: Research failed, continuing without product data: ${(err as Error).message}`);
      runLogger.failStep("ProductResearcher", err as Error);
    }

    runLogger.startStep("ImageGen", "creating featured image");
    try {
      ctx.image = await imageGen.run(ctx.chosen!, undefined, ctx.research);
      log(`Image saved: ${ctx.image.localPath}`);
      log(`Image URL: ${ctx.image.publicUrl}`);
      runLogger.succeedStep("ImageGen", path.basename(ctx.image.localPath));
    } catch (err) {
      runLogger.failStep("ImageGen", err as Error);
      throw new PipelineStepError("ImageGen", err as Error);
    }

    runLogger.startStep("DataViz", "building chart blocks from research");
    let datavizResult: Awaited<ReturnType<typeof dataViz.run>> | undefined;
    try {
      datavizResult = await dataViz.run(ctx.chosen!, ctx.research);
      ctx.dataviz = datavizResult.charts;
      log(`DataViz complete: ${datavizResult.charts.length} chart(s)`);
      runLogger.succeedStep("DataViz", `${datavizResult.charts.length} charts`);
    } catch (err) {
      log(`[DataViz] Warning: DataViz failed, continuing without charts: ${(err as Error).message}`);
      runLogger.failStep("DataViz", err as Error);
    }

    runLogger.startStep("Writer", "drafting article");
    try {
      ctx.draft = await writer.run(ctx.chosen!, ctx.image!, ctx.research, datavizResult);
      const wordCount = countWords(ctx.draft.content);
      log(`Draft complete: "${ctx.draft.slug}" (${ctx.draft.readingTime} min read, ${wordCount} words)`);
      runLogger.succeedStep("Writer", `${ctx.draft.slug} — ${wordCount} words`);
    } catch (err) {
      runLogger.failStep("Writer", err as Error);
      throw new PipelineStepError("Writer", err as Error);
    }

    runLogger.startStep("AffiliateLinker", "resolving affiliate placeholders");
    try {
      const affiliateResult = await affiliateLinker.run(ctx.draft!, ctx.research?.products ?? []);
      ctx.draft!.content = affiliateResult.resolvedContent;
      ctx.affiliateLinks = affiliateResult.affiliateLinks;
      log(`AffiliateLinker complete: ${ctx.affiliateLinks.length} link records`);
      runLogger.succeedStep("AffiliateLinker", `${ctx.affiliateLinks.length} affiliate links`);
    } catch (err) {
      runLogger.failStep("AffiliateLinker", err as Error);
      throw new PipelineStepError("AffiliateLinker", err as Error);
    }

    runLogger.startStep("Publisher", options.dryRun ? "dry run preview" : "publishing to Convex");
    if (options.dryRun) {
      log(`[DRY RUN] Would publish: /${ctx.draft!.slug}`);
      log(`[DRY RUN] Reading time: ${ctx.draft!.readingTime} min`);
      log(`[DRY RUN] Category: ${ctx.chosen!.category}`);
      log(`[DRY RUN] Image: ${ctx.image!.publicUrl}`);
      console.log("\n--- DRAFT PREVIEW (first 500 chars) ---");
      console.log(ctx.draft!.content.slice(0, 500));
      runLogger.succeedStep("Publisher", `dry run: /${ctx.draft!.slug}`);
    } else {
      try {
        const result = await publisher.run(ctx as PipelineContext);
        ctx.convexPostId = result.convexPostId;
        log(`Published: ${result.url} [ID: ${result.convexPostId}]`);
        runLogger.succeedStep("Publisher", `${result.url} [${result.convexPostId}]`);

        // ── Telegram: pipeline complete with featured image ─────────────
        const siteUrl = process.env.PUBLIC_SITE_URL || "https://passivepress.qzz.io";
        const postUrl = `${siteUrl}${result.url}`;
        const wordCount = countWords(ctx.draft!.content);
        const caption =
          `✅ <b>New Post Published!</b>\n\n` +
          `<b>${ctx.draft!.title}</b>\n\n` +
          `📂 <b>Category:</b> ${ctx.chosen!.category}\n` +
          `🕐 <b>Reading time:</b> ${ctx.draft!.readingTime} min\n` +
          `📝 <b>Words:</b> ${wordCount}\n\n` +
          `🔗 <a href="${postUrl}">${postUrl}</a>`;

        if (ctx.image?.publicUrl) {
          await sendTelegramPhoto(ctx.image.publicUrl, caption);
        } else {
          await sendTelegramMessage(caption);
        }
      } catch (err) {
        runLogger.failStep("Publisher", err as Error);
        throw new PipelineStepError("Publisher", err as Error);
      }
    }

    if (!options.dryRun) {
      runLogger.startStep("SocialMediaAgent", "generating and distributing social posts");
      try {
        const socialResult = await socialMedia.run(ctx as PipelineContext, { auto: true, dryRun: false });
        ctx.socialCampaignId = socialResult.summary.campaignId;
        ctx.socialResults = socialResult.summary;
        runLogger.succeedStep(
          "SocialMediaAgent",
          `status=${socialResult.summary.status}; success=${socialResult.summary.succeededPlatforms.join(",") || "none"}; failed=${socialResult.summary.failedPlatforms.join(",") || "none"}`,
        );
      } catch (err) {
        log(`[SocialMediaAgent] Warning: social distribution failed after publish: ${(err as Error).message}`);
        runLogger.failStep("SocialMediaAgent", err as Error);
      }
    }

    runLogger.finishRun();
    runLogger.printSummary();

    // Regenerate sitemap immediately after publish so new post URL is indexed
    // without waiting for the next manual frontend deploy.
    if (!options.dryRun) {
      log("▶ Regenerating sitemap after publish...");
      try {
        await regenerateSitemap(__dirname);
        log("✓ Sitemap regenerated and pushed to GitHub");
      } catch (err) {
        log(`⚠ Sitemap regeneration failed (non-fatal): ${(err as Error).message}`);
      }
    }

    if (!options.dryRun) {
      log("▶ MetaAgent — starting report-only post-publish analysis");
      try {
        await spawnAgent("meta:report");
        log("✓ MetaAgent report complete");
        log("ℹ Mechanic auto-repairs are disabled in the publish path; run pnpm run mechanic manually after review if needed");
      } catch (err) {
        log(`✗ MetaAgent report failed: ${(err as Error).message}`);
      }
    }

    const logPath = path.join(LOGS_DIR, `${runId}.json`);
    fs.writeFileSync(
      logPath,
      JSON.stringify(
        {
          runId,
          timestamp: new Date().toISOString(),
          dryRun: options.dryRun,
          chosen: ctx.chosen ? { ...ctx.chosen, history: buildChosenTopicHistoryEntry(ctx.chosen) } : undefined,
          image: ctx.image,
          draft: {
            ...ctx.draft,
            contentPreview: ctx.draft!.content.slice(0, 500) + (ctx.draft!.content.length > 500 ? "... [truncated in log]" : ""),
            wordCount: countWords(ctx.draft!.content),
          },
          convexPostId: ctx.convexPostId,
          socialCampaignId: ctx.socialCampaignId,
          socialResults: ctx.socialResults,
          affiliateLinks: ctx.affiliateLinks,
          telemetry: runLogger.snapshot(),
        },
        null,
        2,
      ),
    );

    log(`Run log saved: ${logPath}`);
    log(`Pipeline complete ✓`);
  } catch (wrapped) {
    const isPipelineError = wrapped instanceof PipelineStepError;
    const error = isPipelineError ? (wrapped.cause as Error) : (wrapped as Error);
    const step = isPipelineError ? wrapped.step : "Pipeline";
    log(`ERROR in ${step}: ${error?.message ?? String(wrapped)}`);
    runLogger.finishRun();
    runLogger.printSummary();
    saveErrorLog(runId, ctx, error);

    // ── Telegram: pipeline failure ──────────────────────────────────
    await sendTelegramMessage(
      `❌ <b>Pipeline Failed</b>\n\n` +
      `<b>Step:</b> ${step}\n` +
      `<b>Error:</b> ${error?.message ?? String(wrapped)}\n\n` +
      `<b>Run ID:</b> <code>${runId}</code>`
    );

    throw error;
  }
}

function saveErrorLog(
  runId: string,
  ctx: Partial<PipelineContext>,
  error: Error,
): void {
  try {
    const errorLogPath = path.join(LOGS_DIR, `${runId}-error.json`);
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.writeFileSync(
      errorLogPath,
      JSON.stringify(
        {
          runId,
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            stack: error.stack,
          },
          partialContext: {
            trendsCount: ctx.trends?.length ?? 0,
            chosen: ctx.chosen ? { ...ctx.chosen, history: buildChosenTopicHistoryEntry(ctx.chosen) } : null,
            imageUrl: ctx.image?.publicUrl ?? null,
            draftSlug: ctx.draft?.slug ?? null,
            socialCampaignId: ctx.socialCampaignId ?? null,
          },
          telemetry: runLogger.snapshot(),
        },
        null,
        2,
      ),
    );
    console.error(`Error log saved: ${errorLogPath}`);
  } catch {
    // ignore log save errors
  }
}

const options = parseArgs();

if (options.count > 1) {
  log(`Batch mode: running pipeline ${options.count} times`);
  for (let i = 1; i <= options.count; i++) {
    log(`\n=== Batch run ${i}/${options.count} ===`);
    try {
      await run(options);
    } catch {
      log(`Batch run ${i} failed, continuing with next...`);
    }
  }
} else {
  await run(options);
}
