/**
 * extensions/meta-tools.ts
 * pi AgentTool for Agent 6 — MetaAgent.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { MetaReport } from "../types/meta.ts";

const findingSchema = Type.Object({
  id:          Type.String(),
  severity:    Type.Union([Type.Literal("critical"), Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")]),
  category:    Type.Union([Type.Literal("quality"), Type.Literal("tokens"), Type.Literal("diversity"), Type.Literal("seo"), Type.Literal("pipeline"), Type.Literal("frontend")]),
  title:       Type.String(),
  description: Type.String(),
  evidence:    Type.String(),
});

const changeSchema = Type.Object({
  oldText: Type.String({ description: "Exact unique substring of the target file — used for find-replace" }),
  newText: Type.String({ description: "Replacement text — must be complete valid code, no ellipsis" }),
});

const proposalSchema = Type.Object({
  id:               Type.String(),
  finding_id:       Type.String(),
  impact:           Type.Union([Type.Literal("HIGH"), Type.Literal("MEDIUM"), Type.Literal("LOW")]),
  type:             Type.Union([Type.Literal("prompt_edit"), Type.Literal("code_edit"), Type.Literal("config_change"), Type.Literal("schema_change"), Type.Literal("frontend_edit")]),
  title:            Type.String(),
  description:      Type.String(),
  confidence:       Type.Optional(Type.Number({ description: "0.0-1.0 confidence in the proposal and file targeting" })),
  requires_review:  Type.Boolean(),
  target_file:      Type.String({ description: "Path relative to project root, e.g. agents/agents/4-writer.ts" }),
  target_file_candidates: Type.Optional(Type.Array(Type.String())),
  target_file_reasoning: Type.Optional(Type.String()),
  backup_needed:    Type.Optional(Type.Boolean()),
  change:           changeSchema,
  dry_run_recommended: Type.Boolean(),
});

const returnMetaReportParams = Type.Object({
  runsAnalyzed: Type.Number(),
  postsAudited: Type.Number(),
  findings:     Type.Array(findingSchema),
  proposals:    Type.Array(proposalSchema),
});

export function createReturnMetaReportTool(
  onResult: (report: Omit<MetaReport, "generatedAt">) => void,
  options: { once?: boolean } = {}
): AgentTool<typeof returnMetaReportParams> {
  let accepted = false;

  return {
    name: "return_meta_report",
    label: "Return Meta Report",
    description:
      "Call once when your analysis is complete. " +
      "Passes the MetaReport (findings + proposals) to the pipeline for review and application.",
    parameters: returnMetaReportParams,
    execute: async (_id, params) => {
      if (options.once !== false && accepted) {
        return {
          content: [{ type: "text", text: "MetaReport already captured. Do not call return_meta_report again." }],
          details: { duplicateCall: true },
          terminate: true,
        };
      }

      accepted = true;
      onResult(params as unknown as Omit<MetaReport, "generatedAt">);
      return {
        content: [{
          type: "text",
          text: `MetaReport captured: ${params.findings.length} findings, ${params.proposals.length} proposals. Stop now.`,
        }],
        details: {
          findings: params.findings.length,
          proposals: params.proposals.length,
          accepted: true,
        },
        terminate: true,
      };
    },
  };
}
