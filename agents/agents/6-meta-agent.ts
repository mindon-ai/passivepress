import "dotenv/config";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { getMetaAgentConfig } from "../lib/convex-client.ts";
import { buildAuditContext } from "../lib/meta-analyzer.ts";
import { applyPatch, getBackupDir, validateProposal } from "../lib/meta-patcher.ts";
import { saveRepairRunArtifact } from "../lib/repair-artifacts.ts";
import { verifyAndRollbackIfNeeded } from "../lib/meta-verifier.ts";
import { sendTelegramMessage } from "../lib/telegram.ts";
import { loadSkill } from "../lib/skill-loader.ts";
import { runOneShotPiAgent } from "../lib/pi-agent-utils.ts";
import { createReturnMetaReportTool } from "../extensions/meta-tools.ts";
import type { MetaAgentConfig } from "../types/pipeline.ts";
import type { AuditContext, MetaReport, Proposal } from "../types/meta.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, "../logs");

interface MetaOptions {
  reportOnly: boolean;
  applyAll: boolean;
  lastN: number;
}

const DEFAULT_META_AGENT_CONFIG: MetaAgentConfig = {
  runtime: {
    enabled: true,
    defaultReportOnly: true,
    allowApplyAll: false,
    defaultLastN: 10,
  },
  auditContext: {
    previousMetaSessionsLimit: 5,
    sourceCharLimit: 6000,
    contentPreviewChars: 1200,
    includeFrontendSources: true,
    includeBackendSources: true,
    includeAgentSources: true,
    includeGaData: true,
  },
  report: {
    maxFindings: 8,
    maxProposals: 5,
    fallbackReportEnabled: true,
    filterAlreadyApplied: true,
    defaultConfidence: 0.5,
  },
  apply: {
    requireReviewForSchemaChanges: true,
    neverAutoApplyReviewRequired: true,
    runVerificationWhenRecommended: true,
    saveRepairArtifacts: true,
  },
  alerts: {
    telegramEnabled: true,
  },
  logging: {
    saveSessionLog: true,
  },
  promptControls: {
    customInstruction: "",
  },
};

let metaConfig = DEFAULT_META_AGENT_CONFIG;

function parseArgs(): MetaOptions {
  const args = process.argv.slice(2);
  return {
    reportOnly: args.includes("--report-only"),
    applyAll: args.includes("--apply-all"),
    lastN: (() => {
      const i = args.indexOf("--last");
      return i !== -1 ? Math.max(1, parseInt(args[i + 1] ?? String(metaConfig.runtime.defaultLastN), 10)) : metaConfig.runtime.defaultLastN;
    })(),
  };
}

function buildUserPrompt(ctx: AuditContext): string {
  const safeCtx = {
    generatedAt: ctx.generatedAt,
    previousMetaSessions: readPreviousMetaSessionSummaries(metaConfig.auditContext.previousMetaSessionsLimit),
    pipeline: ctx.pipeline,
    posts: ctx.posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      category: p.category,
      wordCount: p.wordCount,
      readingTime: p.readingTime,
      hasExcerpt: p.hasExcerpt,
      hasMetaTitle: p.hasMetaTitle,
      hasMetaDescription: p.hasMetaDescription,
      hasKeywords: p.hasKeywords,
      hasFeaturedImage: p.hasFeaturedImage,
      sections: p.sections,
      seo: p.seo,
      issues: p.issues,
      contentPreview: p.content?.slice(0, metaConfig.auditContext.contentPreviewChars),
    })),
    agentSources: metaConfig.auditContext.includeAgentSources ? pickSourceSubset(ctx.agentSources) : {},
    frontendSources: metaConfig.auditContext.includeFrontendSources ? pickSourceSubset(ctx.frontendSources) : {},
    backendSources: metaConfig.auditContext.includeBackendSources ? pickSourceSubset(ctx.backendSources) : {},
    gaData: metaConfig.auditContext.includeGaData ? ctx.gaData : null,
    constraints: ctx.constraints,
  };

  const instructionPrompt = `Analyze the AuditContext and return your MetaReport JSON.`;
  const dynamicPayload = JSON.stringify(safeCtx, null, 2);

  // Keep the audit instruction prefix distinct from the large runtime context payload.
  return `${instructionPrompt}\n\nHere is the full AuditContext for NeuronPress.\n\n${dynamicPayload}`;
}

function pickSourceSubset(sources: Record<string, string>): Record<string, string> {
  const trimmed: Record<string, string> = {};
  for (const [file, source] of Object.entries(sources)) {
    trimmed[file] = source.length > metaConfig.auditContext.sourceCharLimit ? `${source.slice(0, metaConfig.auditContext.sourceCharLimit)}\n/* [truncated by MetaAgent] */` : source;
  }
  return trimmed;
}

function readPreviousMetaSessionSummaries(limit = 5): Array<{
  timestamp: string;
  findings: string[];
  appliedProposals: string[];
}> {
  try {
    if (!fs.existsSync(LOGS_DIR)) return [];

    return fs.readdirSync(LOGS_DIR)
      .filter((f) => f.startsWith("meta-") && f.endsWith(".json"))
      .map((f) => ({
        fullPath: path.join(LOGS_DIR, f),
        mtime: fs.statSync(path.join(LOGS_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map(({ fullPath }) => {
        try {
          const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
          return {
            timestamp: raw.timestamp ?? "",
            findings: Array.isArray(raw.findings) ? raw.findings.map((f: { title?: string }) => f.title ?? "") : [],
            appliedProposals: Array.isArray(raw.appliedProposals) ? raw.appliedProposals : [],
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is { timestamp: string; findings: string[]; appliedProposals: string[] } => Boolean(item));
  } catch {
    return [];
  }
}

async function run(): Promise<void> {
  try {
    metaConfig = await getMetaAgentConfig();
    console.log("[MetaAgent] Loaded settings from Convex");
  } catch (err) {
    console.warn("[MetaAgent] Could not load Convex settings; using code defaults:", (err as Error).message);
  }

  if (!metaConfig.runtime.enabled) {
    console.log("[MetaAgent] Disabled by settings.");
    return;
  }

  const opts = parseArgs();
  if (metaConfig.runtime.defaultReportOnly) opts.reportOnly = true;
  if (!metaConfig.runtime.allowApplyAll) opts.applyAll = false;
  const backupDir = getBackupDir();

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║     NeuronPress MetaAgent — Starting Analysis    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log(`Mode    : ${opts.reportOnly ? "REPORT ONLY" : opts.applyAll ? "APPLY ALL" : "INTERACTIVE"}`);
  console.log(`Runs    : last ${opts.lastN}`);
  console.log(`Backup  : ${backupDir}\n`);

  console.log("[MetaAgent] Building audit context...");
  let ctx: AuditContext;
  try {
    ctx = await buildAuditContext({ lastN: opts.lastN });
  } catch (err) {
    console.error("[MetaAgent] Failed to build audit context:", err);
    process.exit(1);
  }

  console.log(`[MetaAgent] ✓ ${ctx.pipeline.runsAnalyzed} runs | ${ctx.posts.length} posts`);
  console.log("[MetaAgent] Category distribution:", ctx.pipeline.categoryDistribution);

  console.log("\n[MetaAgent] Calling pi agent for analysis...");
  let report: MetaReport;
  try {
    let capturedReport: Omit<MetaReport, "generatedAt"> | null = null;
    let returnMetaReportCallCount = 0;
    const returnTool = createReturnMetaReportTool((result) => {
      capturedReport = result;
    }, { once: true });
    const oneShotResult = await runOneShotPiAgent<Omit<MetaReport, "generatedAt">>({
      agentId: "MetaAgent",
      systemPrompt: loadSkill("meta-agent"),
      prompt:
        `Analyze the AuditContext and produce a MetaReport.\n\n` +
        `${buildUserPrompt(ctx)}\n\n` +
        `Return at most ${metaConfig.report.maxFindings} findings and ${metaConfig.report.maxProposals} proposals. ` +
        `${metaConfig.promptControls.customInstruction.trim() ? `Custom instruction: ${metaConfig.promptControls.customInstruction.trim()} ` : ""}` +
        `Call return_meta_report exactly once with your final findings and proposals. After calling return_meta_report, stop immediately and do not make another tool call.`,
      tools: [returnTool],
      returnToolName: "return_meta_report",
      getCapturedResult: () => capturedReport,
    });
    returnMetaReportCallCount = oneShotResult.returnCallCount;

    if (returnMetaReportCallCount > 1) {
      console.warn(`[MetaAgent] return_meta_report was called ${returnMetaReportCallCount} times; only the first call was accepted.`);
    }

    if (!capturedReport) {
      throw new Error("MetaAgent finished without calling return_meta_report.");
    }

    const finalReport = capturedReport as Omit<MetaReport, "generatedAt">;
    const agentReport: MetaReport = {
      generatedAt: new Date().toISOString(),
      runsAnalyzed: finalReport.runsAnalyzed,
      postsAudited: finalReport.postsAudited,
      findings: finalReport.findings,
      proposals: finalReport.proposals.map((proposal: Proposal) => ({
        ...proposal,
        confidence: typeof proposal.confidence === "number" ? proposal.confidence : metaConfig.report.defaultConfidence,
        target_file_candidates: Array.isArray(proposal.target_file_candidates)
          ? proposal.target_file_candidates
          : [proposal.target_file],
        target_file_reasoning: proposal.target_file_reasoning ?? "",
        backup_needed: proposal.backup_needed ?? true,
      })),
    };

    report = normalizeReport(agentReport, ctx);
    console.log(`[MetaAgent] ✓ Report generated: ${report.findings.length} findings, ${report.proposals.length} proposals`);
  } catch (err) {
    if (!metaConfig.report.fallbackReportEnabled) throw err;
    console.error("[MetaAgent] Model call failed, using fallback report:", err);
    report = buildFallbackReport(ctx);
  }

  printReport(report);

  if (opts.reportOnly) {
    if (metaConfig.logging.saveSessionLog) saveSessionLog(report, ctx, []);
    console.log("\n[MetaAgent] Report-only mode — no changes applied.");
    return;
  }

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const proposal of report.proposals) {
    const result = await handleProposal(proposal, opts, backupDir);
    if (result === "applied") applied.push(proposal.id);
    if (result === "skipped") skipped.push(proposal.id);
    if (result === "quit") break;
  }

  if (metaConfig.logging.saveSessionLog) saveSessionLog(report, ctx, applied);

  // Send report to Telegram
  if (metaConfig.alerts.telegramEnabled) await sendMetaTelegramReport(report, applied, skipped);

  console.log("\n[MetaAgent] Session complete.");
  console.log(`  Applied : ${applied.join(", ") || "none"}`);
  console.log(`  Skipped : ${skipped.join(", ") || "none"}`);
  console.log(`  Backup  : ${backupDir}`);
}

async function handleProposal(
  proposal: Proposal,
  opts: MetaOptions,
  backupDir: string,
): Promise<"applied" | "skipped" | "quit"> {
  console.log(`\n──── ${proposal.id} [${proposal.impact}] ────`);
  console.log(`File : ${proposal.target_file}`);
  if (proposal.target_file_candidates?.length) {
    console.log(`Candidates : ${proposal.target_file_candidates.join(", ")}`);
  }
  if (proposal.target_file_reasoning?.trim()) {
    console.log(`Reason : ${proposal.target_file_reasoning.trim()}`);
  }
  if (typeof proposal.confidence === "number") {
    console.log(`Confidence : ${proposal.confidence.toFixed(2)}`);
  }
  console.log(`Type : ${proposal.type}`);
  console.log(`Title: ${proposal.title}`);
  console.log(`\n${proposal.description}`);

  const validationError = validateProposal(proposal);
  if (validationError) {
    console.error(`\n⚠ Blocked: ${validationError}`);
    return "skipped";
  }

  if (proposal.requires_review) {
    console.log("\n⚠ This proposal is flagged requires_review: true");
    console.log("  Review the change carefully before applying.");
  }

  console.log(`\nOLD TEXT (to be replaced):\n${"─".repeat(60)}`);
  console.log(proposal.change.oldText.slice(0, 500));
  if (proposal.change.oldText.length > 500) console.log("  ... [truncated for display]");

  console.log(`\nNEW TEXT (replacement):\n${"─".repeat(60)}`);
  console.log(proposal.change.newText.slice(0, 500));
  if (proposal.change.newText.length > 500) console.log("  ... [truncated for display]");

  let answer: string;
  if (opts.applyAll) {
    if (proposal.requires_review && metaConfig.apply.neverAutoApplyReviewRequired) {
      console.log("\nApply? [SKIPPED: requires_review proposals are never auto-applied]");
      return "skipped";
    }
    answer = "y";
    console.log("\nApply? [AUTO-APPLYING due to --apply-all]");
  } else {
    answer = await prompt("\nApply? [y/n/skip/quit]: ");
  }

  if (answer === "quit" || answer === "q") return "quit";
  if (answer !== "y") {
    console.log(`  → Skipped ${proposal.id}`);
    return "skipped";
  }

  const result = await applyPatch(
    {
      targetFile: proposal.target_file,
      oldText: proposal.change.oldText,
      newText: proposal.change.newText,
    },
    backupDir,
  );

  if (!result.success) {
    console.error(`  → ✗ Patch failed: ${result.error}`);
    return "skipped";
  }

  console.log(`  → Backed up to: ${result.backupPath}`);
  console.log("  → Applied ✓");

  if (proposal.dry_run_recommended) {
    const runVerification = metaConfig.apply.runVerificationWhenRecommended ? (opts.applyAll ? "y" : await prompt("  → Run dry-run to test? [y/n]: ")) : "n";
    if (runVerification === "y") {
      console.log("  → Spawning pipeline --dry-run ...");
      const verification = await verifyAndRollbackIfNeeded(
        proposal.target_file,
        result.backupPath,
      );
      const artifactPath = metaConfig.apply.saveRepairArtifacts ? saveRepairRunArtifact({
        actor: "meta-agent",
        proposal,
        backupPath: result.backupPath,
        verification,
      }) : "disabled";
      if (verification.success) {
        console.log(`  → ✓ ${verification.message}`);
        console.log(`  → Artifact: ${artifactPath}`);
        if (verification.dryRun?.chosenCategory) console.log(`  → Category chosen: ${verification.dryRun.chosenCategory}`);
        if (verification.dryRun?.wordCount) console.log(`  → Word count: ${verification.dryRun.wordCount}`);
      } else {
        console.warn(`  → ✗ ${verification.message}`);
        console.warn(`  → Artifact: ${artifactPath}`);
        if (verification.backupPath) console.warn(`  → Backup: ${verification.backupPath}`);
        return "skipped";
      }
    }
  }

  return "applied";
}

async function sendMetaTelegramReport(report: MetaReport, applied: string[], skipped: string[]) {
  const findingsSummary = report.findings
    .map(f => `• [${f.id}] <b>${f.severity.toUpperCase()}</b>: ${f.title}`)
    .join('\n');

  const proposalsSummary = report.proposals
    .map(p => {
      const status = applied.includes(p.id) ? '✅' : skipped.includes(p.id) ? '⏭️' : '⏳';
      return `${status} [${p.id}] <i>${p.target_file}</i>: ${p.title}`;
    })
    .join('\n');

  const text = `🧠 <b>MetaAgent Analysis Report</b>

<b>Analyzed:</b> ${report.runsAnalyzed} runs | ${report.postsAudited} posts

<b>Findings (${report.findings.length}):</b>
${findingsSummary || '<i>No findings</i>'}

<b>Proposals (${report.proposals.length}):</b>
${proposalsSummary || '<i>No proposals</i>'}

<b>Status:</b>
Applied: ${applied.length} | Skipped: ${skipped.length}
`;

  await sendTelegramMessage(text);
}

function printReport(report: MetaReport): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  NeuronPress MetaAgent — Improvement Report");
  console.log(`${"═".repeat(60)}`);
  console.log(`Generated  : ${report.generatedAt}`);
  console.log(`Runs       : ${report.runsAnalyzed}`);
  console.log(`Posts      : ${report.postsAudited}`);

  console.log(`\nFINDINGS (${report.findings.length})`);
  console.log("─".repeat(60));
  for (const f of report.findings) {
    const sev = (f.severity ?? "low").toUpperCase().padEnd(8);
    const cat = (f.category ?? "pipeline").padEnd(10);
    console.log(`[${f.id ?? "F???"}] ${sev} | ${cat} — ${f.title ?? "Untitled finding"}`);
    console.log(`         Evidence: ${f.evidence ?? "No evidence provided"}`);
  }

  console.log(`\nPROPOSALS (${report.proposals.length})`);
  console.log("─".repeat(60));
  for (const p of report.proposals) {
    const imp = (p.impact ?? "LOW").padEnd(6);
    const type = (p.type ?? "code_edit").padEnd(14);
    const rev = p.requires_review ? " [REVIEW]" : "";
    const confidence = typeof p.confidence === "number" ? ` | conf=${p.confidence.toFixed(2)}` : "";
    console.log(`[${p.id ?? "P???"}] ${imp} | ${type} | ${p.target_file ?? "unknown"}${rev}${confidence}`);
    console.log(`         ${p.title ?? "Untitled proposal"}`);
    if (p.target_file_candidates?.length) {
      console.log(`         Candidates: ${p.target_file_candidates.join(", ")}`);
    }
    if (p.target_file_reasoning?.trim()) {
      console.log(`         Reasoning: ${p.target_file_reasoning.trim()}`);
    }
  }
}

function normalizeReport(report: MetaReport, ctx: AuditContext): MetaReport {
  return {
    generatedAt: report.generatedAt ?? new Date().toISOString(),
    runsAnalyzed: report.runsAnalyzed ?? ctx.pipeline.runsAnalyzed,
    postsAudited: report.postsAudited ?? ctx.posts.length,
    findings: Array.isArray(report.findings)
      ? report.findings.slice(0, metaConfig.report.maxFindings).map((f, i) => ({
          id: f?.id ?? `F${String(i + 1).padStart(3, "0")}`,
          severity: normalizeSeverity(f?.severity),
          category: normalizeCategory(f?.category),
          title: f?.title ?? "Untitled finding",
          description: stringifyMaybeObject(f?.description),
          evidence: stringifyMaybeObject(f?.evidence),
        }))
      : [],
    proposals: Array.isArray(report.proposals)
      ? report.proposals
          .slice(0, metaConfig.report.maxProposals)
          .filter((p) => p && p.change && typeof p.target_file === "string")
          .filter((p) => !metaConfig.report.filterAlreadyApplied || !isProposalAlreadyApplied(p.target_file, p.change?.newText ?? ""))
          .map((p, i) => ({
            id: p.id ?? `P${String(i + 1).padStart(3, "0")}`,
            finding_id: p.finding_id ?? "",
            impact: normalizeImpact(p.impact),
            type: normalizeProposalType(p.type),
            title: p.title ?? "Untitled proposal",
            description: stringifyMaybeObject(p.description),
            confidence: typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : metaConfig.report.defaultConfidence,
            requires_review: Boolean(p.requires_review),
            target_file: p.target_file,
            target_file_candidates: Array.isArray(p.target_file_candidates)
              ? p.target_file_candidates.filter((candidate) => typeof candidate === "string" && candidate.trim())
              : [p.target_file],
            target_file_reasoning: stringifyMaybeObject(p.target_file_reasoning),
            backup_needed: p.backup_needed !== false,
            change: {
              oldText: p.change?.oldText ?? "",
              newText: p.change?.newText ?? "",
            },
            test_command: p.test_command,
            dry_run_recommended: Boolean(p.dry_run_recommended),
          }))
      : [],
  };
}

function stringifyMaybeObject(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isProposalAlreadyApplied(targetFile: string, newText: string): boolean {
  if (!targetFile || !newText) return false;
  try {
    const abs = path.resolve(__dirname, "../..", targetFile);
    if (!fs.existsSync(abs)) return false;
    const current = fs.readFileSync(abs, "utf-8");
    return current.includes(newText);
  } catch {
    return false;
  }
}

function normalizeSeverity(value: unknown): "critical" | "high" | "medium" | "low" {
  return value === "critical" || value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function normalizeCategory(value: unknown): "quality" | "tokens" | "diversity" | "seo" | "pipeline" | "frontend" {
  return value === "quality" || value === "tokens" || value === "diversity" || value === "seo" || value === "pipeline" || value === "frontend"
    ? value
    : "pipeline";
}

function normalizeImpact(value: unknown): "HIGH" | "MEDIUM" | "LOW" {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW" ? value : "LOW";
}

function normalizeProposalType(value: unknown): "prompt_edit" | "code_edit" | "config_change" | "schema_change" | "frontend_edit" {
  return value === "prompt_edit" || value === "code_edit" || value === "config_change" || value === "schema_change" || value === "frontend_edit"
    ? value
    : "code_edit";
}

function buildFallbackReport(ctx: AuditContext): MetaReport {
  const findings: MetaReport["findings"] = [];
  const proposals: MetaReport["proposals"] = [];

  if (ctx.pipeline.dominantCategoryPct >= 0.8) {
    findings.push({
      id: "F001",
      severity: "critical",
      category: "diversity",
      title: "Category monoculture in recent runs",
      description: "One category dominates recent pipeline output, reducing SEO breadth and topic variety.",
      evidence: `${ctx.pipeline.dominantCategory} = ${Math.round(ctx.pipeline.dominantCategoryPct * 100)}% of recent runs`,
    });
  }

  const imageBudget = ctx.pipeline.llmCallBreakdown.find((c) => c.label.includes("ImageGen"));
  if (imageBudget?.hitsBudget) {
    findings.push({
      id: "F002",
      severity: "high",
      category: "tokens",
      title: "ImageGen is hitting its token budget",
      description: "Image prompt generation is close to the max token cap, increasing truncation risk.",
      evidence: `${imageBudget.label}: avg completion ${imageBudget.avgCompletion}/${imageBudget.maxTokensBudget}`,
    });
  }

  const faqMissing = ctx.posts.filter((p) => !p.sections.hasFAQ).length;
  if (faqMissing > 0) {
    findings.push({
      id: "F003",
      severity: "high",
      category: "quality",
      title: "Published posts are missing FAQ sections",
      description: "The Writer prompt is not consistently enforcing FAQ output.",
      evidence: `${faqMissing}/${ctx.posts.length} audited posts missing ## FAQ`,
    });
  }

  findings.push({
    id: "F004",
    severity: "low",
    category: "pipeline",
    title: "Fallback report generated",
    description: "The MetaAgent LLM analysis timed out, so this report was generated from deterministic audit rules.",
    evidence: "Model request failed; fallback report used",
  });

  proposals.push({
    id: "P001",
    finding_id: "F004",
    impact: "LOW",
    type: "code_edit",
    title: "Reduce MetaAgent prompt size if timeouts persist",
    description: "Trim source content or send fewer posts per analysis call to avoid provider timeouts.",
    confidence: 0.4,
    requires_review: false,
    target_file: "agents/agents/6-meta-agent.ts",
    target_file_candidates: ["agents/agents/6-meta-agent.ts"],
    target_file_reasoning: "Fallback proposal targets the MetaAgent file because the timeout issue originates in MetaAgent prompt construction.",
    backup_needed: true,
    change: {
      oldText: "contentPreview: p.content?.slice(0, 2000),",
      newText: "contentPreview: p.content?.slice(0, 2000),",
    },
    dry_run_recommended: false,
  });

  return {
    generatedAt: new Date().toISOString(),
    runsAnalyzed: ctx.pipeline.runsAnalyzed,
    postsAudited: ctx.posts.length,
    findings,
    proposals,
  };
}

function saveSessionLog(report: MetaReport, ctx: AuditContext, appliedIds: string[]): void {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(LOGS_DIR, `meta-${ts}.json`);
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const log = {
    type: "meta-agent-session",
    timestamp: new Date().toISOString(),
    runsAnalyzed: ctx.pipeline.runsAnalyzed,
    postsAudited: ctx.posts.length,
    categoryDistribution: ctx.pipeline.categoryDistribution,
    findingsCount: report.findings.length,
    proposalsCount: report.proposals.length,
    appliedProposals: appliedIds,
    findings: report.findings,
    proposals: report.proposals.map((p) => ({
      ...p,
      change: {
        oldText: p.change.oldText.slice(0, 200) + (p.change.oldText.length > 200 ? "..." : ""),
        newText: p.change.newText.slice(0, 200) + (p.change.newText.length > 200 ? "..." : ""),
      },
    })),
  };

  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`\n[MetaAgent] Session log saved: ${logPath}`);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

await run();

