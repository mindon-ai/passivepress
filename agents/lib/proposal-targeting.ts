import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Finding, Proposal } from "../types/meta.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

const DEFAULT_TARGETS_BY_CATEGORY: Record<Finding["category"], string[]> = {
  diversity: ["agents/agents/2-topic-picker.ts", "agents/agents/1-trend-scout.ts"],
  quality: ["agents/agents/4-writer.ts", "agents/agents/5-publisher.ts"],
  seo: ["agents/agents/4-writer.ts", "agents/agents/5-publisher.ts"],
  tokens: ["agents/agents/4-writer.ts", "agents/agents/3-image-gen.ts", "agents/agents/6-meta-agent.ts"],
  pipeline: ["agents/agents/5-publisher.ts", "agents/agents/8-researcher.ts", "agents/agents/9-dataviz.ts"],
  frontend: [],
};

const AGENT_FILE_GLOBS = [
  "agents/agents/1-trend-scout.ts",
  "agents/agents/2-topic-picker.ts",
  "agents/agents/3-image-gen.ts",
  "agents/agents/4-writer.ts",
  "agents/agents/5-publisher.ts",
  "agents/agents/6-meta-agent.ts",
  "agents/agents/7-mechanic.ts",
  "agents/agents/8-researcher.ts",
  "agents/agents/9-dataviz.ts",
  "agents/lib/meta-analyzer.ts",
  "agents/lib/meta-runner.ts",
  "agents/lib/meta-patcher.ts",
  "agents/lib/meta-verifier.ts",
  "agents/lib/project-command.ts",
];

export interface ResolvedTarget {
  targetFile: string;
  candidates: string[];
  reasoning: string;
}

export function inferTargetCandidates(finding: Finding): ResolvedTarget | null {
  const explicitFromEvidence = extractPathsFromText(`${finding.evidence}\n${finding.description}`);
  if (explicitFromEvidence.length > 0) {
    return {
      targetFile: explicitFromEvidence[0],
      candidates: explicitFromEvidence,
      reasoning: "Selected from explicit file path(s) mentioned in finding evidence/description.",
    };
  }

  const keywordMatches = scoreFilesAgainstFinding(finding)
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.file);

  const categoryDefaults = DEFAULT_TARGETS_BY_CATEGORY[finding.category] ?? [];
  const combined = uniquePreservingOrder([...keywordMatches, ...categoryDefaults]);

  if (combined.length === 0) return null;

  return {
    targetFile: combined[0],
    candidates: combined.slice(0, 5),
    reasoning:
      keywordMatches.length > 0
        ? "Selected by keyword overlap between the finding and likely target files, with category defaults as fallback."
        : "Selected from category-based default target files because no explicit file path was found.",
  };
}

export function alignProposalTarget(proposal: Proposal, resolved: ResolvedTarget | null): Proposal {
  if (!resolved) return proposal;

  const candidates = uniquePreservingOrder([
    proposal.target_file,
    ...(proposal.target_file_candidates ?? []),
    ...resolved.candidates,
  ]).filter(Boolean);

  const targetFile = candidates.includes(proposal.target_file) && proposal.target_file
    ? proposal.target_file
    : resolved.targetFile;

  return {
    ...proposal,
    target_file: targetFile,
    target_file_candidates: candidates,
    target_file_reasoning: proposal.target_file_reasoning?.trim() || resolved.reasoning,
  };
}

function extractPathsFromText(text: string): string[] {
  const matches = text.match(/agents\/[\w./-]+\.ts/g) ?? [];
  return uniquePreservingOrder(matches.filter(fileExistsRelativeToProject));
}

function scoreFilesAgainstFinding(finding: Finding): Array<{ file: string; score: number }> {
  const haystack = `${finding.title} ${finding.description} ${finding.evidence}`.toLowerCase();
  const keywords = extractKeywords(haystack);

  return AGENT_FILE_GLOBS.map((file) => {
    let score = 0;
    const basename = path.basename(file, ".ts").toLowerCase();
    const normalizedPath = file.toLowerCase();

    for (const keyword of keywords) {
      if (basename.includes(keyword)) score += 3;
      if (normalizedPath.includes(keyword)) score += 2;
    }

    if (finding.category === "diversity" && normalizedPath.includes("topic-picker")) score += 4;
    if (finding.category === "quality" && normalizedPath.includes("writer")) score += 4;
    if (finding.category === "seo" && (normalizedPath.includes("writer") || normalizedPath.includes("publisher"))) score += 4;
    if (finding.category === "tokens" && (normalizedPath.includes("writer") || normalizedPath.includes("image-gen") || normalizedPath.includes("meta-agent"))) score += 3;
    if (finding.category === "pipeline" && normalizedPath.includes("publisher")) score += 2;

    return { file, score };
  });
}

function extractKeywords(text: string): string[] {
  const raw = Array.from(new Set(text.match(/[a-z][a-z0-9-]{2,}/g) ?? []));
  return raw.filter((word) => !STOPWORDS.has(word)).slice(0, 20);
}

function fileExistsRelativeToProject(relativePath: string): boolean {
  return fs.existsSync(path.resolve(PROJECT_ROOT, relativePath));
}

function uniquePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

const STOPWORDS = new Set([
  "about","after","again","agent","agents","analysis","article","because","before","between","blog",
  "code","content","data","draft","finding","findings","from","have","into","issue","latest","meta",
  "more","next","only","post","posts","quality","recent","report","should","that","their","them",
  "there","these","they","this","topic","using","with","would","writes","writer"
]);
