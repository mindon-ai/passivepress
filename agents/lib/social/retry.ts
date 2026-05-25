import type { SocialErrorCode, SocialRetryEntry } from "../../types/social.ts";
import { classifySocialError } from "./errors.ts";

export interface RetryResult<T> {
  result: T;
  history: SocialRetryEntry[];
}

function backoffForAttempt(baseDelayMs: number, attempt: number): number {
  if (attempt <= 1) return baseDelayMs;
  return baseDelayMs * Math.pow(2, attempt - 1);
}

export async function withSocialRetry<T>(
  platform: string,
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number },
): Promise<RetryResult<T>> {
  const history: SocialRetryEntry[] = [];
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      const result = await fn();
      return { result, history };
    } catch (error) {
      const classified = classifySocialError(error);
      history.push({
        attempt,
        errorCode: classified.code as SocialErrorCode,
        message: classified.message,
        retryable: classified.retryable,
        timestamp: new Date().toISOString(),
      });

      if (!classified.retryable || attempt > options.maxRetries) {
        throw Object.assign(classified, { retryHistory: history, platform });
      }

      const delay = backoffForAttempt(options.baseDelayMs, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
