// agents/lib/meta-patcher.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Proposal } from "../types/meta.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const AGENTS_ROOT = path.resolve(__dirname, "..");
const backedUpFiles = new Set<string>();

const NEVER_MODIFY_FILES = [
  "agents/pipeline.ts",
  "agents/.env",
  "agents/.env.local",
  ".env",
  ".env.local",
  "convex/schema.ts",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "vite.config.ts",
];

const NEVER_IN_PROPOSAL = ["db.delete", "process.exit", "git push", "git commit"];

export interface Patch {
  targetFile: string;
  oldText: string;
  newText: string;
}

export interface PatchResult {
  success: boolean;
  backupPath: string | null;
  error?: string;
}

export function restorePatchedFile(targetFile: string, backupPath: string | null): boolean {
  if (!backupPath) return false;
  if (!fs.existsSync(backupPath)) return false;

  const absolutePath = path.resolve(PROJECT_ROOT, targetFile);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.copyFileSync(backupPath, absolutePath);
  backedUpFiles.delete(targetFile);
  return true;
}

export function validateProposal(proposal: Proposal): string | null {
  for (const blocked of NEVER_MODIFY_FILES) {
    if (proposal.target_file.endsWith(blocked) || proposal.target_file === blocked) {
      return `Blocked: ${proposal.target_file} is in the never-modify list`;
    }
  }

  for (const pattern of NEVER_IN_PROPOSAL) {
    if (proposal.change.newText.includes(pattern)) {
      return `Blocked: newText contains forbidden pattern "${pattern}"`;
    }
  }

  if (proposal.type === "schema_change" && !proposal.requires_review) {
    return "Blocked: schema_change proposals must have requires_review: true";
  }

  return null;
}

export function getBackupDir(): string {
  const ts = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
  return path.join(AGENTS_ROOT, "backup", ts);
}

export async function applyPatch(patch: Patch, backupDir: string): Promise<PatchResult> {
  const absolutePath = path.resolve(PROJECT_ROOT, patch.targetFile);

  if (!fs.existsSync(absolutePath)) {
    return { success: false, backupPath: null, error: `File not found: ${patch.targetFile}` };
  }

  const original = fs.readFileSync(absolutePath, "utf-8");
  const occurrences = original.split(patch.oldText).length - 1;

  if (occurrences === 0) {
    return { success: false, backupPath: null, error: `oldText not found in ${patch.targetFile}` };
  }

  if (occurrences > 1) {
    return {
      success: false,
      backupPath: null,
      error: `oldText appears ${occurrences} times in ${patch.targetFile} — ambiguous`,
    };
  }

  let backupPath: string | null = null;
  if (!backedUpFiles.has(patch.targetFile)) {
    backupPath = backupFile(absolutePath, PROJECT_ROOT, backupDir);
    backedUpFiles.add(patch.targetFile);
  }

  const patched = original.replace(patch.oldText, patch.newText);
  fs.writeFileSync(absolutePath, patched, "utf-8");
  printDiff(patch.oldText, patch.newText, patch.targetFile);

  return { success: true, backupPath };
}

function backupFile(absolutePath: string, projectRoot: string, backupDir: string): string {
  const relPath = path.relative(projectRoot, absolutePath);
  const backupPath = path.join(backupDir, relPath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(absolutePath, backupPath);
  return backupPath;
}

function printDiff(oldText: string, newText: string, filePath: string): void {
  console.log(`\n[MetaPatcher] Diff for ${filePath}`);
  console.log("-".repeat(60));
  console.log("OLD:");
  console.log(oldText.slice(0, 800));
  if (oldText.length > 800) console.log("... [truncated]");
  console.log("\nNEW:");
  console.log(newText.slice(0, 800));
  if (newText.length > 800) console.log("... [truncated]");
  console.log("-".repeat(60));
}
