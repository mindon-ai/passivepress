import { runDryRun, type DryRunResult } from "./meta-runner.ts";
import { restorePatchedFile } from "./meta-patcher.ts";

export interface VerificationResult {
  success: boolean;
  reverted: boolean;
  message: string;
  backupPath: string | null;
  dryRun?: DryRunResult;
}

export async function verifyAndRollbackIfNeeded(
  targetFile: string,
  backupPath: string | null,
  timeoutMs = 180_000,
): Promise<VerificationResult> {
  const dryRun = await runDryRun(timeoutMs);
  if (dryRun.success) {
    return {
      success: true,
      reverted: false,
      message: `Dry-run passed (${dryRun.duration}ms)`,
      backupPath,
      dryRun,
    };
  }

  const reverted = restorePatchedFile(targetFile, backupPath);
  const reason = dryRun.timedOut
    ? `Dry-run timed out after ${dryRun.duration}ms`
    : `Dry-run failed with exit ${dryRun.exitCode}`;

  return {
    success: false,
    reverted,
    message: reverted
      ? `${reason}; reverted ${targetFile} from backup`
      : `${reason}; no backup restore was performed`,
    backupPath,
    dryRun,
  };
}
