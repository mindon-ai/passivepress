import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadSkill } from "../lib/skill-loader.ts";
import { runOneShotPiAgent } from "../lib/pi-agent-utils.ts";
import { createReturnSocialPostsTool } from "../extensions/social-media-tools.ts";
import {
  buildSocialInputFromPipeline,
  buildSocialInputFromPublishedPost,
} from "../lib/social/content-builder.ts";
import {
  resolveSocialConfig,
  getRequestedPlatforms,
} from "../lib/social/config.ts";
import { publishPlatform } from "../lib/social/publisher.ts";
import { buildSocialSummary } from "../lib/social/result-summary.ts";
import { sendTelegramMessage } from "../lib/telegram.ts";
import {
  getSocialMediaConfig,
  createSocialCampaign,
  createSocialPlatformAttempt,
  finalizeSocialCampaign,
  finalizeSocialPlatformAttempt,
  getPublishedPostById,
  getPublishedPostBySlug,
  getSocialPlatformStatusForPost,
  getSuccessfulSocialPlatformPost,
} from "../lib/convex-client.ts";
import type { PipelineContext, SocialMediaConfig } from "../types/pipeline.ts";
import type {
  SocialAgentResult,
  SocialCampaignTrigger,
  SocialGeneratedCopy,
  SocialPlatform,
  SocialPlatformAttempt,
} from "../types/social.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, "../logs");

interface SocialCliOptions {
  slug?: string;
  postId?: string;
  platforms?: string;
  dryRun: boolean;
  force: boolean;
  retryFailed: boolean;
  auto: boolean;
}

interface SocialRunOverrides extends Partial<SocialCliOptions> {
  trigger?: SocialCampaignTrigger;
}

const DEFAULT_SOCIAL_MEDIA_CONFIG: SocialMediaConfig = {
  runtime: { enabled: true, dryRun: false, force: false, retryFailed: false, failManualProcessOnAllFailed: true },
  platforms: { x: true },
  copy: {
    maxTextChars: 280,
    hashtagCount: 3,
    requiredFirstHashtag: "PassivePress",
    includeArticlePayload: true,
    includeDryRunFlag: true,
    customInstruction: "",
  },
  campaign: {
    copyVersion: "social-x-playwright-v1",
    skipIfExistingSuccess: true,
    createCampaignInDryRun: true,
  },
  alerts: { telegramOnAutoFailure: true },
  logging: { writeSocialLog: true },
};

function parseArgs(): SocialCliOptions {
  const args = process.argv.slice(2);
  const getValue = (flag: string) => {
    const index = args.indexOf(flag);
    return index !== -1 ? args[index + 1] : undefined;
  };

  return {
    slug: getValue("--slug"),
    postId: getValue("--post-id"),
    platforms: getValue("--platforms"),
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    retryFailed: args.includes("--retry-failed"),
    auto: args.includes("--auto"),
  };
}

async function generateSocialCopy(
  payload: Record<string, unknown>,
  settings: SocialMediaConfig,
): Promise<SocialGeneratedCopy> {
  let captured: SocialGeneratedCopy | null = null;

  const returnTool = createReturnSocialPostsTool((result) => {
    captured = result;
  }, { once: true });

  await runOneShotPiAgent<SocialGeneratedCopy>({
    agentId: "SocialMediaAgent",
    systemPrompt: loadSkill("social-media-agent"),
    prompt:
      `Generate X-only social copy for this already-published PassivePress buying guide.\n\n` +
      `${JSON.stringify(settings.copy.includeArticlePayload ? payload : { requestedPlatforms: payload.requestedPlatforms, platformMode: payload.platformMode }, null, 2)}\n\n` +
      `Rules: keep X final post within ${settings.copy.maxTextChars} characters, produce exactly ${settings.copy.hashtagCount} hashtags, first hashtag must be ${settings.copy.requiredFirstHashtag}.\n` +
      `${settings.copy.customInstruction.trim() ? `Custom instruction: ${settings.copy.customInstruction.trim()}\n` : ""}` +
      `Call return_social_posts exactly once with the final structured payload. Do not output prose.`,
    tools: [returnTool],
    returnToolName: "return_social_posts",
    getCapturedResult: () => captured,
  });

  if (!captured) {
    throw new Error(
      "Social media agent finished without calling return_social_posts.",
    );
  }

  return captured;
}

function ensureLogDir() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function writeSocialLog(runId: string, artifact: Record<string, unknown>) {
  ensureLogDir();
  const logPath = path.join(LOGS_DIR, `${runId}-social.json`);
  fs.writeFileSync(logPath, JSON.stringify(artifact, null, 2));
  return logPath;
}

function summarizeFailures(
  attempts: SocialPlatformAttempt[],
): string | undefined {
  const failures = attempts.filter((attempt) => attempt.status === "failed");
  if (failures.length === 0) return undefined;

  return failures
    .map(
      (attempt) =>
        `${attempt.platform}: ${attempt.errorMessage ?? attempt.errorCode ?? "unknown error"}`,
    )
    .join("; ");
}

function resolveTrigger(
  pipelineCtx: PipelineContext | undefined,
  overrides: SocialRunOverrides,
): SocialCampaignTrigger {
  if (overrides.trigger) return overrides.trigger;
  if (overrides.retryFailed) return "retry";
  if (pipelineCtx || overrides.auto) return "auto";
  return "manual";
}

function getPlatformCopyText(
  platform: SocialPlatform,
  copy: SocialGeneratedCopy,
  settings: SocialMediaConfig,
): { text: string; hashtags: string[] } {
  if (platform !== "x") {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const rawHashtags = copy.x.hashtags ?? [];
  const required = settings.copy.requiredFirstHashtag.replace(/^#/, "");
  const hashtags = [required, ...rawHashtags.filter((tag) => tag.replace(/^#/, "").toLowerCase() !== required.toLowerCase())]
    .map((tag) => tag.replace(/^#/, ""))
    .slice(0, settings.copy.hashtagCount);
  return { text: copy.x.text.slice(0, settings.copy.maxTextChars), hashtags };
}

async function resolveInput(
  pipelineCtx: PipelineContext | undefined,
  options: SocialCliOptions,
  runId: string,
) {
  const config = resolveSocialConfig();

  if (pipelineCtx) {
    return {
      config,
      input: buildSocialInputFromPipeline(pipelineCtx, config),
      requestedPlatforms: getRequestedPlatforms(options.platforms),
      pipelineCtx,
    };
  }

  const post = options.slug
    ? await getPublishedPostBySlug(options.slug)
    : options.postId
      ? await getPublishedPostById(options.postId)
      : null;

  if (!post) {
    throw new Error(
      "Provide --slug or --post-id for manual social runs, and make sure the post exists.",
    );
  }

  return {
    config,
    input: buildSocialInputFromPublishedPost(post, config),
    requestedPlatforms: getRequestedPlatforms(options.platforms),
    pipelineCtx: { runId } as PipelineContext,
  };
}

export async function run(
  pipelineCtx?: PipelineContext,
  overrides: SocialRunOverrides = {},
): Promise<SocialAgentResult> {
  let settings = DEFAULT_SOCIAL_MEDIA_CONFIG;
  try {
    settings = await getSocialMediaConfig();
    console.log("[SocialMediaAgent] Loaded settings from Convex");
  } catch (err) {
    console.warn("[SocialMediaAgent] Could not load Convex settings; using code defaults:", (err as Error).message);
  }

  const parsed = pipelineCtx
    ? {
        slug: pipelineCtx.draft.slug,
        postId: pipelineCtx.convexPostId,
        platforms: overrides.platforms,
        dryRun: overrides.dryRun ?? settings.runtime.dryRun,
        force: overrides.force ?? settings.runtime.force,
        retryFailed: overrides.retryFailed ?? settings.runtime.retryFailed,
        auto: overrides.auto ?? true,
      }
    : { ...parseArgs(), ...overrides };

  parsed.dryRun = (overrides.dryRun ?? parsed.dryRun) || settings.runtime.dryRun;
  parsed.force = (overrides.force ?? parsed.force) || settings.runtime.force;
  parsed.retryFailed = (overrides.retryFailed ?? parsed.retryFailed) || settings.runtime.retryFailed;

  if (!settings.runtime.enabled) {
    const now = Date.now();
    const summary = buildSocialSummary({
      postId: parsed.postId,
      postSlug: parsed.slug ?? pipelineCtx?.draft.slug ?? "unknown",
      postTitle: pipelineCtx?.draft.title ?? "Social disabled",
      canonicalUrl: "",
      requestedPlatforms: [],
      attemptedPlatforms: [],
      dryRun: true,
      startedAt: now,
      completedAt: now,
      attempts: [],
      errorSummary: "Social media agent disabled by settings",
    });
    return { summary, shouldFailProcess: false };
  }

  const runId = pipelineCtx?.runId ?? `social-${Date.now()}`;
  const { config, input, requestedPlatforms } = await resolveInput(
    pipelineCtx,
    parsed,
    runId,
  );
  const trigger = resolveTrigger(pipelineCtx, overrides);

  let targetPlatforms = requestedPlatforms.filter((platform) => settings.platforms[platform]);
  if (parsed.retryFailed) {
    const existing = await getSocialPlatformStatusForPost(input.slug);
    const failedPlatforms = existing
      .filter((item) => item.status === "failed")
      .map((item) => item.platform);

    if (failedPlatforms.length === 0) {
      console.log("[SocialMediaAgent] --retry-failed: no failed platforms found for this post. Nothing to retry.");
      targetPlatforms = [];
    } else {
      targetPlatforms = requestedPlatforms
        .filter((platform) => settings.platforms[platform])
        .filter((platform) => failedPlatforms.includes(platform));
    }
  }

  if (targetPlatforms.length === 0) {
    throw new Error(`No valid social platforms requested for post ${input.slug}.`);
  }

  const startedAt = Date.now();

  const campaignId = await createSocialCampaign({
    postId: input.postId,
    postSlug: input.slug,
    postTitle: input.title,
    canonicalUrl: input.canonicalUrl,
    featuredImageUrl: input.featuredImageUrl,
    trigger,
    platformsRequested: targetPlatforms,
    dryRun: parsed.dryRun,
    force: parsed.force,
    retryFailed: parsed.retryFailed,
    copyVersion: settings.campaign.copyVersion,
  });

  const copy = await generateSocialCopy({
    article: input,
    requestedPlatforms: targetPlatforms,
    dryRun: settings.copy.includeDryRunFlag ? parsed.dryRun : undefined,
    platformMode: "x-only-playwright",
  }, settings);

  const attempts: SocialPlatformAttempt[] = [];

  for (const platform of targetPlatforms) {
    const platformCopy = getPlatformCopyText(platform, copy, settings);
    const attemptRow = await createSocialPlatformAttempt({
      campaignId,
      postId: input.postId,
      postSlug: input.slug,
      platform,
      generatedText: platformCopy.text,
      generatedHashtags: platformCopy.hashtags,
      imageUrl: input.featuredImageUrl,
      requestPayload: { dryRun: parsed.dryRun, publisher: "playwright" },
    });

    const existingSuccess = settings.campaign.skipIfExistingSuccess && !parsed.force
      ? await getSuccessfulSocialPlatformPost(input.slug, platform)
      : null;

    if (existingSuccess) {
      const skipped: SocialPlatformAttempt = {
        platform,
        status: "skipped",
        attemptNumber: attemptRow.attemptNumber,
        generatedText: attemptRow.generatedText,
        generatedHashtags: attemptRow.generatedHashtags,
        imageUrl: input.featuredImageUrl,
        errorCode: "duplicate",
        errorMessage: `Skipping ${platform}; a successful post already exists for ${input.slug}. Use --force to repost.`,
      };

      await finalizeSocialPlatformAttempt({
        attemptId: attemptRow.attemptId,
        status: skipped.status,
        generatedText: skipped.generatedText,
        generatedHashtags: skipped.generatedHashtags,
        imageUrl: skipped.imageUrl,
        errorCode: skipped.errorCode,
        errorMessage: skipped.errorMessage,
      });

      attempts.push(skipped);
      continue;
    }

    const result = await publishPlatform(platform, {
      config,
      input,
      copy,
      dryRun: parsed.dryRun,
    });

    const attempt: SocialPlatformAttempt = {
      platform,
      status: result.status,
      attemptNumber: attemptRow.attemptNumber,
      remotePostId: result.remotePostId,
      remoteUrl: result.remoteUrl,
      requestPayload: result.requestPayload ?? null,
      responsePayload: result.responsePayload ?? null,
      generatedText: result.generatedText,
      generatedHashtags: result.generatedHashtags,
      imageUrl: input.featuredImageUrl,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      publishedAt: result.publishedAt,
      retryHistory: result.retryHistory,
    };

    await finalizeSocialPlatformAttempt({
      attemptId: attemptRow.attemptId,
      status: attempt.status,
      remotePostId: attempt.remotePostId,
      remoteUrl: attempt.remoteUrl,
      requestPayload: attempt.requestPayload,
      responsePayload: attempt.responsePayload,
      generatedText: attempt.generatedText,
      generatedHashtags: attempt.generatedHashtags,
      imageUrl: attempt.imageUrl,
      errorCode: attempt.errorCode,
      errorMessage: attempt.errorMessage,
      publishedAt: attempt.publishedAt,
    });

    attempts.push(attempt);
  }

  const summary = buildSocialSummary({
    campaignId,
    postId: input.postId,
    postSlug: input.slug,
    postTitle: input.title,
    canonicalUrl: input.canonicalUrl,
    requestedPlatforms: targetPlatforms,
    attemptedPlatforms: attempts.map((attempt) => attempt.platform),
    dryRun: parsed.dryRun,
    startedAt,
    completedAt: Date.now(),
    copy,
    attempts,
    errorSummary: summarizeFailures(attempts),
  });

  await finalizeSocialCampaign({
    campaignId,
    status: summary.status,
    platformsSucceeded: summary.succeededPlatforms,
    platformsFailed: summary.failedPlatforms,
    errorSummary: summary.errorSummary,
  });

  if (pipelineCtx) {
    pipelineCtx.socialCampaignId = campaignId;
    pipelineCtx.socialResults = summary;
  }

  const logPath = settings.logging.writeSocialLog ? writeSocialLog(runId, {
    runId,
    trigger,
    dryRun: parsed.dryRun,
    input,
    summary,
  }) : "disabled";

  if (
    !parsed.dryRun &&
    trigger === "auto" &&
    config.telegramAlertsEnabled &&
    settings.alerts.telegramOnAutoFailure &&
    summary.failedPlatforms.length > 0
  ) {
    await sendTelegramMessage(
      [
        `⚠️ Social posting failed for <b>${input.title}</b>`,
        `Slug: <code>${input.slug}</code>`,
        `URL: ${input.canonicalUrl}`,
        `Succeeded: ${summary.succeededPlatforms.join(", ") || "none"}`,
        `Failed: ${summary.failedPlatforms.join(", ") || "none"}`,
        `Details: ${summary.errorSummary ?? "See logs."}`,
        `Manual retry: pnpm run social -- --slug ${input.slug} --retry-failed`,
      ].join("\n"),
    );
  }

  console.log(`[SocialMediaAgent] Log saved: ${logPath}`);
  console.log(
    `[SocialMediaAgent] ${summary.status.toUpperCase()} — success=${summary.succeededPlatforms.join(",") || "none"} failed=${summary.failedPlatforms.join(",") || "none"} skipped=${summary.skippedPlatforms.join(",") || "none"}`,
  );

  const shouldFailProcess =
    !pipelineCtx &&
    !parsed.dryRun &&
    settings.runtime.failManualProcessOnAllFailed &&
    summary.succeededPlatforms.length === 0 &&
    summary.failedPlatforms.length > 0;

  return { summary, shouldFailProcess };
}

if (process.argv[1]?.endsWith("10-social-media-agent.ts")) {
  run(undefined, parseArgs())
    .then((result) => {
      if (result.shouldFailProcess) process.exit(1);
    })
    .catch((error) => {
      console.error("[SocialMediaAgent] Error:", error);
      process.exit(1);
    });
}
