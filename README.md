# NeuronPress

NeuronPress is an AI-assisted publishing system for technical AI news and analysis.

Current stack:
- Frontend: React + Vite + Tailwind
- Backend: Convex Cloud
- Publishing pipeline: TypeScript agents under `agents/`
- Shared LLM entrypoint: `agents/lib/pi-llm-client.ts`
- Default inference path: CLIPROXY-compatible endpoint via environment config

## Current architecture

### Frontend
- App source lives in `src/`
- Public site includes homepage, category pages, article pages, auth, and a posts-only admin area
- Blog URLs are root-level slugs like `/:slug`
- Charts are rendered in the frontend from markdown chart blocks

### Backend
- Convex functions live in `convex/`
- Main active data tables are:
  - `posts`
  - `categories`
  - `newsletterSubscriptions`
- Featured images are uploaded to Convex Storage and referenced from posts

### Agent system
- Agent runners live in `agents/agents/`
- Agent skills live in `agents/skills/`
- Agent extensions/tools live in `agents/extensions/`
- Shared runtime utilities live in `agents/lib/`
- Global agent rules live in `agents/AGENTS.md`

## Pipeline flow

The publishing pipeline in `agents/pipeline.ts` runs these stages:
1. TrendScout
2. TopicPicker
3. Researcher
4. ImageGen
5. DataViz
6. Writer
7. Publisher
8. MetaAgent
9. Mechanic

Notes:
- Research and DataViz are best-effort steps
- MetaAgent and Mechanic run after successful non-dry-run publishes
- Telegram notifications are sent when configured

## Admin

The admin page is now posts-only.

Supported admin actions:
- list posts
- create post
- edit post
- delete post

Removed architecture:
- no AI Agents tab
- no admin AI control center
- no Convex-backed per-agent runtime config UI
- no `convex/agents.ts`
- no `agentConfigs` or `agentCronJobs` tables

## Deployment

Full deploy:
```bash
cd /home/el/projects/neuronpress
bash scripts/deploy-all.sh
```

Backend only:
```bash
cd /home/el/projects/neuronpress
bash scripts/deploy-convex.sh
```

Frontend only:
```bash
cd /home/el/projects/neuronpress
bash scripts/deploy-frontend.sh
```

## Local verification

Build:
```bash
pnpm build
```

Tests:
```bash
pnpm test
```

If `pnpm` is not already available in a non-interactive shell:
```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24.14.1
corepack enable
CI=true pnpm build
CI=true pnpm test
```

## Operational notes

- Do not treat `public/blog/` as the normal destination for new featured images
- The live agent runtime uses `pi-llm-client.ts`, not the removed legacy cliproxy client
- Runtime behavior is now code-and-env driven rather than admin-UI driven
- Be careful with frontend deploys: `scripts/deploy-frontend.sh` may commit staged changes automatically

## Repository pointers

- Frontend admin page: `src/pages/Admin.tsx`
- Post editor: `src/pages/PostEditor.tsx`
- Convex posts API: `convex/posts.ts`
- Agent pipeline: `agents/pipeline.ts`
- Agent architecture notes: `agents/plan.md`

## Status

This repo has already completed the cleanup of the old admin AI/config-persistence layer. The current architecture is centered on:
- posts-focused admin UI
- Convex-backed content storage
- pi-based agent runtime
- environment-driven model/provider configuration
