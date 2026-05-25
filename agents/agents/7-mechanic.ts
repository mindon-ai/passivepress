import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { callLLM, parseLLMJson } from "../lib/pi-llm-client.ts";
import { applyPatch, getBackupDir, validateProposal } from "../lib/meta-patcher.ts";
import { alignProposalTarget, inferTargetCandidates } from "../lib/proposal-targeting.ts";
import { saveRepairRunArtifact } from "../lib/repair-artifacts.ts";
import { verifyAndRollbackIfNeeded } from "../lib/meta-verifier.ts";
import { sendTelegramMessage } from "../lib/telegram.ts";
import type { Finding, MetaSessionLog, Proposal } from "../types/meta.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const LOGS_DIR = path.resolve(__dirname, "../logs");

const MECHANIC_SYSTEM_PROMPT = `You are the NeuronPress Mechanic (Agent 7).
Your job is to FIX findings identified by the MetaAgent.

You will receive:
1. A specific Finding (ID, Title, Description, Evidence).
2. One or more likely target files plus the current source code of the primary candidate.

Your task:
Generate a valid Proposal JSON to fix this finding.
A proposal must include a targeted find-replace patch (oldText -> newText).

RULES:
- oldText must be UNIQUE and EXACTLY match the file content.
- newText must solve the finding (e.g., diversifying categories, fixing token budgets, improving SEO).
- Do not make unnecessary changes.
- Return ONLY the Proposal JSON. No markdown. No commentary.

Format:
{
  "id": "fix-[finding-id]",
  "finding_id": "[finding-id]",
  "impact": "MEDIUM",
  "type": "code_edit",
  "title": "Fix for [finding-title]",
  "description": "Short explanation of the fix",
  "confidence": 0.85,
  "target_file": "[relative-path]",
  "target_file_candidates": ["[relative-path]"],
  "target_file_reasoning": "Why this file was chosen",
  "change": {
    "oldText": "...",
    "newText": "..."
  },
  "dry_run_recommended": true
}`;

async function getLatestMetaLog(): Promise<MetaSessionLog | null> {
  if (!fs.existsSync(LOGS_DIR)) return null;
  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith("meta-") && f.endsWith(".json"))
    .sort((a, b) => fs.statSync(path.join(LOGS_DIR, b)).mtimeMs - fs.statSync(path.join(LOGS_DIR, a)).mtimeMs);

  if (files.length === 0) return null;
  return JSON.parse(fs.readFileSync(path.join(LOGS_DIR, files[0]), "utf-8"));
}

async function run() {
  console.log("\n🔧 NeuronPress Mechanic (Agent 7) — Starting Maintenance...");
  
  const log = await getLatestMetaLog();
  if (!log || !log.findings || log.findings.length === 0) {
    console.log("No findings to address. Mechanic standing down.");
    return;
  }

  const findingsToFix = log.findings.filter(f => f.severity === "high" || f.severity === "critical" || f.severity === "medium");
  console.log(`Found ${findingsToFix.length} findings requiring attention.`);

  const backupDir = getBackupDir();
  const results: string[] = [];

  for (const finding of findingsToFix) {
    console.log(`\n[Mechanic] Addressing finding: ${finding.id} (${finding.title})`);
    
    const resolvedTarget = inferTargetCandidates(finding);
    const targetFile = resolvedTarget?.targetFile ?? "";

    if (!targetFile) {
      console.log(`[Mechanic] ⏭️ Skipping: Could not determine target file for ${finding.id}`);
      continue;
    }

    try {
      const sourcePath = path.join(PROJECT_ROOT, targetFile);
      const source = fs.readFileSync(sourcePath, "utf-8");
      const candidatesText = resolvedTarget?.candidates?.length
        ? resolvedTarget.candidates.map((candidate) => `- ${candidate}`).join("\n")
        : `- ${targetFile}`;
      const targetReasoning = resolvedTarget?.reasoning ?? "Selected from fallback target inference.";

      console.log(`[Mechanic] Calling LLM to engineer fix for ${targetFile}...`);
      const instructionPrompt = `Generate a safe, minimal Proposal JSON for this finding.`;
      const dynamicPayload = `Finding: ${JSON.stringify(finding, null, 2)}\n\nLikely target files:\n${candidatesText}\n\nPrimary target reasoning: ${targetReasoning}\n\nFile (${targetFile}) Source:\n${source}`;

      // Keep instructions concise and reusable; keep finding/file contents as the live payload.
      const userPrompt = `${instructionPrompt}\n\n${dynamicPayload}`;

      const rawProposal = await callLLM([
        { role: "system", content: MECHANIC_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ], 4096, `Mechanic Fix: ${finding.id}`);

      const proposal = alignProposalTarget(parseLLMJson<Proposal>(rawProposal), resolvedTarget);
      
      const validationError = validateProposal(proposal);
      if (validationError) {
        console.error(`[Mechanic] ❌ Invalid Proposal: ${validationError}`);
        continue;
      }

      console.log(`[Mechanic] Applying patch to ${targetFile}...`);
      const patchResult = await applyPatch({
        targetFile: proposal.target_file,
        oldText: proposal.change.oldText,
        newText: proposal.change.newText
      }, backupDir);

      if (patchResult.success) {
        console.log(`[Mechanic] ✅ Fix applied: ${proposal.title}`);

        if (proposal.dry_run_recommended) {
          console.log("[Mechanic] Running dry-run verification...");
          const verification = await verifyAndRollbackIfNeeded(
            proposal.target_file,
            patchResult.backupPath,
          );
          const artifactPath = saveRepairRunArtifact({
            actor: "mechanic",
            proposal,
            backupPath: patchResult.backupPath,
            verification,
          });

          if (verification.success) {
            console.log(`[Mechanic] ✓ ${verification.message}`);
            console.log(`[Mechanic] Artifact saved: ${artifactPath}`);
            results.push(`✅ <b>Fixed</b>: ${finding.title} (in ${targetFile})`);
          } else {
            console.warn(`[Mechanic] ⚠️ ${verification.message}`);
            console.warn(`[Mechanic] Artifact saved: ${artifactPath}`);
            results.push(`⚠️ <b>Rolled back</b>: ${finding.title} (${verification.message})`);
          }
        } else {
          const artifactPath = saveRepairRunArtifact({
            actor: "mechanic",
            proposal,
            backupPath: patchResult.backupPath,
          });
          console.log(`[Mechanic] Artifact saved: ${artifactPath}`);
          results.push(`✅ <b>Fixed</b>: ${finding.title} (in ${targetFile})`);
        }
      } else {
        console.error(`[Mechanic] ❌ Patch failed: ${patchResult.error}`);
        results.push(`❌ <b>Failed to fix</b>: ${finding.title} (${patchResult.error})`);
      }
    } catch (err) {
      console.error(`[Mechanic] Error addressing finding ${finding.id}:`, err);
    }
  }

  if (results.length > 0) {
    const text = `🔧 <b>Mechanic Maintenance Report</b>\n\n${results.join("\n")}\n\n<b>Backup</b>: <code>${backupDir}</code>`;
    await sendTelegramMessage(text);
  }
}

run().catch(err => console.error("Mechanic crashed:", err));
