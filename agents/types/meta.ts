// agents/types/meta.ts
// Shared types for the MetaAgent (Agent 6)

export interface AuditContext {
  generatedAt: string;
  pipeline: PipelineMetrics;
  posts: PostAudit[];
  agentSources: Record<string, string>;
  frontendSources: Record<string, string>;
  backendSources: Record<string, string>;
  gaData: GAReport | null;
  constraints: {
    neverModify: string[];
    neverDelete: string[];
    neverAutoPush: true;
    requireBackupBefore: string[];
    schemaChangeRequiresReview: true;
  };
}

export interface PipelineMetrics {
  runsAnalyzed: number;
  runsWithTelemetry: number;
  dateRange: { from: string; to: string };
  categoryDistribution: Record<string, number>;
  dominantCategory: string;
  dominantCategoryPct: number;
  avgTotalTokens: number;
  maxTotalTokens: number;
  avgWriterTokens: number;
  avgTopicPickerTokens: number;
  avgImageGenPromptTokens: number;
  avgTotalDurationMs: number;
  avgWriterDurationMs: number;
  continuationTriggerCount: number;
  imageGenFallbackCount: number;
  llmCallBreakdown: LLMCallBreakdown[];
  stepFailures: Record<string, number>;
  recentSlugs: string[];
  recentTitles: string[];
  recentCategories: string[];
}

export interface LLMCallBreakdown {
  label: string;
  avgCompletion: number;
  maxTokensBudget: number;
  avgDurationMs: number;
  hitsBudget: boolean;
}

export interface PostAudit {
  slug: string;
  title: string;
  category: string;
  wordCount: number;
  readingTime: number;
  hasExcerpt: boolean;
  hasMetaTitle: boolean;
  hasMetaDescription: boolean;
  hasKeywords: boolean;
  hasFeaturedImage: boolean;
  sections: {
    hasKeyTakeaways: boolean;
    hasFAQ: boolean;
    hasConclusion: boolean;
    hasTableOfContents: boolean;
    hasCodeBlock: boolean;
    hasCallout: boolean;
    hasComparisonTable: boolean;
  };
  seo: {
    titleLength: number;
    metaTitleLength: number;
    metaDescLength: number;
    keywordCount: number;
  };
  issues: string[];
  content?: string;
}

export interface MetaReport {
  generatedAt: string;
  runsAnalyzed: number;
  postsAudited: number;
  findings: Finding[];
  proposals: Proposal[];
}

export interface Finding {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  category: "quality" | "tokens" | "diversity" | "seo" | "pipeline" | "frontend";
  title: string;
  description: string;
  evidence: string;
}

export interface Proposal {
  id: string;
  finding_id: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  type: "prompt_edit" | "code_edit" | "config_change" | "schema_change" | "frontend_edit";
  title: string;
  description: string;
  confidence?: number;
  requires_review: boolean;
  target_file: string;
  target_file_candidates?: string[];
  target_file_reasoning?: string;
  backup_needed: boolean;
  change: {
    oldText: string;
    newText: string;
  };
  test_command?: string;
  dry_run_recommended: boolean;
}

export interface GAReport {
  dateRange: { from: string; to: string };
  topPosts: { pagePath: string; pageViews: number; avgSessionDuration: number }[];
  topCategories: { slug: string; views: number }[];
}

export interface MetaSessionLog {
  type: "meta-agent-session";
  timestamp: string;
  runsAnalyzed: number;
  postsAudited: number;
  categoryDistribution: Record<string, number>;
  findingsCount: number;
  proposalsCount: number;
  appliedProposals: string[];
  findings: Finding[];
  proposals: Proposal[];
}

export interface RepairRunArtifact {
  type: "meta-proposal-run" | "mechanic-repair-run";
  timestamp: string;
  actor: "meta-agent" | "mechanic";
  proposalId: string;
  findingId: string;
  title: string;
  targetFile: string;
  targetFileCandidates: string[];
  targetFileReasoning: string;
  confidence: number | null;
  backupPath: string | null;
  verification: {
    attempted: boolean;
    success: boolean;
    reverted: boolean;
    message: string;
    exitCode?: number;
    timedOut?: boolean;
    duration?: number;
  };
}
