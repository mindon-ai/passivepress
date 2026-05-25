import type { SocialPlatform, SocialPlatformPublishResult, SocialPublishContext, SocialRetryEntry } from "../../types/social.ts";
import { classifySocialError } from "./errors.ts";
import { publishToX } from "./platforms/x.ts";
import { withSocialRetry } from "./retry.ts";

const PUBLISHERS: Record<SocialPlatform, (context: SocialPublishContext) => Promise<SocialPlatformPublishResult>> = {
  x: publishToX,
};

export async function publishPlatform(
  platform: SocialPlatform,
  context: SocialPublishContext,
): Promise<SocialPlatformPublishResult & { retryHistory: SocialRetryEntry[] }> {
  const publisher = PUBLISHERS[platform];

  try {
    const { result, history } = await withSocialRetry(
      platform,
      () => publisher(context),
      { maxRetries: context.config.maxRetries, baseDelayMs: context.config.retryBackoffMs },
    );
    return { ...result, retryHistory: history };
  } catch (error) {
    const classified = classifySocialError(error);
    const history = (error as { retryHistory?: unknown }).retryHistory;
    return {
      platform,
      status: "failed",
      errorCode: classified.code,
      errorMessage: classified.message,
      retryHistory: Array.isArray(history) ? history as SocialRetryEntry[] : [],
    };
  }
}
