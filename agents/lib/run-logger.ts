import fs from "fs";
import path from "path";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMCallLog {
  id: number;
  label: string;
  provider: string;
  model: string;
  maxTokens?: number;
  durationMs: number;
  usage: TokenUsage | null;
  preview?: string;
  timestamp: string;
}

export interface ImageCallLog {
  label: string;
  provider: string;
  durationMs: number;
  bytes: number;
  promptPreview: string;
  timestamp: string;
}

export interface StepLog {
  name: string;
  status: "running" | "success" | "error";
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  details?: string;
}

export interface RunLogSnapshot {
  runId: string | null;
  dryRun: boolean;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  steps: StepLog[];
  llmCalls: LLMCallLog[];
  imageCalls: ImageCallLog[];
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    llmCalls: number;
    imageCalls: number;
  };
}

class RunLogger {
  private runId: string | null = null;
  private dryRun = false;
  private startedAtMs: number | null = null;
  private endedAtMs: number | null = null;
  private steps: StepLog[] = [];
  private llmCalls: LLMCallLog[] = [];
  private imageCalls: ImageCallLog[] = [];
  private llmCallCounter = 0;

  startRun(runId: string, dryRun: boolean): void {
    this.runId = runId;
    this.dryRun = dryRun;
    this.startedAtMs = Date.now();
    this.endedAtMs = null;
    this.steps = [];
    this.llmCalls = [];
    this.imageCalls = [];
    this.llmCallCounter = 0;

    this.line(`Run ${runId} started (${dryRun ? "DRY RUN" : "PUBLISH"})`);
  }

  finishRun(): void {
    this.endedAtMs = Date.now();
  }

  startStep(name: string, details?: string): void {
    this.steps.push({
      name,
      status: "running",
      startedAt: new Date().toISOString(),
      details,
    });
    this.line(`▶ ${name}${details ? ` — ${details}` : ""}`);
  }

  succeedStep(name: string, details?: string): void {
    const step = this.findStep(name);
    const now = Date.now();
    if (step) {
      step.status = "success";
      step.endedAt = new Date().toISOString();
      step.durationMs = this.safeDuration(step.startedAt, now);
      if (details) step.details = details;
      this.line(`✓ ${name}${details ? ` — ${details}` : ""} (${formatDuration(step.durationMs)})`);
      return;
    }
    this.line(`✓ ${name}${details ? ` — ${details}` : ""}`);
  }

  failStep(name: string, error: Error | string): void {
    const step = this.findStep(name);
    const now = Date.now();
    const message = typeof error === "string" ? error : error.message;
    if (step) {
      step.status = "error";
      step.endedAt = new Date().toISOString();
      step.durationMs = this.safeDuration(step.startedAt, now);
      step.details = message;
      this.line(`✗ ${name} — ${message} (${formatDuration(step.durationMs)})`, "error");
      return;
    }
    this.line(`✗ ${name} — ${message}`, "error");
  }

  info(scope: string, message: string): void {
    this.line(`[${scope}] ${message}`);
  }

  warn(scope: string, message: string): void {
    this.line(`[${scope}] ${message}`, "warn");
  }

  error(scope: string, message: string): void {
    this.line(`[${scope}] ${message}`, "error");
  }

  recordLLMCall(input: {
    label: string;
    provider: string;
    model: string;
    maxTokens?: number;
    durationMs: number;
    usage?: Partial<TokenUsage> | null;
    preview?: string;
  }): void {
    const usage = input.usage
      ? {
          promptTokens: input.usage.promptTokens ?? 0,
          completionTokens: input.usage.completionTokens ?? 0,
          totalTokens:
            input.usage.totalTokens ??
            (input.usage.promptTokens ?? 0) + (input.usage.completionTokens ?? 0),
        }
      : null;

    const log: LLMCallLog = {
      id: ++this.llmCallCounter,
      label: input.label,
      provider: input.provider,
      model: input.model,
      maxTokens: input.maxTokens,
      durationMs: input.durationMs,
      usage,
      preview: truncateOneLine(input.preview ?? "", 100),
      timestamp: new Date().toISOString(),
    };

    this.llmCalls.push(log);

    const usageText = usage
      ? `prompt=${usage.promptTokens}, completion=${usage.completionTokens}, total=${usage.totalTokens}`
      : "usage unavailable";

    this.line(
      `🤖 ${log.label} — ${log.provider}/${log.model} — ${usageText} — ${formatDuration(log.durationMs)}`,
    );
  }

  recordImageCall(input: {
    label: string;
    provider: string;
    durationMs: number;
    bytes: number;
    promptPreview: string;
  }): void {
    const log: ImageCallLog = {
      label: input.label,
      provider: input.provider,
      durationMs: input.durationMs,
      bytes: input.bytes,
      promptPreview: truncateOneLine(input.promptPreview, 100),
      timestamp: new Date().toISOString(),
    };

    this.imageCalls.push(log);
    this.line(
      `🖼 ${log.label} — ${log.provider} — ${formatBytes(log.bytes)} — ${formatDuration(log.durationMs)}`,
    );
  }

  printSummary(): void {
    const snapshot = this.snapshot();

    console.log("\n=== Pipeline Step Summary ===");
    console.table(
      snapshot.steps.map((step) => ({
        step: step.name,
        status: step.status,
        duration: step.durationMs != null ? formatDuration(step.durationMs) : "-",
        details: truncateOneLine(step.details ?? "", 90),
      })),
    );

    if (snapshot.llmCalls.length > 0) {
      console.log("\n=== AI Usage Summary ===");
      console.table(
        snapshot.llmCalls.map((call) => ({
          "#": call.id,
          label: call.label,
          provider: call.provider,
          model: call.model,
          promptTokens: call.usage?.promptTokens ?? "-",
          completionTokens: call.usage?.completionTokens ?? "-",
          totalTokens: call.usage?.totalTokens ?? "-",
          duration: formatDuration(call.durationMs),
        })),
      );
    }

    if (snapshot.imageCalls.length > 0) {
      console.log("\n=== Image Generation Summary ===");
      console.table(
        snapshot.imageCalls.map((call, index) => ({
          "#": index + 1,
          label: call.label,
          provider: call.provider,
          bytes: formatBytes(call.bytes),
          duration: formatDuration(call.durationMs),
          prompt: truncateOneLine(call.promptPreview, 70),
        })),
      );
    }

    console.log("\n=== Totals ===");
    console.table([
      {
        llmCalls: snapshot.totals.llmCalls,
        imageCalls: snapshot.totals.imageCalls,
        promptTokens: snapshot.totals.promptTokens,
        completionTokens: snapshot.totals.completionTokens,
        totalTokens: snapshot.totals.totalTokens,
        runDuration: snapshot.durationMs != null ? formatDuration(snapshot.durationMs) : "-",
      },
    ]);
  }

  snapshot(): RunLogSnapshot {
    const totals = this.llmCalls.reduce(
      (acc, call) => {
        acc.promptTokens += call.usage?.promptTokens ?? 0;
        acc.completionTokens += call.usage?.completionTokens ?? 0;
        acc.totalTokens += call.usage?.totalTokens ?? 0;
        return acc;
      },
      {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    );

    return {
      runId: this.runId,
      dryRun: this.dryRun,
      startedAt: this.startedAtMs ? new Date(this.startedAtMs).toISOString() : null,
      endedAt: this.endedAtMs ? new Date(this.endedAtMs).toISOString() : null,
      durationMs:
        this.startedAtMs != null
          ? (this.endedAtMs ?? Date.now()) - this.startedAtMs
          : null,
      steps: this.steps.map((step) => ({ ...step })),
      llmCalls: this.llmCalls.map((call) => ({ ...call })),
      imageCalls: this.imageCalls.map((call) => ({ ...call })),
      totals: {
        ...totals,
        llmCalls: this.llmCalls.length,
        imageCalls: this.imageCalls.length,
      },
    };
  }

  saveSnapshot(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.snapshot(), null, 2));
  }

  private findStep(name: string): StepLog | undefined {
    for (let i = this.steps.length - 1; i >= 0; i -= 1) {
      const step = this.steps[i];
      if (step.name === name && step.status === "running") return step;
    }
    return undefined;
  }

  private safeDuration(startedAtIso: string, nowMs: number): number {
    const started = Date.parse(startedAtIso);
    return Number.isFinite(started) ? Math.max(0, nowMs - started) : 0;
  }

  private line(message: string, level: "info" | "warn" | "error" = "info"): void {
    const timestamp = new Date().toISOString();
    const text = `[${timestamp}] ${message}`;
    if (level === "error") {
      console.error(text);
    } else if (level === "warn") {
      console.warn(text);
    } else {
      console.log(text);
    }
  }
}

function truncateOneLine(value: string, max: number): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, Math.max(0, max - 1))}…`;
}

function formatDuration(ms?: number): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const runLogger = new RunLogger();
