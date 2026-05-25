/**
 * Shared HTTP utilities.
 */

/** 
 * Wrap a fetch with a timeout. 
 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}
