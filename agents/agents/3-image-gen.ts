/**
 * Agent 3 — ImageGen (pi Agent)
 * Generates a featured image for the article.
 *
 * pi Agent produces the generation prompt + alt text via return_image_spec tool.
 * CF Workers AI handles the actual image generation (unchanged).
 * sharp handles WebP conversion (unchanged).
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { getImageGenConfig } from "../lib/convex-client.ts";
import { generateImage } from "../lib/pi-llm-client.ts";
import { toSlug } from "../lib/slug.ts";
import { IMAGE_OUTPUT_DIR } from "../lib/paths.ts";
import { loadSkill } from "../lib/skill-loader.ts";
import { runOneShotPiAgent } from "../lib/pi-agent-utils.ts";
import { createReturnImageSpecTool } from "../extensions/image-gen-tools.ts";
import type { ImageSpec } from "../extensions/image-gen-tools.ts";
import type { ChosenTopic, ImageGenConfig, ImageResult, ResearchData } from "../types/pipeline.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_IMAGE_GEN_CONFIG: ImageGenConfig = {
  specPrompt: {
    includeAngle: true,
    includeCategory: true,
    includeKeywords: true,
    keywordLimit: 6,
    includeResearchFindings: true,
    researchFindingLimit: 3,
    includeResearchPapers: true,
    researchPaperLimit: 2,
    customInstruction: "",
  },
  imagePrompt: {
    maxPromptChars: 300,
    maxAltTextChars: 125,
    stylePreset: "editorial abstract AI illustration, dark sci-fi, cyberpunk concept art",
    qualityBoosters: "masterpiece, best quality, ultra-detailed, 8k, sharp focus, cinematic composition",
    negativeConstraints: "no text, no logos, no human faces, no humanoid robots, no light bulbs, no stock photo",
    fallbackPromptTemplate: "{category} AI technology abstract, dark background neon accents, cinematic wide 16:9, no text, no logos, no humanoid robot",
    fallbackAltTemplate: "Abstract illustration representing {title}",
  },
  generation: {
    enabled: true,
    retryWithSimplePrompt: true,
    allowUnsplashFallback: true,
    allowSolidColorFallback: true,
  },
  output: {
    width: 1600,
    height: 900,
    quality: 85,
    format: "webp",
  },
};

function applyTemplate(template: string, topic: ChosenTopic) {
  return template
    .replaceAll("{title}", topic.title)
    .replaceAll("{category}", topic.category)
    .replaceAll("{angle}", topic.angle);
}

// ─── Build the context prompt ─────────────────────────────────────────────────

function buildVisualBrief(topic: ChosenTopic, research: ResearchData | undefined, config: ImageGenConfig): string {
  const lines = [
    `Article title: "${topic.title}"`,
  ];

  if (config.specPrompt.includeAngle) lines.push(`Editorial angle: ${topic.angle}`);
  if (config.specPrompt.includeCategory) lines.push(`Category: ${topic.category}`);
  if (config.specPrompt.includeKeywords) lines.push(`Keywords: ${topic.keywords.slice(0, config.specPrompt.keywordLimit).join(", ") || "none"}`);
  lines.push(`Style preset: ${config.imagePrompt.stylePreset}`);
  lines.push(`Quality boosters: ${config.imagePrompt.qualityBoosters}`);
  lines.push(`Negative constraints: ${config.imagePrompt.negativeConstraints}`);

  if (research?.keyFindings.length && config.specPrompt.includeResearchFindings) {
    lines.push("", "Key findings (for visual context):");
    research.keyFindings.slice(0, config.specPrompt.researchFindingLimit).forEach(f => lines.push(`- ${f}`));
  }
  if (research?.papers.length && config.specPrompt.includeResearchPapers) {
    lines.push("", "Relevant papers/products:");
    research.papers.slice(0, config.specPrompt.researchPaperLimit).forEach(p => lines.push(`- ${p.title}`));
  }
  if (config.specPrompt.customInstruction.trim()) {
    lines.push("", "Custom visual instruction:", config.specPrompt.customInstruction.trim());
  }
  return lines.join("\n");
}

// ─── Main run() ───────────────────────────────────────────────────────────────

export async function run(
  topic: ChosenTopic,
  slug?: string,
  research?: ResearchData
): Promise<ImageResult> {
  console.log("[ImageGen] Generating featured image...");

  let config = DEFAULT_IMAGE_GEN_CONFIG;
  try {
    config = await getImageGenConfig();
    console.log("[ImageGen] Loaded settings from Convex");
  } catch (err) {
    console.warn("[ImageGen] Could not load Convex settings; using code defaults:", (err as Error).message);
  }

  fs.mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });

  const imageSlug  = slug ?? toSlug(topic.title);
  const outputPath = path.join(IMAGE_OUTPUT_DIR, `${imageSlug}.webp`);

  // ── pi Agent: produce prompt + altText ───────────────────────────────────
  let imageSpec: ImageSpec | null = null;
  let returnImageSpecCallCount = 0;
  const returnTool = createReturnImageSpecTool((spec) => { imageSpec = spec; }, { once: true, maxPromptChars: config.imagePrompt.maxPromptChars });
  const oneShotResult = await runOneShotPiAgent<ImageSpec>({
    agentId: "ImageGen",
    systemPrompt: loadSkill("image-gen"),
    prompt:
      `Generate an editorial featured image spec for this article.\n\n` +
      `${buildVisualBrief(topic, research, config)}\n\n` +
      `Keep prompt under ${config.imagePrompt.maxPromptChars} characters and alt text under ${config.imagePrompt.maxAltTextChars} characters. ` +
      `Call return_image_spec once with the prompt and alt text. After calling return_image_spec, stop immediately and do not make another tool call.`,
    tools: [returnTool],
    returnToolName: "return_image_spec",
    getCapturedResult: () => imageSpec,
  });
  returnImageSpecCallCount = oneShotResult.returnCallCount;

  if (returnImageSpecCallCount > 1) {
    console.warn(`[ImageGen] return_image_spec was called ${returnImageSpecCallCount} times; only the first call was accepted.`);
  }

  // Fallback if agent didn't call the tool
  if (!imageSpec) {
    console.warn("[ImageGen] Agent did not call return_image_spec — using default prompt");
    imageSpec = {
      prompt: applyTemplate(config.imagePrompt.fallbackPromptTemplate, topic).slice(0, config.imagePrompt.maxPromptChars),
      altText: applyTemplate(config.imagePrompt.fallbackAltTemplate, topic).slice(0, config.imagePrompt.maxAltTextChars),
    };
  }

  const prompt = imageSpec.prompt.slice(0, config.imagePrompt.maxPromptChars);
  const altText = imageSpec.altText.slice(0, config.imagePrompt.maxAltTextChars);
  console.log(`[ImageGen] Prompt: ${prompt.slice(0, 80)}...`);

  // ── CF Workers AI: generate image ────────────────────────────────────────
  let imageBuffer: Buffer;
  let usedFallback = false;

  try {
    if (!config.generation.enabled) throw new Error("AI image generation disabled by settings");
    imageBuffer = await generateImage(prompt, topic, research, config.generation.retryWithSimplePrompt);
    console.log(`[ImageGen] Image generated (${imageBuffer.length} bytes)`);
  } catch (err) {
    console.error("[ImageGen] Image generation failed:", (err as Error).message);
    if (config.generation.allowUnsplashFallback) {
      try {
        const resp = await fetch(
          `https://source.unsplash.com/${config.output.width}x${config.output.height}/?artificial+intelligence,${encodeURIComponent(topic.category)}`
        );
        if (!resp.ok) throw new Error(`Unsplash ${resp.status}`);
        imageBuffer = Buffer.from(await resp.arrayBuffer());
        usedFallback = true;
      } catch (fallbackErr) {
        if (!config.generation.allowSolidColorFallback) throw fallbackErr;
        imageBuffer = await sharp({
          create: { width: config.output.width, height: config.output.height, channels: 3, background: { r: 15, g: 23, b: 42 } },
        }).webp({ quality: config.output.quality }).toBuffer();
        usedFallback = true;
      }
    } else {
      if (!config.generation.allowSolidColorFallback) throw err;
      imageBuffer = await sharp({
        create: { width: config.output.width, height: config.output.height, channels: 3, background: { r: 15, g: 23, b: 42 } },
      }).webp({ quality: config.output.quality }).toBuffer();
      usedFallback = true;
    }
  }

  // ── sharp: convert to WebP ────────────────────────────────────────────────
  try {
    await sharp(imageBuffer)
      .resize(config.output.width, config.output.height, { fit: "cover", position: "centre" })
      .webp({ quality: config.output.quality })
      .toFile(outputPath);
  } catch {
    fs.writeFileSync(outputPath, imageBuffer);
  }

  if (usedFallback) console.warn("[ImageGen] ⚠ Used fallback image, not AI-generated");
  console.log(`[ImageGen] ✓ Saved: ${outputPath}`);

  return { localPath: outputPath, publicUrl: "", altText, prompt };
}

// ─── Standalone runner ────────────────────────────────────────────────────────
if (process.argv[1]?.endsWith("3-image-gen.ts")) {
  const mock: ChosenTopic = {
    title: "The Rise of Small Language Models: Why Less Is More in 2026",
    angle: "SLMs are outperforming larger models on specialised tasks — efficiency is winning over scale.",
    category: "llms",
    categoryId: "placeholder",
    keywords: ["small language models", "SLM", "LLM efficiency"],
    sourceUrls: ["https://example.com"],
  };
  const result = await run(mock);
  console.log("\nImage result:", JSON.stringify(result, null, 2));
}

