/**
 * Shared path constants for the agents pipeline.
 * Import this instead of duplicating the IMAGE_OUTPUT_DIR resolution in each agent.
 */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_IMAGE_OUTPUT_DIR = path.resolve(PROJECT_ROOT, ".tmp/generated-blog-images");

function resolveImageOutputDir(raw?: string): string {
  if (!raw?.trim()) return DEFAULT_IMAGE_OUTPUT_DIR;

  const value = raw.trim();
  const isWindowsDrivePath = /^[A-Za-z]:[\\/]/.test(value);

  // If a Windows path leaks into the Linux runtime env, ignore it and fall back
  // to the repo-local temp staging directory instead of creating weird literal
  // folders like "C:Users..." under agents/.
  if (isWindowsDrivePath && process.platform !== "win32") {
    return DEFAULT_IMAGE_OUTPUT_DIR;
  }

  const resolved = path.isAbsolute(value) ? value : path.resolve(__dirname, "..", value);

  // PassivePress was forked from NeuronPress; ignore stale absolute staging
  // paths that would write generated images into the old project checkout.
  const relativeToProject = path.relative(PROJECT_ROOT, resolved);
  const isInsideProject = relativeToProject === "" || (!relativeToProject.startsWith("..") && !path.isAbsolute(relativeToProject));
  if (!isInsideProject && /neuronpress/i.test(resolved)) {
    return DEFAULT_IMAGE_OUTPUT_DIR;
  }

  return resolved;
}

/**
 * Directory where featured images are staged locally before Convex storage upload.
 * Resolves from IMAGE_OUTPUT_DIR env var, or defaults to .tmp/generated-blog-images
 * at the repo root.
 */
export const IMAGE_OUTPUT_DIR = resolveImageOutputDir(process.env.IMAGE_OUTPUT_DIR);
