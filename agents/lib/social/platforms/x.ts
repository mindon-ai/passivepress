import path from "path";
import fs from "fs";
import { chromium } from "playwright";
import type { Page, BrowserContext } from "playwright";
import type { SocialPlatformPublishResult, SocialPublishContext } from "../../../types/social.ts";
import { SocialPublishError, sanitizePayload } from "../errors.ts";

const SESSION_DIR = path.resolve(process.cwd(), ".cache/social");
const SESSION_PATH = path.join(SESSION_DIR, "x-session.json");
const COOKIES_PATH = path.join(SESSION_DIR, "x-cookies.json");
const X_HOME_URL = "https://x.com/home";
const X_LOGIN_URL = "https://x.com/login";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type BrowserExportCookie = {
  domain: string;
  expirationDate?: number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  name: string;
  path?: string;
  sameSite?: string | null;
  secure?: boolean;
  session?: boolean;
  value: string;
};

function toPlaywrightSameSite(value: string | null | undefined): "Strict" | "Lax" | "None" | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "strict") return "Strict";
  if (normalized === "lax") return "Lax";
  if (normalized === "no_restriction" || normalized === "none") return "None";
  return undefined;
}

async function addCookieFileToContext(context: BrowserContext): Promise<boolean> {
  if (!fs.existsSync(COOKIES_PATH)) return false;

  const raw = fs.readFileSync(COOKIES_PATH, "utf8");
  const parsed = JSON.parse(raw) as BrowserExportCookie[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new SocialPublishError("validation", `X cookie file exists but is empty/invalid: ${COOKIES_PATH}`);
  }

  await context.addCookies(
    parsed
      .filter((cookie) => cookie?.name && typeof cookie.value === "string")
      .map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path ?? "/",
        expires: cookie.session ? -1 : Math.floor(cookie.expirationDate ?? -1),
        httpOnly: Boolean(cookie.httpOnly),
        secure: Boolean(cookie.secure),
        sameSite: toPlaywrightSameSite(cookie.sameSite),
      })),
  );
  return true;
}

async function hasComposer(page: Page): Promise<boolean> {
  if ((await page.locator('[data-testid="tweetTextarea_0"]').count()) > 0) return true;
  if ((await page.locator('[data-testid="SideNav_NewTweet_Button"]').count()) > 0) return true;
  if ((await page.locator('a[href="/compose/post"]').count()) > 0) return true;
  if ((await page.getByText("What’s happening?").count()) > 0) return true;
  if ((await page.getByText("What's happening?").count()) > 0) return true;
  return false;
}

async function openHomeWithAuth(page: Page, context: BrowserContext) {
  const loadedCookies = await addCookieFileToContext(context);
  await page.goto(X_HOME_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await clearTransientErrorState(page);
  return { loadedCookies };
}

async function waitForAuthenticatedHome(page: Page, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await hasComposer(page)) return true;
    await page.waitForTimeout(2_000);
  }
  return false;
}

async function ensureAuthenticated(page: Page, context: BrowserContext, username?: string, password?: string) {
  const trySessionThenCookies = async () => {
    const { loadedCookies } = await openHomeWithAuth(page, context);
    if (await waitForAuthenticatedHome(page)) return { ok: true as const, mode: loadedCookies ? "cookies" : "session" };
    return { ok: false as const, loadedCookies };
  };

  const initial = await trySessionThenCookies();
  if (initial.ok) {
    console.log(`[SocialMediaAgent:X] Authenticated using ${initial.mode}.`);
    return { mode: initial.mode };
  }

  if (initial.loadedCookies) {
    console.log("[SocialMediaAgent:X] X auth failed with stored session, rebuilding fresh context from cookies...");

    if (fs.existsSync(SESSION_PATH)) {
      fs.unlinkSync(SESSION_PATH);
      console.log(`[SocialMediaAgent:X] Removed stale session state at ${SESSION_PATH}.`);
    }

    const freshContext = await page.context().browser()!.newContext({
      userAgent: DEFAULT_USER_AGENT,
      viewport: { width: 1440, height: 900 },
    });
    const freshPage = await freshContext.newPage();
    try {
      const retry = await openHomeWithAuth(freshPage, freshContext);
      if (await waitForAuthenticatedHome(freshPage)) {
        await freshContext.storageState({ path: SESSION_PATH });
        console.log("[SocialMediaAgent:X] X session recovered from cookie export successfully.");
        return { mode: retry.loadedCookies ? "cookies-refreshed" : "session" };
      }
    } finally {
      await freshContext.close();
    }

    throw new SocialPublishError(
      "permission",
      `Loaded X cookies from ${COOKIES_PATH}, but the account was not authenticated on x.com/home even after rebuilding the browser context from cookies. Replace x-cookies.json with a fresh export from a logged-in browser.`,
      false,
    );
  }

  if (!username || !password) {
    throw new SocialPublishError(
      "missing_credentials",
      `No valid X cookies found at ${COOKIES_PATH}, and X_USERNAME/X_PASSWORD were not provided for fallback login.`,
      false,
    );
  }

  console.log("[SocialMediaAgent:X] No valid cookie auth available, falling back to password login.");
  await maybeLogin(page, context, username, password);
  await page.goto(X_HOME_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (!(await hasComposer(page))) {
    throw new SocialPublishError("permission", "X authentication completed but compose box is still unavailable.", false);
  }
  console.log("[SocialMediaAgent:X] Password login succeeded and compose UI is available.");
  return { mode: "password" };
}

function ensureSessionDir() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function resolveXCredentials(values: Record<string, string | undefined>) {
  const username = values.X_USERNAME;
  const password = values.X_PASSWORD;
  if (!username || !password) {
    throw new SocialPublishError("missing_credentials", "X posting requires X_USERNAME and X_PASSWORD.");
  }
  return { username, password };
}

function normalizeHashtag(tag: string): string {
  return tag.replace(/^#+/, "").replace(/[^a-zA-Z0-9_]/g, "").trim();
}

function buildFinalHashtags(rawHashtags: string[] | undefined, keywords: string[]): string[] {
  const normalized = (rawHashtags ?? []).map(normalizeHashtag).filter(Boolean);
  const keywordFallbacks = keywords.map(normalizeHashtag).filter(Boolean);

  const ordered = ["PassivePress", ...normalized.filter((tag) => tag.toLowerCase() !== "passivepress")];
  for (const tag of keywordFallbacks) {
    if (ordered.length >= 3) break;
    if (!ordered.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      ordered.push(tag);
    }
  }

  const genericFallbacks = ["AI", "MachineLearning", "TechNews"];
  for (const tag of genericFallbacks) {
    if (ordered.length >= 3) break;
    if (!ordered.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      ordered.push(tag);
    }
  }

  return ordered.slice(0, 3);
}

function buildTweetText(context: SocialPublishContext): string {
  const hashtags = buildFinalHashtags(context.copy.x.hashtags, context.input.keywords);
  const hashtagText = hashtags.map((tag) => `#${tag}`).join(" ");
  const body = context.copy.x.text.trim();
  const suffix = context.input.canonicalUrl ? `\n\n${context.input.canonicalUrl}` : "";

  let candidate = [body, hashtagText].filter(Boolean).join("\n\n");
  candidate = `${candidate}${suffix}`.trim();
  if (candidate.length <= 280) return candidate;

  const maxBodyLength = Math.max(0, 280 - suffix.length - (hashtagText ? hashtagText.length + 4 : 0) - 1);
  const trimmedBody = body.length > maxBodyLength ? `${body.slice(0, Math.max(0, maxBodyLength - 1)).trimEnd()}…` : body;
  candidate = [trimmedBody, hashtagText].filter(Boolean).join("\n\n");
  candidate = `${candidate}${suffix}`.trim();
  if (candidate.length <= 280) return candidate;

  const bodyWithUrl = `${trimmedBody}${suffix}`.trim();
  if (bodyWithUrl.length <= 280) return bodyWithUrl;

  const allowed = Math.max(0, 280 - suffix.length - 1);
  return `${body.slice(0, allowed).trimEnd()}…${suffix}`.trim();
}

async function downloadImageToTemp(imageUrl: string): Promise<{ filePath: string; mimeType: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new SocialPublishError("network", `Failed to download featured image for X post [${response.status}] from ${imageUrl}`, true);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/webp";
  const extension = contentType.includes("png") ? ".png" : contentType.includes("jpeg") || contentType.includes("jpg") ? ".jpg" : ".webp";
  const filePath = path.join(SESSION_DIR, `x-upload-${Date.now()}${extension}`);
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
  return { filePath, mimeType: contentType };
}

async function attachFeaturedImage(page: Page, imageUrl?: string): Promise<string | undefined> {
  if (!imageUrl) return undefined;

  const uploadButton = page.locator('input[data-testid="fileInput"], input[type="file"]').first();
  if ((await uploadButton.count()) === 0) return undefined;

  const downloaded = await downloadImageToTemp(imageUrl);
  await uploadButton.setInputFiles(downloaded.filePath);
  await page.waitForTimeout(3_000);
  return downloaded.filePath;
}

function deriveRemoteUrl(page: Page): string | undefined {
  const current = page.url();
  if (/\/status\/\d+/.test(current)) return current;
  return undefined;
}

async function verifyTweetOnProfile(page: Page, expectedText: string): Promise<{ confirmed: boolean; profileUrl: string; profileExcerpt: string }> {
  const profileUrl = process.env.X_PROFILE_URL || 'https://x.com/passivepress';
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(6_000);
  const profileText = await page.locator('body').innerText().catch(() => '');
  const firstLine = expectedText.split('\n').map((line) => line.trim()).filter(Boolean)[0] ?? expectedText.slice(0, 80);
  const confirmed = profileText.includes(firstLine) && !/\b0 posts\b/i.test(profileText);
  return {
    confirmed,
    profileUrl,
    profileExcerpt: profileText.slice(0, 1200),
  };
}

async function waitForAny(page: Page, selectors: string[], timeout: number) {
  await Promise.any(
    selectors.map((selector) => page.waitForSelector(selector, { timeout })),
  );
}

async function clearTransientErrorState(page: Page) {
  const retryButton = page.getByRole("button", { name: /retry/i }).first();
  if (await retryButton.count()) {
    await retryButton.click().catch(() => {});
    await page.waitForTimeout(2_000);
  }

  const mask = page.locator('[data-testid="mask"]').first();
  if (await mask.count()) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1_000);
  }
}

async function waitForUsernameStep(page: Page, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await clearTransientErrorState(page);

    const usernameInput = page.locator('input[autocomplete="username"], input[name="text"]').first();
    if (await usernameInput.count()) {
      await usernameInput.waitFor({ timeout: 10_000 });
      return usernameInput;
    }

    const signInControl = page.getByRole("button", { name: /sign in/i }).first();
    const signInLink = page.getByRole("link", { name: /sign in/i }).first();
    if (await signInControl.count()) {
      await signInControl.click().catch(() => {});
      await page.waitForTimeout(2_000);
    } else if (await signInLink.count()) {
      await signInLink.click().catch(() => {});
      await page.waitForTimeout(2_000);
    }

    if (await usernameInput.count()) {
      await usernameInput.waitFor({ timeout: 10_000 });
      return usernameInput;
    }

    if (attempt < attempts) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2_000);
    }
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  throw new SocialPublishError(
    "network",
    `X login page did not render the username step. Current URL: ${page.url()}. Page text excerpt: ${bodyText.slice(0, 300)}`,
    true,
  );
}

export async function maybeLogin(page: Page, context: BrowserContext, username: string, password: string) {
  if (!page.url().includes("login") && !page.url().includes("/i/flow/login")) {
    const composerVisible = await page.locator('[data-testid="tweetTextarea_0"]').count();
    if (composerVisible > 0) return;
  }

  await page.goto(X_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const usernameInput = await waitForUsernameStep(page);
  await usernameInput.fill(username);
  await page.keyboard.press("Enter");

  await clearTransientErrorState(page);
  await waitForAny(page, [
    'input[name="password"]',
    'input[data-testid="ocfEnterTextTextInput"]',
  ], 20_000);

  const passwordInput = page.locator('input[name="password"]');
  if (await passwordInput.count()) {
    await passwordInput.first().fill(password);
    await page.keyboard.press("Enter");
  } else {
    throw new SocialPublishError(
      "permission",
      "X login requires an extra verification step (username/email/2FA/CAPTCHA) that this headless flow does not currently automate.",
      false,
    );
  }

  await page.waitForURL(/x\.com\/(home|compose)/, { timeout: 30_000 });
  ensureSessionDir();
  await context.storageState({ path: SESSION_PATH });
}

export async function loginToXAndSaveSession(): Promise<{ success: true; sessionPath: string; currentUrl: string; authMode: string }> {
  ensureSessionDir();

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const browserContext = await browser.newContext({
    storageState: fs.existsSync(SESSION_PATH) ? SESSION_PATH : undefined,
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1440, height: 900 },
  });
  const page = await browserContext.newPage();

  try {
    const auth = await ensureAuthenticated(
      page,
      browserContext,
      process.env.X_USERNAME,
      process.env.X_PASSWORD,
    );
    await browserContext.storageState({ path: SESSION_PATH });

    return {
      success: true,
      sessionPath: SESSION_PATH,
      currentUrl: page.url(),
      authMode: auth.mode,
    };
  } finally {
    await browser.close();
  }
}

export async function publishToX(context: SocialPublishContext): Promise<SocialPlatformPublishResult> {
  const state = context.config.platforms.x;
  const finalHashtags = buildFinalHashtags(context.copy.x.hashtags, context.input.keywords);
  const finalText = buildTweetText(context);
  const payload = {
    text: finalText,
    mode: "playwright",
    sessionPath: SESSION_PATH,
    cookiesPath: COOKIES_PATH,
    imageUrl: context.input.featuredImageUrl,
  };

  if (context.dryRun) {
    return {
      platform: "x",
      status: "skipped",
      requestPayload: sanitizePayload(payload),
      generatedText: finalText,
      generatedHashtags: finalHashtags,
      errorCode: "dry_run",
      errorMessage: "Dry-run only; no browser session started.",
    };
  }

  if (!state.enabled) {
    return {
      platform: "x",
      status: "skipped",
      requestPayload: sanitizePayload(payload),
      generatedText: finalText,
      generatedHashtags: finalHashtags,
      errorCode: "misconfigured",
      errorMessage: "X posting is disabled in config.",
    };
  }

  if (!state.configured) {
    throw new SocialPublishError("missing_credentials", `X credentials missing: ${state.missing.join(", ")}`);
  }

  const fallbackCredentials =
    state.values.X_USERNAME && state.values.X_PASSWORD
      ? resolveXCredentials(state.values)
      : { username: undefined, password: undefined };

  ensureSessionDir();
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const browserContext = await browser.newContext({
    storageState: fs.existsSync(SESSION_PATH) ? SESSION_PATH : undefined,
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1440, height: 900 },
  });
  const page = await browserContext.newPage();

  let uploadedImagePath: string | undefined;
  try {
    const auth = await ensureAuthenticated(
      page,
      browserContext,
      fallbackCredentials.username,
      fallbackCredentials.password,
    );

    let composer = page.locator('[data-testid="tweetTextarea_0"]').first();
    if ((await composer.count()) === 0) {
      const inlineComposerTrigger = page.getByText("What’s happening?").first();
      const inlineComposerTriggerAscii = page.getByText("What's happening?").first();

      if (await inlineComposerTrigger.count()) {
        await inlineComposerTrigger.click().catch(() => {});
      } else if (await inlineComposerTriggerAscii.count()) {
        await inlineComposerTriggerAscii.click().catch(() => {});
      } else {
        const newPostButton = page.locator('[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"]').first();
        await clearTransientErrorState(page);
        await newPostButton.waitFor({ timeout: 20_000 });
        await newPostButton.click({ force: true });
      }

      await clearTransientErrorState(page);
      composer = page.locator('[data-testid="tweetTextarea_0"]').first();
    }

    await composer.waitFor({ timeout: 20_000 });
    await composer.click({ force: true });
    await composer.fill(finalText);

    uploadedImagePath = await attachFeaturedImage(page, context.input.featuredImageUrl);

    await clearTransientErrorState(page);
    const postButton = page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').first();
    await postButton.waitFor({ timeout: 10_000 });
    await postButton.click({ force: true });

    await page.waitForTimeout(4_000);
    await browserContext.storageState({ path: SESSION_PATH });

    const pageTextAfterPost = await page.locator('body').innerText().catch(() => '');
    const graduatedAccess = page.url().includes('/i/graduated-access') || /unlock more on x/i.test(pageTextAfterPost);
    const successIndicators = [
      'Show 35 posts',
      'Show new posts',
      'Your post was sent',
      'Your Home Timeline',
    ];
    const hasSuccessIndicator = successIndicators.some((indicator) => pageTextAfterPost.includes(indicator));
    const remoteUrl = deriveRemoteUrl(page);
    const profileCheck = await verifyTweetOnProfile(page, finalText);
    const published = profileCheck.confirmed;
    const diagnosticHints: string[] = [];
    if (graduatedAccess) diagnosticHints.push('Refresh X cookie export, then run pnpm run social:x:login to rebuild session state.');
    if (!profileCheck.confirmed) diagnosticHints.push('If the tweet is missing on the profile, treat the submission as failed and retry only after manual account activity or refreshed cookies.');
    if (!remoteUrl) diagnosticHints.push('X did not expose a status permalink; verify the newest post manually on the configured PassivePress profile if needed.');
    const failureGuidance = diagnosticHints.length > 0 ? ` Recovery hints: ${diagnosticHints.join(' ')}` : '';

    if (uploadedImagePath && fs.existsSync(uploadedImagePath)) {
      fs.unlinkSync(uploadedImagePath);
    }

    return {
      platform: 'x',
      status: published ? 'published' : 'failed',
      remoteUrl: remoteUrl ?? profileCheck.profileUrl,
      requestPayload: sanitizePayload(payload),
      responsePayload: sanitizePayload({
        postedVia: 'playwright',
        currentUrl: page.url(),
        authMode: auth.mode,
        imageAttached: Boolean(uploadedImagePath),
        graduatedAccess,
        hasSuccessIndicator,
        profileConfirmed: profileCheck.confirmed,
        profileUrl: profileCheck.profileUrl,
        profileExcerpt: profileCheck.profileExcerpt,
        recoveryHints: diagnosticHints,
      }),
      generatedText: finalText,
      generatedHashtags: finalHashtags,
      errorCode: published ? undefined : (graduatedAccess ? 'permission' : 'unknown'),
      errorMessage: published ? undefined : `X submission was not confirmed on the public profile timeline, so the post cannot be treated as successfully published.${failureGuidance}`,
      publishedAt: published ? Date.now() : undefined,
    };
  } catch (error) {
    throw error instanceof SocialPublishError
      ? error
      : new SocialPublishError("unknown", error instanceof Error ? error.message : String(error), false);
  } finally {
    await browser.close();
  }
}
