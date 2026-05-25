# Social Media Agent Implementation Plan

> For Hermes: Use subagent-driven-development skill to implement this plan task-by-task.

Goal: Add a new NeuronPress AI agent that automatically generates platform-specific social posts after each successful article publish, publishes them to X, Instagram, Facebook, LinkedIn, and Pinterest, and can also be run manually for an existing article.

Architecture: Add a new post-publish agent stage after Publisher that receives the published article context, generates tailored copy per platform, and hands off to deterministic platform clients. Keep the AI responsible for creative copy generation only; keep credentials, API calls, retries, dedupe, audit logs, and publishing state deterministic in TypeScript. Store posting history in Convex so the pipeline can avoid double-posting and support future admin visibility.

Tech Stack: TypeScript, existing pi-agent-core agent pattern, existing project-command spawn pattern, Convex schema/functions, platform REST APIs, local env/Convex env config, NeuronPress pipeline logging, Telegram alerts.

Assumptions from product decisions:
- Credentials are not available yet; the plan must prepare env/config surfaces without requiring live posting during initial build.
- Each platform gets different AI-crafted copy, not one shared caption.
- The agent should run both automatically after publish and manually on demand for an older article.
- Posting history must be persisted to avoid accidental duplicate posting.
- Instagram should publish image + caption with a link-in-bio style CTA.
- Pinterest should publish a Pin with image + title + destination URL.
- Failure policy: best default is non-blocking partial success. Retry transient failures a small number of times, continue posting to remaining platforms, write structured logs, persist failed attempts, and send a Telegram alert if one or more platforms fail.
- Brand/footer and hashtags should be generated consistently per platform.
- Public site URL should be treated as configurable, with current default/fallback aligned to NeuronPress public domain.

---

## 1. Existing System Analysis

### Current pipeline shape
Current `agents/pipeline.ts` runs:
1. TrendScout
2. TopicPicker
3. Researcher
4. ImageGen
5. DataViz
6. Writer
7. Publisher
8. MetaAgent (report-only)
9. Mechanic is manual only

Important implication: the best insertion point for social posting is immediately after successful Publisher completion, because only then do we have a real slug, real public URL, uploaded featured image, and Convex post id.

### Existing patterns to reuse
1. Agent pattern:
   - Agent files live in `agents/agents/`
   - Skills live in `agents/skills/`
   - Agent helpers use `loadSkill()` + `createPiAgent()`
   - Tool contracts live in `agents/extensions/`

2. Non-agent deterministic utilities:
   - Shared helpers live in `agents/lib/`
   - Telegram notification already exists in `agents/lib/telegram.ts`
   - Convex access already exists in `agents/lib/convex-client.ts`
   - Project subprocess launching exists in `agents/lib/project-command.ts`

3. Pipeline state/logging:
   - `PipelineContext` already carries publish outputs like slug and `convexPostId`
   - Pipeline logs final run artifacts into `agents/logs/`
   - Publisher returns `convexPostId`, `slug`, and `url`

4. Product constraints:
   - Do not casually disturb `pipeline.ts`
   - Agent code should not read/edit `.env` files directly
   - Keep post generation grounded and factual

### Recommended design principle
Split the feature into three layers:
1. AI layer: generate tailored copy and hashtag suggestions.
2. Delivery layer: call each social network API deterministically.
3. State layer: store attempts/results in Convex for dedupe, retry visibility, and future admin UI.

This separation is important because API posting failures should never require rerunning the LLM unless copy generation itself failed.

---

## 2. Target End State

After this feature is complete, a normal pipeline publish should behave like this:
1. Publisher inserts the article into Convex.
2. Pipeline builds a social payload using the published article, featured image, excerpt, keywords, category, and canonical URL.
3. Social Media Agent generates per-platform content.
4. Delivery clients attempt publishing to enabled platforms.
5. Convex records one campaign row plus per-platform attempt/result rows.
6. Pipeline logs summary output.
7. If some platforms fail, the article still remains published; failed platforms are retried later manually or through a retry utility.
8. Telegram gets a concise warning if one or more platforms fail.

Manual mode should allow:
- posting a specific slug
- posting a specific Convex post id
- posting only selected platforms
- forcing repost even if history exists
- dry-run preview without sending anything

---

## 3. Proposed File-Level Changes

### New agent files
Create:
- `agents/agents/10-social-media-agent.ts`
- `agents/skills/social-media-agent.md`
- `agents/extensions/social-media-tools.ts`

### New supporting libraries
Create:
- `agents/lib/social/types.ts`
- `agents/lib/social/config.ts`
- `agents/lib/social/content-builder.ts`
- `agents/lib/social/url.ts`
- `agents/lib/social/retry.ts`
- `agents/lib/social/platforms/x.ts`
- `agents/lib/social/platforms/facebook.ts`
- `agents/lib/social/platforms/instagram.ts`
- `agents/lib/social/platforms/linkedin.ts`
- `agents/lib/social/platforms/pinterest.ts`
- `agents/lib/social/publisher.ts`
- `agents/lib/social/result-summary.ts`

Optional but recommended:
- `agents/lib/social/errors.ts`
- `agents/lib/social/hashtags.ts`
- `agents/lib/social/brand.ts`

### New/updated types
Modify:
- `agents/types/pipeline.ts`

Create:
- `agents/types/social.ts`

Note: Do NOT also create `agents/lib/social/types.ts`. The project convention
(see `agents/types/pipeline.ts`, `agents/types/meta.ts`) is that all shared types
live under `agents/types/`. Only put types in `agents/types/social.ts`.

### Convex backend changes
Modify:
- `convex/schema.ts`
- `convex/posts.ts` only if needed for article lookup convenience

Create:
- `convex/socialPosts.ts`

### Pipeline integration
Modify:
- `agents/pipeline.ts`
- `agents/package.json`

### Documentation/config surfaces
Create or update:
- `agents/.env.example` or equivalent env documentation if present
- `docs/plans/10-social-media-agent.md` (this file)
- optional future docs: `docs/social-media-agent.md`

---

## 4. Data Model Design

### Convex table 1: socialCampaigns
Purpose: one record per article-level social publishing run.

Suggested fields:
- `postId: v.id("posts")`
- `postSlug: v.string()`
- `postTitle: v.string()`
- `canonicalUrl: v.string()`
- `featuredImageUrl: v.optional(v.string())`
- `status: v.union(v.literal("pending"), v.literal("partial"), v.literal("completed"), v.literal("failed"))`
- `trigger: v.union(v.literal("auto"), v.literal("manual"), v.literal("retry"))`
- `platformsRequested: v.array(v.string())`
- `platformsSucceeded: v.array(v.string())`
- `platformsFailed: v.array(v.string())`
- `copyVersion: v.optional(v.string())`
- `errorSummary: v.optional(v.string())`
- `startedAt: v.number()`
- `completedAt: v.optional(v.number())`
- `createdAt: v.number()`
- `updatedAt: v.number()`

Recommended indexes:
- `by_postId`
- `by_postSlug`
- `by_status`
- `by_createdAt`

### Convex table 2: socialPlatformPosts
Purpose: one row per platform attempt/result, including remote identifiers.

Suggested fields:
- `campaignId: v.id("socialCampaigns")`
- `postId: v.id("posts")`
- `postSlug: v.string()`
- `platform: v.union(v.literal("x"), v.literal("instagram"), v.literal("facebook"), v.literal("linkedin"), v.literal("pinterest"))`
- `status: v.union(v.literal("pending"), v.literal("published"), v.literal("failed"), v.literal("skipped"))`
- `attemptNumber: v.number()`
- `remotePostId: v.optional(v.string())`
- `remoteUrl: v.optional(v.string())`
- `requestPayload: v.optional(v.any())`
- `responsePayload: v.optional(v.any())`
- `generatedText: v.optional(v.string())`
- `generatedHashtags: v.optional(v.array(v.string()))`
- `imageUrl: v.optional(v.string())`
- `errorCode: v.optional(v.string())`
- `errorMessage: v.optional(v.string())`
- `publishedAt: v.optional(v.number())`
- `createdAt: v.number()`
- `updatedAt: v.number()`

Recommended indexes:
- `by_campaignId`
- `by_postId`
- `by_postSlug`
- `by_post_platform` for dedupe checks
- `by_status`

### Why two tables instead of one
Use two tables because campaign-level questions and platform-level questions are different:
- campaign-level: “Was this article shared?”
- platform-level: “Did Pinterest fail twice?”, “What was the LinkedIn post URL?”

This structure also makes future admin UI much easier.

---

## 5. Runtime Config Design

### Central config module
Create `agents/lib/social/config.ts` that resolves runtime configuration from env, not from scattered `process.env` reads.

Suggested config shape:
- `siteUrl`
- `brandName`
- `defaultPlatforms`
- `telegramAlertsEnabled`
- `maxRetries`
- `retryBackoffMs`
- `dryRun`
- per-platform enable flags
- per-platform credentials

### Suggested environment variables
Add placeholders only; do not require them yet.

Core:
- `SITE_URL` — use `CONVEX_SITE_URL` (already in `agents/.env`) as primary source.
  The config module should read `process.env.CONVEX_SITE_URL ?? process.env.SITE_URL`
  with fallback to `https://neuronpress.qzz.io`. Do NOT introduce a new `SITE_URL`
  variable that conflicts with the existing one.
- `SOCIAL_BRAND_NAME=NeuronPress`
- `SOCIAL_DEFAULT_PLATFORMS=x,instagram,facebook,linkedin,pinterest`
- `SOCIAL_MAX_RETRIES=2`
- `SOCIAL_ENABLE_TELEGRAM_ALERTS=true`

X:
- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`
- optional `X_BEARER_TOKEN`

Meta / Facebook / Instagram:
- `META_APP_ID`
- `META_APP_SECRET`
- `META_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ID`
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`

LinkedIn:
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_ACCESS_TOKEN`
- `LINKEDIN_ORGANIZATION_ID` or member id depending on target posting mode

Pinterest:
- `PINTEREST_ACCESS_TOKEN`
- `PINTEREST_BOARD_ID`

### Important config rule
The first implementation should validate required env only for the platforms being requested. Missing Pinterest credentials should not block X posting.

---

## 6. Social Content Contract

### Input to the AI agent
Build a normalized payload from the published article containing:
- title
- slug
- canonical URL
- excerpt
- keywords
- category slug/name
- featured image URL
- featured image alt text
- first 1-2 key takeaways or content snippets
- optional research highlights if available
- brand/footer rules

### Output from the AI agent
The AI should return structured content for all platforms in one tool call, for example:
- X: short hook, optional thread continuation, hashtags list, CTA
- LinkedIn: professional summary, stronger thought-leadership framing, CTA
- Facebook: conversational teaser, CTA
- Instagram: caption, visual framing, hashtags, CTA without raw link dependency
- Pinterest: pin title, pin description, keyword-rich but natural text

### Strong recommendation
Do not let the model call APIs directly. The model should return only structured copy.

Example output shape:
- `x.text`
- `x.hashtags[]`
- `x.threadParts[]` optional
- `facebook.text`
- `instagram.caption`
- `linkedin.text`
- `pinterest.title`
- `pinterest.description`
- `shared.brandFooter`

### Prompt rules for the agent skill
In `agents/skills/social-media-agent.md`, enforce:
- Tailor tone to each platform.
- Never invent facts beyond article content.
- Use article title, excerpt, and keywords accurately.
- Keep X concise.
- Keep LinkedIn more insight-led.
- Make Instagram caption visual-first and non-link-dependent.
- Make Pinterest description discovery-oriented.
- Return exactly one structured tool call.
- Include concise, relevant hashtags only.
- Avoid spammy over-tagging.

---

## 7. Platform Publishing Rules

### X
Publish mode:
- Start simple: single tweet with link + concise text.
- Optional future enhancement: thread mode for longer summaries.

Required output:
- tweet text
- hashtags merged naturally
- article URL

Implementation note:
- Enforce hard character limit in deterministic code, not just prompt instructions.
- If too long, trim hashtags first, then shorten CTA, then fallback to shortened body.

### Facebook
Publish mode:
- page post with message + article link + image if supported by endpoint flow

Implementation note:
- Use page posting flow, not personal account posting.
- Keep first implementation page-oriented.

### Instagram
Publish mode:
- publish the featured image with caption via Instagram Graph API
- use “Read more via link in bio” style CTA unless you later add story/link workflows

Implementation note:
- Requires business/creator account linked to a Facebook page.
- First implementation can assume one static account target.

### LinkedIn
Publish mode:
- organization post or personal post, but choose one and encode it cleanly

Recommendation:
- plan for organization posting first if NeuronPress is a brand.

### Pinterest
Publish mode:
- create pin using featured image, title, description, and destination URL

Implementation note:
- board id must be configured
- ensure destination link is canonical article URL

---

## 8. Pipeline Integration Design

### Automatic mode
Modify `agents/pipeline.ts` so after successful Publisher completion and before or after MetaAgent report, it triggers the social media step.

Recommended order:
1. Publisher
2. Social Media Agent
3. MetaAgent report-only

Reason:
- Social posting is part of content distribution, closer to publish.
- MetaAgent is analysis/self-improvement and should not block distribution.

### Pipeline context changes
Extend `PipelineContext` with optional social section:
- `socialCampaignId?: string`
- `socialResults?: SocialPublishSummary`

### Failure behavior
Recommended behavior in pipeline:
- Social failures should not throw a fatal pipeline error after the article is already published.
- Instead, collect the error, log it, persist failure state, alert Telegram, and continue to MetaAgent.

This is the safest operational behavior because publishing the blog post is the primary goal; social syndication is secondary.

### Pipeline integration: direct import, NOT subprocess spawn

IMPORTANT: Do NOT use `spawnAgent("social")` for the pipeline auto-trigger.

`spawnAgent()` only executes `pnpm run <scriptName>` with no way to pass arguments.
The social agent needs `slug`, `convexPostId`, and `imageUrl` from the live
`PipelineContext` — these are not on disk yet when the social stage runs.

The correct pattern is a direct in-process import, same as Publisher:

```ts
import * as socialAgent from "./agents/10-social-media-agent.ts";

// After publisher.run(ctx) succeeds:
await socialAgent.run(ctx); // receives the full live context
```

The `social` package.json script is for manual standalone use only.

### Manual mode
Add script entry in `agents/package.json`:
- `social`: `tsx agents/10-social-media-agent.ts`

Suggested CLI flags (manual mode only):
- `--slug <slug>`
- `--post-id <id>`
- `--platforms x,linkedin`
- `--dry-run`
- `--force`
- `--retry-failed`

---

## 9. Dedupe and Idempotency Rules

This is critical.

### Default dedupe behavior
Before posting, the system should check `socialPlatformPosts` for existing successful records for the same `postSlug` + `platform`.

Rules:
- if success exists and `--force` is not set, skip that platform
- if failure exists, allow retry
- if pending/stale exists, mark carefully or create a fresh attempt row with incremented attempt number

### Why this matters
Without this, rerunning the pipeline or manual script can easily spam all channels with duplicate posts.

### Campaign idempotency
The auto-run path should create one new campaign per publish event. Manual retries can either:
- create a new retry campaign referencing the same post, or
- append attempts under a fresh campaign with `trigger="retry"`

Recommendation:
Create a new campaign row for each explicit run. Keep per-platform history append-only for auditability.

---

## 10. Retry Strategy

### Retry policy
Use deterministic retries for transient errors only.

Retry candidates:
- 429 rate limit
- 5xx provider errors
- timeouts
- temporary network failures

Do not retry blindly for:
- invalid credentials
- malformed payload
- missing image URL
- account permission errors

### Suggested default
- max retries: 2
- exponential backoff: 2s, then 6s
- log each attempt

### Implementation helper
Add `agents/lib/social/retry.ts` with a helper like:
- `withSocialRetry(platform, fn, classifyError)`

---

## 11. Telegram Alerting

Reuse `agents/lib/telegram.ts`.

Send Telegram only when:
- one or more platforms fail in auto mode
- full social campaign fails completely
- env misconfiguration means zero requested platforms were able to run

Telegram message should include:
- article title
- slug/url
- succeeded platforms
- failed platforms
- short reason per failed platform
- whether manual retry is available

Do not send Telegram for pure dry-runs.

---

## 12. Logging and Audit Artifacts

### Convex persistence
Primary source of truth for campaign and per-platform results.

### Local logs
Also write a JSON artifact into `agents/logs/`, for example:
- `<runId>-social.json`

Include:
- campaign summary
- generated copy per platform
- payload previews with secrets removed
- remote ids/urls if available
- errors and retry history

This helps debugging without opening Convex directly.

---

## 13. Admin UI Future-Proofing

The user answered yes to tracking. Even if admin UI is not implemented now, plan the schema and query layer so it can support:
- “Shared to X/LinkedIn/Facebook?” badges on post list
- last social campaign status per post
- per-platform retry button later
- view generated copy and remote links later

This means Convex functions should be designed for future UI queries, not only script use.

Recommended future queries in `convex/socialPosts.ts`:
- `getByPostSlug`
- `listCampaignsByPost`
- `listRecentCampaigns`
- `getPlatformStatusForPost`

---

## 14. Implementation Tasks

### Task 1: Define shared social types

Objective: Create the canonical TypeScript contracts before wiring logic.

Files:
- Create: `agents/types/social.ts`
- Modify: `agents/types/pipeline.ts`

Steps:
1. Add platform union type: `"x" | "instagram" | "facebook" | "linkedin" | "pinterest"`.
2. Define generated copy interfaces for each platform.
3. Define `SocialCampaignInput`, `SocialPlatformAttempt`, `SocialPublishSummary`, `SocialAgentResult`.
4. Extend `PipelineContext` with optional social result fields.
5. Keep types small and composable.

Verification:
- `cd /home/el/projects/neuronpress/agents && pnpm exec tsc --noEmit`

### Task 2: Add Convex schema for social tracking

Objective: Persist campaign state and per-platform results.

Files:
- Modify: `convex/schema.ts`
- Create: `convex/socialPosts.ts`

Steps:
1. Add `socialCampaigns` table.
2. Add `socialPlatformPosts` table.
3. Add indexes for dedupe and admin queries.
4. Add mutations/queries for:
   - create campaign
   - create platform attempt
   - mark platform success
   - mark platform failure
   - get existing successful post by slug + platform
   - list campaign details by post
5. Keep response payload storage sanitized enough to avoid secret leakage.

Verification:
- `cd /home/el/projects/neuronpress && source "$HOME/.nvm/nvm.sh" && nvm use 24.14.1 && corepack enable && CI=true pnpm convex dev --once`
  or your existing Convex validation/deploy workflow as appropriate.

### Task 3: Add config resolver and URL helpers

Objective: Centralize env resolution and article URL building.

Files:
- Create: `agents/lib/social/config.ts`
- Create: `agents/lib/social/url.ts`
- Create: `agents/lib/social/errors.ts`

Steps:
1. Resolve `SITE_URL` safely with fallback.
2. Normalize platforms from CLI/config.
3. Validate per-platform credentials lazily.
4. Add error classification helpers.
5. Add canonical URL builder from slug.

Verification:
- Typecheck only.
- Add a tiny script smoke test if useful.

### Task 4: Build article-to-social input normalizer

Objective: Convert a published NeuronPress post into a clean AI input payload.

Files:
- Create: `agents/lib/social/content-builder.ts`
- Modify if needed: `agents/lib/convex-client.ts` or add lookup helpers

Steps:
1. Fetch post by slug or id for manual mode.
2. Build normalized fields: title, excerpt, url, image, keywords, category, snippets.
3. Extract short content preview for the model without dumping full markdown unless needed.
4. Add brand/footer settings and hashtag guidance.
5. Ensure missing excerpt/image cases degrade gracefully.

Verification:
- dry-run local script that prints the normalized payload for one known post.

### Task 5: Create the AI skill and tool contract

Objective: Make the model return structured per-platform copy once.

Files:
- Create: `agents/skills/social-media-agent.md`
- Create: `agents/extensions/social-media-tools.ts`

Steps:
1. Write the skill prompt with strict platform rules.
2. Define a single return tool such as `return_social_posts`.
3. Make hashtags optional but supported.
4. Add tool validation for required fields per platform.
5. Mirror TopicPicker-style one-shot termination behavior to avoid looping.

Verification:
- run a dry agent call against a sample payload and inspect JSON result.

### Task 6: Implement `10-social-media-agent.ts`

Objective: Add the orchestrator script that drives copy generation and publishing.

Files:
- Create: `agents/agents/10-social-media-agent.ts`

Steps:
1. Parse CLI flags.
2. Resolve article context from pipeline input or manual fetch.
3. Check dedupe state in Convex.
4. Create campaign row.
5. Load skill and run the pi-agent to generate copy.
6. Persist generated copy previews.
7. Hand off to deterministic platform publishers.
8. Aggregate result summary.
9. Write local log artifact.
10. Send Telegram alert if needed.
11. Return non-zero exit code only for total social stage failure in manual mode; in pipeline mode, let caller decide whether failure is fatal.

Verification:
- `cd /home/el/projects/neuronpress/agents && pnpm exec tsx agents/10-social-media-agent.ts --slug some-post --dry-run`

### Task 7: Implement the delivery clients

Objective: Separate each platform's API logic into isolated adapters.

Files:
- Create: `agents/lib/social/platforms/x.ts`
- Create: `agents/lib/social/platforms/facebook.ts`
- Create: `agents/lib/social/platforms/instagram.ts`
- Create: `agents/lib/social/platforms/linkedin.ts`
- Create: `agents/lib/social/platforms/pinterest.ts`
- Create: `agents/lib/social/publisher.ts`
- Create: `agents/lib/social/retry.ts`
- Create: `agents/lib/social/result-summary.ts`

Steps:
1. Define a common publisher interface.
2. Implement dry-run behavior consistently for every platform.
3. Implement request payload builders.
4. Add retry wrappers.
5. Return normalized result shape: success/failure, remote id/url, payload preview, error classification.

Verification:
- unit-like smoke tests with mocked env or mocked fetch wrappers.
- no live posting needed yet.

### Task 8: Integrate into main pipeline

Objective: Run the social agent automatically after Publisher.

Files:
- Modify: `agents/pipeline.ts`
- Modify: `agents/package.json`

Steps:
1. Add package script: `social`.
2. Add `spawnAgent("social")` or equivalent explicit command path.
3. Pass enough context for auto mode. Preferred options:
   - either pass `--slug` and let the script fetch from Convex
   - or pass both slug and post id after publish
4. Wrap the stage in non-fatal error handling.
5. Add run logger step status lines.
6. Preserve MetaAgent execution after the social stage.

Verification:
- dry-run pipeline path with social stage also in dry-run mode.

### Task 9: Add tests/smoke verification scripts

Objective: Make the feature maintainable without live credentials.

Files:
- optional create: `agents/scripts/social-smoke.ts`
- optional create: test files if repo already has a test setup path you want to extend

Steps:
1. Add fixture article payload or fetch real recent article.
2. Verify copy generation schema.
3. Verify character limit enforcement for X.
4. Verify dedupe skip behavior.
5. Verify retry classification logic.
6. Verify dry-run output formatting.

Verification:
- run smoke script locally in CI-friendly mode.

### Task 10: Document env setup and operations

Objective: Make future credential setup and usage obvious.

Files:
- Modify or create env docs under project docs
- Keep this plan updated if implementation decisions change materially

Steps:
1. Document required credentials per platform.
2. Document auto mode vs manual mode.
3. Document failure semantics.
4. Document how to retry one failed platform.
5. Document how to rotate tokens.

Verification:
- another developer should be able to configure the feature from docs only.

---

## 15. Suggested CLI UX

Recommended command examples:

Dry-run one post on all configured platforms:
`cd /home/el/projects/neuronpress/agents && pnpm run social -- --slug my-post-slug --dry-run`

Dry-run selected platforms:
`cd /home/el/projects/neuronpress/agents && pnpm run social -- --slug my-post-slug --platforms x,linkedin`

Retry only failed platforms:
`cd /home/el/projects/neuronpress/agents && pnpm run social -- --slug my-post-slug --retry-failed`

Force repost to all:
`cd /home/el/projects/neuronpress/agents && pnpm run social -- --slug my-post-slug --force`

Potential future convenience command:
`pnpm run social:latest`

---

## 16. Edge Cases to Handle Explicitly

1. Missing featured image
- X/Facebook/LinkedIn may still post link-only copy.
- Instagram and Pinterest likely cannot proceed normally.
- Mark those as failed/skipped with a clear reason.

2. Missing excerpt
- fallback to generated summary snippet from first paragraphs.

3. Missing keywords
- allow the model to infer a small number from title/excerpt/content preview.

4. Article already shared to some platforms
- skip successful ones by default.

5. One platform disabled in config
- mark skipped, not failed.

6. Raw URL too long or ugly
- still use canonical article URL; do not introduce a link shortener in v1 unless required.

7. X over character limit
- deterministic truncation and/or reduced hashtag set.

8. Instagram credential topology not ready
- fail only Instagram, do not fail the whole run.

9. Pinterest board id missing
- fail only Pinterest with actionable error.

10. Publisher succeeded but social campaign creation fails
- log locally, send Telegram, do not unpublish the article.

---

## 17. Security and Secrets Rules

1. Never write raw access tokens into logs, Convex rows, or Telegram alerts.
2. Sanitize request/response payloads before persistence.
3. Keep secrets in env only.
4. Validate the target platform/account ids at startup where possible.
5. Use least-privilege app permissions when setting up credentials later.

---

## 18. What Not to Do in V1

Avoid these until the simple path is working:
- multi-image Instagram carousels
- LinkedIn document/carousel posts
- X threads as default behavior
- video/reel generation
- social approval workflow UI
- scheduled delayed posting calendar
- automatic hashtag trend scraping
- A/B testing captions
- comment auto-replies

V1 should focus on reliable article syndication.

---

## 19. Recommended Build Order

Recommended order of execution:
1. types
2. Convex schema/query layer
3. config + URL helpers
4. content normalizer
5. AI skill + tool contract
6. agent orchestrator dry-run only
7. platform adapters dry-run only
8. pipeline integration dry-run
9. live credential integration platform by platform
10. docs and cleanup

And for live rollout, enable platforms in this order:
1. X (OAuth 1.0a user context — fastest to wire up end-to-end)
2. LinkedIn (OAuth 2.0, stricter API approval but well-documented for org posts)
3. Facebook (page token flow, straightforward once Meta app is approved)
4. Pinterest (board-based pin creation, simple REST but needs board id configured)
5. Instagram (Graph API via linked Facebook page — highest setup friction of all five)

Reason: X has the simplest credential setup for first end-to-end validation. Instagram
always requires a Facebook Business page link plus Graph API app review, making it
the slowest to go live even though it may be a priority platform.

---

## 20. Definition of Done

The feature is done when all of the following are true:

1. A successful NeuronPress article publish automatically triggers the social media stage.
2. The social stage can also run manually by slug/id.
3. The agent generates distinct platform-specific copy.
4. Posting results are stored in Convex at both campaign and per-platform levels.
5. The system prevents accidental duplicate posting by default.
6. Dry-run mode works without credentials.
7. Partial platform failures do not break article publishing.
8. Telegram alerts summarize failures in auto mode.
9. At least one end-to-end live post can be performed once credentials are added.
10. Future admin UI can query the stored social status without schema redesign.

---

## 21. Immediate Next Step

If you want, the next step after this plan should be implementation Part 1 only:
- create the social types
- add Convex schema
- scaffold `10-social-media-agent.ts`
- implement dry-run only

That keeps the first pass small, testable, and aligned with your preference for incremental work.
