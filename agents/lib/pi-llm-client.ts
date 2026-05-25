/**
 * pi-llm-client.ts
 * Unified LLM client for the NeuronPress agent pipeline.
 *
 * Provider routing (checked in order):
 *   1. PI_PROVIDER=anthropic  → native Anthropic API via @anthropic-ai/sdk
 *   2. PI_PROVIDER=openai     → native OpenAI API via openai package
 *   3. (default)              → CLIPROXY OpenAI-compatible endpoint
 *
 * Current shared LLM entrypoint for the NeuronPress agent pipeline.
 * Adds: skill file loading, per-provider routing, structured tool call support.
 *
 * ENV vars:
 *   PI_PROVIDER          anthropic | openai | (unset = cliproxy)
 *   ANTHROPIC_API_KEY    required when PI_PROVIDER=anthropic
 *   OPENAI_API_KEY       required when PI_PROVIDER=openai
 *   CLIPROXY_API_KEY     required for default cliproxy mode
 *   CLIPROXY_BASE_URL    default http://localhost:8317/v1
 *   CLIPROXY_LLM_MODEL   default gemini-3-flash
 *   CLIPROXY_TEMPERATURE default 1
 *   CLIPROXY_TOP_P       default 0.95
 *   CLIPROXY_THINKING    default false
 */

import "dotenv/config";
import OpenAI from "openai";
import { runLogger } from "./run-logger.ts";
import { loadSkill } from "./skill-loader.ts";
import { parseLLMJson, type LLMMessage } from "./llm-utils.ts";
export { generateImage } from "./cf-ai-client.ts";
export { parseLLMJson };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LLMCallOptions {
  /** Override provider for this call only */
  provider?: "anthropic" | "openai" | "cliproxy";
  /** Load this skill file and prepend its content to the system prompt */
  skill?: string;
  /** Append extra instructions to the system prompt (after skill content) */
  systemSuffix?: string;
  providerBaseUrl?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  userPrompt?: string;
}

// ─── Provider detection ───────────────────────────────────────────────────────

type Provider = "anthropic" | "openai" | "cliproxy";

function detectProvider(options: LLMCallOptions): Provider {
  if (options.provider) return options.provider;
  const env = (process.env.PI_PROVIDER ?? "").toLowerCase();
  if (env === "anthropic") return "anthropic";
  if (env === "openai") return "openai";
  return "cliproxy";
}

// ─── Build the effective system prompt ───────────────────────────────────────

function buildSystemPrompt(
  messages: LLMMessage[],
  options: LLMCallOptions
): string {
  const parts: string[] = [];

  // 1. Skill file (if requested)
  if (options.skill) {
    try {
      parts.push(loadSkill(options.skill));
    } catch (err) {
      console.warn(`[pi-llm] Skill "${options.skill}" not found, skipping: ${(err as Error).message}`);
    }
  }

  // 2. Inline system message from the messages array (if present)
  const inlineSystem = messages.find((m) => m.role === "system")?.content;
  if (inlineSystem) parts.push(inlineSystem);

  // 3. Override via LLMCallOptions.systemPrompt
  if (options.systemPrompt) parts.push(options.systemPrompt);

  // 4. Optional suffix (extra per-call instructions)
  if (options.systemSuffix) parts.push(options.systemSuffix);

  return parts.join("\n\n").trim();
}

/** Return messages array with system role replaced/injected */
function applySystemPrompt(messages: LLMMessage[], systemContent: string): LLMMessage[] {
  const withoutSystem = messages.filter((m) => m.role !== "system");
  if (!systemContent) return withoutSystem;
  return [{ role: "system", content: systemContent }, ...withoutSystem];
}

// ─── CLIPROXY provider (existing behaviour, OpenAI-compatible) ───────────────

function buildClipROXYClient(options: LLMCallOptions): OpenAI {
  const baseURL =
    options.providerBaseUrl?.trim().replace(/\/+$/, "") ??
    (process.env.CLIPROXY_BASE_URL ?? "http://localhost:8317/v1");
  const apiKey = process.env.CLIPROXY_API_KEY ?? "";
  if (!apiKey) throw new Error("CLIPROXY_API_KEY is not set — check agents/.env");
  return new OpenAI({ baseURL, apiKey });
}

async function callViaClipROXY(
  messages: LLMMessage[],
  maxTokens: number,
  label: string,
  options: LLMCallOptions
): Promise<string> {
  const client = buildClipROXYClient(options);
  const model = options.model?.trim() || process.env.CLIPROXY_LLM_MODEL || "gemini-3-flash";
  const temperature = options.temperature ?? Number(process.env.CLIPROXY_TEMPERATURE ?? "1");
  const top_p = options.topP ?? Number(process.env.CLIPROXY_TOP_P ?? "0.95");
  const thinking = (process.env.CLIPROXY_THINKING ?? "false").toLowerCase() === "true";

  const startedAt = Date.now();
  const response = await client.chat.completions.create({
    model,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    temperature,
    top_p,
    max_tokens: maxTokens,
    stream: false,
    extra_body: { chat_template_kwargs: { thinking } },
  } as any);

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("CLIPROXY returned no content");

  runLogger.recordLLMCall({
    label,
    provider: "cliproxy",
    model,
    maxTokens,
    durationMs: Date.now() - startedAt,
    usage: {
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
    },
    preview: messages[messages.length - 1]?.content,
  });

  return content;
}

// ─── OpenAI provider ─────────────────────────────────────────────────────────

async function callViaOpenAI(
  messages: LLMMessage[],
  maxTokens: number,
  label: string,
  options: LLMCallOptions
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const client = new OpenAI({ apiKey });
  const model = options.model?.trim() || process.env.PI_MODEL || "gpt-4o-mini";

  const startedAt = Date.now();
  const response = await client.chat.completions.create({
    model,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    max_tokens: maxTokens,
    temperature: options.temperature ?? 0.7,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI returned no content");

  runLogger.recordLLMCall({
    label,
    provider: "openai",
    model,
    maxTokens,
    durationMs: Date.now() - startedAt,
    usage: {
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
    },
    preview: messages[messages.length - 1]?.content,
  });

  return content;
}

// ─── Anthropic provider ───────────────────────────────────────────────────────

async function callViaAnthropic(
  messages: LLMMessage[],
  maxTokens: number,
  label: string,
  options: LLMCallOptions
): Promise<string> {
  // Dynamic import so Anthropic SDK is optional — only needed when PI_PROVIDER=anthropic
  let Anthropic: typeof import("@anthropic-ai/sdk").default;
  try {
    const mod = await import("@anthropic-ai/sdk");
    Anthropic = mod.default;
  } catch {
    throw new Error(
      "@anthropic-ai/sdk is not installed. Run: pnpm add @anthropic-ai/sdk"
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  const model = options.model?.trim() || process.env.PI_MODEL || "claude-sonnet-4-6";

  // Separate system from user/assistant turns
  const systemMsg = messages.find((m) => m.role === "system");
  const turns = messages.filter((m) => m.role !== "system") as Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  const startedAt = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemMsg?.content,
    messages: turns,
    temperature: options.temperature ?? 1,
  });

  const block = response.content[0];
  const content = block?.type === "text" ? block.text.trim() : "";
  if (!content) throw new Error("Anthropic returned no text content");

  runLogger.recordLLMCall({
    label,
    provider: "anthropic",
    model,
    maxTokens,
    durationMs: Date.now() - startedAt,
    usage: {
      promptTokens: response.usage?.input_tokens,
      completionTokens: response.usage?.output_tokens,
      totalTokens:
        (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
    },
    preview: messages[messages.length - 1]?.content,
  });

  return content;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call the configured LLM provider.
 * Skill file (if options.skill is set) is loaded and merged into the system prompt
 * before the call is made.
 */
export async function callLLM(
  messages: LLMMessage[],
  maxTokens = 2048,
  label = "LLM call",
  options: LLMCallOptions = {}
): Promise<string> {
  const provider = detectProvider(options);

  // Build merged system prompt (skill + inline + overrides)
  const systemContent = buildSystemPrompt(messages, options);
  const finalMessages = applySystemPrompt(messages, systemContent);

  switch (provider) {
    case "anthropic":
      return callViaAnthropic(finalMessages, maxTokens, label, options);
    case "openai":
      return callViaOpenAI(finalMessages, maxTokens, label, options);
    default:
      return callViaClipROXY(finalMessages, maxTokens, label, options);
  }
}

/**
 * Convenience wrapper: load a skill, call LLM, parse JSON response.
 * Replaces the common pattern: callLLM(...) → parseLLMJson().
 */
export async function callSkillForJson<T>(
  skillName: string,
  userContent: string,
  maxTokens: number,
  label: string,
  options: Omit<LLMCallOptions, "skill"> = {}
): Promise<T> {
  const raw = await callLLM(
    [{ role: "user", content: userContent }],
    maxTokens,
    label,
    { ...options, skill: skillName }
  );
  return parseLLMJson<T>(raw);
}
