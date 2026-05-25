/**
 * lib/pi-agent-utils.ts
 * Shared helpers for all pi-agent-core Agent instances in the pipeline.
 *
 * - resolveModel()   → picks the right Model based on PI_PROVIDER env
 * - resolveStreamFn() → wraps streamSimple with API key injection
 * - createPiAgent()  → one-liner factory used by every agent
 */

import { Agent } from "@earendil-works/pi-agent-core";
import type {
  AfterToolCallContext,
  AfterToolCallResult,
  AgentLoopConfig,
  AgentOptions,
  AgentTool,
  StreamFn,
} from "@earendil-works/pi-agent-core";
import { getModel, streamSimple } from "@earendil-works/pi-ai";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { runLogger } from "./run-logger.ts";

export type PiAgentRuntimeOptions = Partial<AgentOptions> & Pick<Partial<AgentLoopConfig>, "shouldStopAfterTurn">;

export interface OneShotPiAgentConfig<TResult> {
  agentId: string;
  systemPrompt: string;
  prompt: string;
  tools: AgentTool<any>[];
  returnToolName: string;
  getCapturedResult: () => TResult | null | undefined;
  acceptReturnToolCall?: (context: AfterToolCallContext) => boolean;
  thinkingLevel?: "off" | "low" | "medium" | "high";
}

export interface OneShotPiAgentOutcome<TResult> {
  result: TResult | null;
  returnCallCount: number;
}

export function resolveModel(): Model<any> {
  const provider = (process.env.PI_PROVIDER ?? "").toLowerCase();
  if (provider === "anthropic") {
    return getModel("anthropic", "claude-sonnet-4-6") as Model<any>;
  }
  if (provider === "openai") {
    return getModel("openai", "gpt-4o-mini") as Model<any>;
  }

  return {
    id: process.env.CLIPROXY_LLM_MODEL ?? "gemini-3-flash",
    name: process.env.CLIPROXY_LLM_MODEL ?? "gemini-3-flash",
    api: "openai-completions",
    provider: "cliproxy",
    baseUrl: (process.env.CLIPROXY_BASE_URL ?? "http://localhost:8317/v1").replace(/\/+$/, ""),
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  } as Model<any>;
}

export function resolveStreamFn(): StreamFn {
  const provider = (process.env.PI_PROVIDER ?? "").toLowerCase();
  if (provider === "anthropic" || provider === "openai") {
    return streamSimple as StreamFn;
  }
  const apiKey = process.env.CLIPROXY_API_KEY ?? "";
  if (!apiKey) throw new Error("CLIPROXY_API_KEY is not set — check agents/.env");
  return ((model: any, ctx: any, opts: any) => streamSimple(model, ctx, { ...opts, apiKey })) as StreamFn;
}

export function createPiAgent(
  systemPrompt: string,
  tools: AgentTool<any>[],
  thinkingLevel: "off" | "low" | "medium" | "high" = "off",
  options: PiAgentRuntimeOptions = {},
): Agent {
  const runtimeOptions = options as AgentOptions & Pick<Partial<AgentLoopConfig>, "shouldStopAfterTurn">;

  return new Agent({
    initialState: { systemPrompt, model: resolveModel(), tools, thinkingLevel },
    streamFn: resolveStreamFn(),
    ...runtimeOptions,
  });
}

function appendReturnCallCount(details: unknown, returnCallCount: number): Record<string, unknown> {
  return {
    ...(typeof details === "object" && details ? details as Record<string, unknown> : {}),
    returnCallCount,
  };
}

export function createOneShotAfterToolCallHandler(
  returnToolName: string,
  onAcceptedReturnToolCall: () => void,
  acceptReturnToolCall?: (context: AfterToolCallContext) => boolean,
): (context: AfterToolCallContext) => Promise<AfterToolCallResult | undefined> {
  return async (context) => {
    if (context.toolCall.name !== returnToolName) {
      return undefined;
    }

    if (acceptReturnToolCall && !acceptReturnToolCall(context)) {
      return undefined;
    }

    onAcceptedReturnToolCall();

    return {
      terminate: true,
      details: appendReturnCallCount(context.result.details, 1),
    };
  };
}

export async function runOneShotPiAgent<TResult>(config: OneShotPiAgentConfig<TResult>): Promise<OneShotPiAgentOutcome<TResult>> {
  const {
    agentId,
    systemPrompt,
    prompt,
    tools,
    returnToolName,
    getCapturedResult,
    acceptReturnToolCall,
    thinkingLevel = "off",
  } = config;

  let returnCallCount = 0;

  const agent = createPiAgent(systemPrompt, tools, thinkingLevel, {
    toolExecution: "sequential",
    shouldStopAfterTurn: () => {
      const captured = getCapturedResult();
      return captured !== null && captured !== undefined || returnCallCount > 0;
    },
    afterToolCall: async (context) => {
      if (context.toolCall.name !== returnToolName) {
        return undefined;
      }

      if (acceptReturnToolCall && !acceptReturnToolCall(context)) {
        return undefined;
      }

      returnCallCount += 1;

      return {
        terminate: true,
        details: appendReturnCallCount(context.result.details, returnCallCount),
      };
    },
  });

  const detachLogger = attachConsoleLogger(agent, agentId);

  try {
    await agent.prompt(prompt);
  } finally {
    detachLogger();
  }

  return {
    result: getCapturedResult() ?? null,
    returnCallCount,
  };
}

export function attachConsoleLogger(agent: Agent, agentId: string): () => void {
  let turns = 0;
  let lastAssistantText = "";
  const model = resolveModel();

  return agent.subscribe((event) => {
    switch (event.type) {
      case "agent_start":
        console.log(`[${agentId}] Agent loop started`);
        break;
      case "turn_start":
        lastAssistantText = "";
        process.stdout.write(`[${agentId}] Turn ${++turns} `);
        break;
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          const delta = event.assistantMessageEvent.delta ?? "";
          lastAssistantText += delta;
          process.stdout.write(".");
        }
        break;
      case "tool_execution_start":
        process.stdout.write("\n");
        console.log(`[${agentId}] → ${event.toolName}(${JSON.stringify(event.args ?? {}).slice(0, 100)})`);
        break;
      case "tool_execution_end":
        if (event.isError) console.warn(`[${agentId}] ✗ ${event.toolName} failed`);
        break;
      case "turn_end": {
        if (lastAssistantText.trim()) {
          console.log(`\n[${agentId}] assistant: ${lastAssistantText.trim().slice(0, 400)}`);
        }
        // Record token usage from the assistant message
        const msg = event.message as unknown as AssistantMessage;
        if (msg?.usage) {
          const startedAt = msg.timestamp ?? Date.now();
          runLogger.recordLLMCall({
            label: `${agentId} turn ${turns}`,
            provider: msg.provider ?? model.provider ?? "cliproxy",
            model: msg.responseModel ?? msg.model ?? model.id,
            durationMs: Date.now() - startedAt,
            usage: {
              promptTokens: msg.usage.input,
              completionTokens: msg.usage.output,
              totalTokens: msg.usage.totalTokens,
            },
            preview: lastAssistantText.trim().slice(0, 100),
          });
        }
        break;
      }
      case "agent_end":
        process.stdout.write("\n");
        console.log(`[${agentId}] Done (${turns} turns)`);
        break;
    }
  });
}
