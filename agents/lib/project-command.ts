import { spawn } from "child_process";
import path from "path";

export interface ProjectCommandOptions {
  cwd: string;
  timeoutMs?: number;
  stdio?: "inherit" | "pipe";
  env?: NodeJS.ProcessEnv;
}

export interface ProjectCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
}

const DEFAULT_NODE_VERSION = "24.14.1";

function buildWrappedCommand(command: string): string {
  const pieces = [
    'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"',
    'if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; fi',
    `if command -v nvm >/dev/null 2>&1; then nvm use ${DEFAULT_NODE_VERSION} >/dev/null 2>&1 || true; fi`,
    'if command -v corepack >/dev/null 2>&1; then corepack enable >/dev/null 2>&1 || true; fi',
    command,
  ];
  return pieces.join(" && ");
}

export function spawnProjectCommand(command: string, options: ProjectCommandOptions) {
  return spawn("bash", ["-lc", buildWrappedCommand(command)], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? "pipe",
  });
}

export async function runProjectCommand(
  command: string,
  options: ProjectCommandOptions,
): Promise<ProjectCommandResult> {
  return await new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawnProjectCommand(command, { ...options, stdio: "pipe" });

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    const finish = (exitCode: number, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      resolve({
        exitCode,
        stdout,
        stderr,
        duration: Date.now() - startedAt,
        timedOut,
      });
    };

    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill();
          finish(1, true);
        }, options.timeoutMs)
      : null;

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      finish(code ?? 1, false);
    });

    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      stderr += `${error.message}\n`;
      finish(1, false);
    });
  });
}

export function formatProjectCommand(scriptName: string): string {
  return `pnpm run ${scriptName}`;
}

export function resolveProjectPath(...segments: string[]): string {
  return path.join(...segments);
}
