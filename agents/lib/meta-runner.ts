// agents/lib/meta-runner.ts
import path from "path";
import { fileURLToPath } from "url";
import { runProjectCommand } from "./project-command.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_ROOT = path.resolve(__dirname, "..");

export interface DryRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
  chosenCategory?: string;
  wordCount?: number;
  duration: number;
  timedOut: boolean;
}

export async function runDryRun(timeoutMs = 180_000): Promise<DryRunResult> {
  const result = await runProjectCommand("CI=true pnpm exec tsx pipeline.ts --dry-run", {
    cwd: AGENTS_ROOT,
    timeoutMs,
  });

  const combined = `${result.stdout}\n${result.stderr}`;
  const catMatch = combined.match(/category:\s*([\w-]+)/i);
  const wordMatch = combined.match(/(\d+)\s+words/i);

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    success: !result.timedOut && result.exitCode === 0,
    chosenCategory: catMatch?.[1],
    wordCount: wordMatch ? parseInt(wordMatch[1], 10) : undefined,
    duration: result.duration,
    timedOut: result.timedOut,
  };
}
