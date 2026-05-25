/**
 * skill-loader.ts
 * Reads agent skill files from agents/skills/*.md and returns their content
 * as a ready-to-use system prompt string.
 *
 * Usage:
 *   import { loadSkill, loadSkillSection } from "./skill-loader.ts";
 *
 *   const systemPrompt = loadSkill("researcher");
 *   // → full content of agents/skills/researcher.md
 *
 *   const outputContract = loadSkillSection("researcher", "Output contract");
 *   // → content of the "## Output contract" section only
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, "../skills");

/**
 * Load the full content of a skill file.
 * @param skillName  File stem (e.g. "researcher" loads skills/researcher.md)
 * @returns Trimmed string content of the skill file
 * @throws  If the skill file does not exist
 */
export function loadSkill(skillName: string): string {
  const skillPath = path.join(SKILLS_DIR, `${skillName}.md`);
  if (!fs.existsSync(skillPath)) {
    throw new Error(
      `[SkillLoader] Skill not found: "${skillName}" (looked at ${skillPath})`
    );
  }
  return fs.readFileSync(skillPath, "utf-8").trim();
}

/**
 * Load only a named section from a skill file.
 * Sections are delimited by "## " headings.
 * Returns null if the section is not found.
 *
 * @param skillName    File stem (e.g. "writer")
 * @param sectionTitle Heading text without the "## " prefix (e.g. "Output contract")
 */
export function loadSkillSection(
  skillName: string,
  sectionTitle: string
): string | null {
  const content = loadSkill(skillName);
  const lines = content.split("\n");
  const headingLine = `## ${sectionTitle}`;
  const startIdx = lines.findIndex((l) => l.trim() === headingLine);
  if (startIdx === -1) return null;

  const endIdx = lines.findIndex(
    (l, i) => i > startIdx && l.startsWith("## ")
  );
  const sectionLines =
    endIdx === -1 ? lines.slice(startIdx + 1) : lines.slice(startIdx + 1, endIdx);

  return sectionLines.join("\n").trim();
}

/**
 * Check whether a skill file exists without throwing.
 */
export function hasSkill(skillName: string): boolean {
  return fs.existsSync(path.join(SKILLS_DIR, `${skillName}.md`));
}

/**
 * List all available skill names (without .md extension).
 */
export function listSkills(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}
