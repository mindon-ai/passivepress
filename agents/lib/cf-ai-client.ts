// Cloudflare Workers AI client — image generation
import "dotenv/config";
import { runLogger } from "./run-logger.ts";
import type { ChosenTopic, ResearchData } from "../types/pipeline.ts";
import { fetchWithTimeout } from "./http-utils.ts";

const CF_IMAGE_WORKER_URL =
  process.env.CF_IMAGE_WORKER_URL ??
  "https://imagenation.elmotazbillah07.workers.dev/";
const CF_IMAGE_WORKER_TOKEN = process.env.CF_IMAGE_WORKER_TOKEN ?? "";

/**
 * Generate an image via the custom Cloudflare Image Worker.
 * Returns a raw Buffer containing the image binary (PNG).
 */
export async function generateImage(
  prompt: string,
  topic?: ChosenTopic,
  research?: ResearchData,
  retryWithSimplePrompt = true
): Promise<Buffer> {
  const attempt = async (p: string): Promise<Buffer> => {
    const startedAt = Date.now();
    const response = await fetchWithTimeout(CF_IMAGE_WORKER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_IMAGE_WORKER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: p }),
    }, 45_000);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Image worker failed [${response.status}]: ${text}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    runLogger.recordImageCall({
      label: "Image generation",
      provider: "cloudflare-worker",
      durationMs: Date.now() - startedAt,
      bytes: buffer.length,
      promptPreview: p,
    });
    return buffer;
  };

  try {
    return await attempt(prompt);
  } catch (err) {
    if (!retryWithSimplePrompt) throw err;

    console.warn(
      `[ImageGen] First attempt failed (${(err as Error).message}), retrying with simplified prompt...`
    );

    const fallbackDetails = [
      topic?.title,
      topic?.angle,
      topic?.category,
      ...(topic?.keywords?.slice(0, 3) ?? []),
      ...(research?.keyFindings?.slice(0, 2) ?? []),
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(", ");

    const simplePrompt = [
      fallbackDetails || "technology editorial subject",
      "editorial featured image",
      "subject-specific modern illustration",
      "wide 16:9 composition",
      "cinematic lighting",
      "no text",
      "no watermarks",
      "no generic robot mascot",
      "no humanoid android",
    ].join(", ");

    return await attempt(simplePrompt);
  }
}
