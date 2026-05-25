import type { SocialCampaignStatus, SocialPlatformAttempt, SocialPlatformStatus, SocialPublishSummary } from "../../types/social.ts";

function deriveStatus(attempts: SocialPlatformAttempt[], dryRun: boolean): SocialCampaignStatus {
  const published = attempts.filter((attempt) => attempt.status === "published").length;
  const failed = attempts.filter((attempt) => attempt.status === "failed").length;
  const skipped = attempts.filter((attempt) => attempt.status === "skipped").length;

  if (published > 0 && failed === 0) return "completed";
  if (published > 0 && failed > 0) return "partial";
  if (published === 0 && failed > 0) return "failed";
  if (dryRun && skipped === attempts.length && attempts.length > 0) return "completed";
  if (skipped > 0 && failed === 0) return "completed";
  return "pending";
}

export function buildSocialSummary(input: Omit<SocialPublishSummary, "status" | "succeededPlatforms" | "failedPlatforms" | "skippedPlatforms">): SocialPublishSummary {
  const attempts = input.attempts;
  const collect = (status: SocialPlatformStatus) => attempts.filter((attempt) => attempt.status === status).map((attempt) => attempt.platform);

  return {
    ...input,
    succeededPlatforms: collect("published"),
    failedPlatforms: collect("failed"),
    skippedPlatforms: collect("skipped"),
    status: deriveStatus(attempts, input.dryRun),
  };
}
