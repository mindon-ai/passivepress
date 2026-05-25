#!/usr/bin/env bash
# setup-pi.sh — Run this once on your Debian server to wire up pi packages
# Usage: cd /path/to/neuronpress/agents && bash scripts/setup-pi.sh

set -euo pipefail

echo "=== NeuronPress × Pi Setup ==="
echo "Node: $(node -v)"
echo "pnpm: $(pnpm -v 2>/dev/null || echo 'not found — install with: npm i -g pnpm')"
echo ""

# ── 1. Install dependencies ────────────────────────────────────────────────
echo "▶ Installing dependencies..."
pnpm install
echo "✓ Dependencies installed"

# ── 2. Check pi-ai is available ───────────────────────────────────────────
echo ""
echo "▶ Checking @earendil-works/pi-ai..."
if node -e "import('@earendil-works/pi-ai').then(() => console.log('✓ pi-ai OK')).catch(e => { console.error('✗ pi-ai failed:', e.message); process.exit(1); })" 2>/dev/null; then
  echo "✓ pi-ai accessible"
else
  echo "⚠  pi-ai import failed — will fall back to CLIPROXY (this is fine)"
fi

# ── 3. Check skill files ──────────────────────────────────────────────────
echo ""
echo "▶ Verifying skill files..."
SKILLS_DIR="$(dirname "$0")/../skills"
EXPECTED_SKILLS=(
  "trend-scout"
  "topic-picker"
  "researcher"
  "writer"
  "writer-metadata"
  "image-gen"
  "dataviz"
  "meta-agent"
  "mechanic"
)
ALL_OK=true
for skill in "${EXPECTED_SKILLS[@]}"; do
  if [ -f "$SKILLS_DIR/${skill}.md" ]; then
    echo "  ✓ skills/${skill}.md"
  else
    echo "  ✗ skills/${skill}.md MISSING"
    ALL_OK=false
  fi
done

if [ "$ALL_OK" = true ]; then
  echo "✓ All skill files present"
else
  echo "✗ Some skill files are missing — check the skills/ directory"
  exit 1
fi

# ── 4. Verify provider config ─────────────────────────────────────────────
echo ""
echo "▶ Checking provider config..."
if [ -f ".env" ]; then
  if grep -q "CLIPROXY_API_KEY" .env && grep -q "CLIPROXY_BASE_URL" .env; then
    echo "✓ CLIPROXY config found in .env"
  fi
  if grep -q "ANTHROPIC_API_KEY" .env; then
    echo "  (optional) ANTHROPIC_API_KEY found — set PI_PROVIDER=anthropic to use it"
  fi
  if grep -q "OPENAI_API_KEY" .env; then
    echo "  (optional) OPENAI_API_KEY found — set PI_PROVIDER=openai to use it"
  fi
else
  echo "⚠  No .env file found — copy .env.example and fill in your keys"
fi

# ── 5. Quick smoke test ───────────────────────────────────────────────────
echo ""
echo "▶ Running skill-loader smoke test..."
npx tsx -e "
import { listSkills, loadSkill } from './lib/skill-loader.ts';
const skills = listSkills();
console.log('Available skills:', skills.join(', '));
if (skills.length === 0) { console.error('ERROR: No skills found'); process.exit(1); }
const sample = loadSkill(skills[0]);
console.log('Sample (' + skills[0] + ') first line:', sample.split('\n')[0]);
console.log('✓ skill-loader OK');
"

echo ""
echo "=== Setup complete ✓ ==="
echo ""
echo "Next steps:"
echo "  pnpm dry-run           → test full pipeline without publishing"
echo "  pnpm test:researcher   → test Researcher agent in isolation"
echo "  pnpm test:skills       → list all available skills"
echo ""
echo "To switch LLM provider, set in .env:"
echo "  PI_PROVIDER=anthropic  + ANTHROPIC_API_KEY=..."
echo "  PI_PROVIDER=openai     + OPENAI_API_KEY=..."
echo "  (unset)                → CLIPROXY (default, existing behaviour)"
