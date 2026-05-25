import type { SocialErrorCode } from "../../types/social.ts";

export class SocialPublishError extends Error {
  code: SocialErrorCode;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(code: SocialErrorCode, message: string, retryable = false, details?: Record<string, unknown>) {
    super(message);
    this.name = "SocialPublishError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function sanitizePayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item)) as T;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, raw]) => {
      if (/(token|secret|authorization|password|cookie)/i.test(key)) {
        return [key, "[redacted]"];
      }
      return [key, sanitizePayload(raw)];
    });
    return Object.fromEntries(entries) as T;
  }
  return value;
}

export function classifySocialError(error: unknown): SocialPublishError {
  if (error instanceof SocialPublishError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("abort") || normalized.includes("timeout")) {
    return new SocialPublishError("timeout", message, true);
  }
  if (normalized.includes("429") || normalized.includes("rate limit")) {
    return new SocialPublishError("rate_limit", message, true);
  }
  if (normalized.includes("network") || normalized.includes("fetch failed") || normalized.includes("econnreset")) {
    return new SocialPublishError("network", message, true);
  }
  if (normalized.includes("permission") || normalized.includes("forbidden") || normalized.includes("scope") || normalized.includes("unauthorized")) {
    return new SocialPublishError("permission", message, false);
  }
  if (normalized.includes("credential") || normalized.includes("missing") || normalized.includes("misconfigured")) {
    return new SocialPublishError("missing_credentials", message, false);
  }
  if (normalized.includes("400") || normalized.includes("invalid") || normalized.includes("malformed")) {
    return new SocialPublishError("validation", message, false);
  }
  if (normalized.includes("500") || normalized.includes("502") || normalized.includes("503") || normalized.includes("504")) {
    return new SocialPublishError("remote_5xx", message, true);
  }

  return new SocialPublishError("unknown", message, false);
}
