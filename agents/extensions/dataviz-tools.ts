/**
 * extensions/dataviz-tools.ts
 * pi AgentTool for Agent 9 — DataViz.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { DataVizResult } from "../types/pipeline.ts";

const seriesSchema = Type.Object({
  key:   Type.String(),
  label: Type.String(),
  color: Type.Optional(Type.String({ description: "hsl(var(--chart-N)) where N is 1–5" })),
});

const chartSchema = Type.Object({
  id:          Type.String({ description: "Unique kebab-case identifier" }),
  title:       Type.String(),
  description: Type.String({ description: "One sentence" }),
  type:        Type.Union([Type.Literal("bar"), Type.Literal("line"), Type.Literal("area")]),
  xKey:        Type.String(),
  series:      Type.Array(seriesSchema),
  data:        Type.Array(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]))),
  insight:     Type.Optional(Type.String()),
  sourceLabel: Type.Optional(Type.String()),
});

const returnDatavizParams = Type.Object({
  charts:  Type.Array(chartSchema, { description: "Empty array if no concrete quantitative data found" }),
  content: Type.String({ description: "Markdown prose with embedded ```chart blocks. Empty string if no charts." }),
});

export function createReturnDatavizTool(
  onResult: (result: DataVizResult) => void,
  options: { once?: boolean } = {}
): AgentTool<typeof returnDatavizParams> {
  let accepted = false;

  return {
    name: "return_dataviz",
    label: "Return DataViz Result",
    description:
      "Call once with all chart specs and the accompanying Markdown content. " +
      "Pass empty arrays/strings if the research has no concrete quantitative data.",
    parameters: returnDatavizParams,
    execute: async (_id, params) => {
      if (options.once !== false && accepted) {
        return {
          content: [{ type: "text", text: "DataViz result already captured. Do not call return_dataviz again." }],
          details: { duplicateCall: true },
          terminate: true,
        };
      }

      accepted = true;
      onResult(params as DataVizResult);
      return {
        content: [{ type: "text", text: `DataViz captured: ${params.charts.length} chart(s). Stop now.` }],
        details: { count: params.charts.length, accepted: true },
        terminate: true,
      };
    },
  };
}
