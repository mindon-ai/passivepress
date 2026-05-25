import fs from "node:fs/promises";
import path from "node:path";

async function loadEnvFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equalsIndex = line.indexOf("=");
      if (equalsIndex === -1) continue;
      const key = line.slice(0, equalsIndex).trim();
      const value = line.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await loadEnvFile(path.resolve(".env"));
await loadEnvFile(path.resolve(".env.local"));

const CONVEX_URL = (process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "http://127.0.0.1:3210").replace(/\/$/, "");

async function seedOnce(attempt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${CONVEX_URL}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "categories:seedPassivePressDefaults", args: {}, format: "json" }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Seed categories failed [${response.status}]: ${await response.text()}`);
    }

    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (attempt >= 3) throw error;
    console.warn(`Seed attempt ${attempt} failed: ${message}. Retrying...`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    return seedOnce(attempt + 1);
  } finally {
    clearTimeout(timeout);
  }
}

console.log(`Seeding PassivePress categories on ${CONVEX_URL}`);
const data = await seedOnce(1);
console.log(JSON.stringify(data.value, null, 2));
