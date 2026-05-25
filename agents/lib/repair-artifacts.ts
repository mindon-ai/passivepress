import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Proposal, RepairRunArtifact } from "../types/meta.ts";
import type { VerificationResult } from "./meta-verifier.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, "../logs");

export function saveRepairRunArtifact(input: {
  actor: "meta-agent" | "mechanic";
  proposal: Proposal;
  backupPath: string | null;
  verification?: VerificationResult;
}): string {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const timestamp = new Date().toISOString();
  const safeTs = timestamp.replace(/[:.]/g, "-");
  const fileName = `${input.actor === "meta-agent" ? "meta-proposal" : "mechanic-repair"}-${safeTs}-${sanitizeId(input.proposal.id)}.json`;
  const filePath = path.join(LOGS_DIR, fileName);

  const artifact: RepairRunArtifact = {
    type: input.actor === "meta-agent" ? "meta-proposal-run" : "mechanic-repair-run",
    timestamp,
    actor: input.actor,
    proposalId: input.proposal.id,
    findingId: input.proposal.finding_id,
    title: input.proposal.title,
    targetFile: input.proposal.target_file,
    targetFileCandidates: input.proposal.target_file_candidates ?? [input.proposal.target_file],
    targetFileReasoning: input.proposal.target_file_reasoning ?? "",
    confidence: typeof input.proposal.confidence === "number" ? input.proposal.confidence : null,
    backupPath: input.backupPath,
    verification: {
      attempted: Boolean(input.verification),
      success: input.verification?.success ?? false,
      reverted: input.verification?.reverted ?? false,
      message: input.verification?.message ?? "Verification not run",
      exitCode: input.verification?.dryRun?.exitCode,
      timedOut: input.verification?.dryRun?.timedOut,
      duration: input.verification?.dryRun?.duration,
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2));
  return filePath;
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80);
}
