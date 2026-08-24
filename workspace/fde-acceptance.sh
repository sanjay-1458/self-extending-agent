#!/usr/bin/env bash

set -Eeuo pipefail

TARGET="/home/daytona/workspace/lenny-growth-assistant"
ZIP="/home/daytona/workspace/lenny-growth-assistant-submission.zip"

fail() {
  echo "FDE_ACCEPTANCE_FAILED: $1" >&2
  exit 1
}

pass() {
  echo "  ✅ $1"
}

cd "$TARGET"

echo "===== FDE ACCEPTANCE CHECK ====="

# --------------------------------------------------
# Required repository structure
# --------------------------------------------------

for dir in \
  frontend \
  backend \
  agent-service \
  scripts \
  tests \
  agent-transcripts
do
  [ -d "$dir" ] || fail "Missing directory: $dir"
done

pass "required directories"

for file in \
  README.md \
  PRD.md \
  design.md \
  architecture.md \
  docker-compose.yml \
  .env.example \
  .gitignore
do
  [ -s "$file" ] || fail "Missing or empty required file: $file"
done

pass "required documentation/files"

# --------------------------------------------------
# Secret safety
# --------------------------------------------------

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env is tracked by Git"
fi

pass ".env is not tracked"

# --------------------------------------------------
# Pi SDK
# --------------------------------------------------

[ -f agent-service/package.json ] ||
  fail "agent-service/package.json missing"

[ -d agent-service/node_modules/@earendil-works/pi-coding-agent ] ||
  fail "Pi Coding Agent package not installed"

node --input-type=module <<'NODE' ||
import {
  createAgentSession,
  SessionManager
} from "./agent-service/node_modules/@earendil-works/pi-coding-agent/dist/index.js";

if (typeof createAgentSession !== "function") {
  throw new Error("createAgentSession export missing");
}

if (
  typeof SessionManager !== "function" ||
  typeof SessionManager.inMemory !== "function"
) {
  throw new Error("SessionManager.inMemory missing");
}

console.log("PI_PUBLIC_API_OK");
NODE
fail "Pi public SDK verification failed"

grep -R \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -q "createAgentSession" \
  agent-service/src ||
  fail "Application does not use createAgentSession"

if grep -R \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E "new[[:space:]]+AgentSession[[:space:]]*\\(" \
  agent-service/src >/dev/null 2>&1
then
  fail "Direct new AgentSession(...) construction still exists"
fi

pass "Pi integration uses public SDK"

# --------------------------------------------------
# Backend dependencies
# --------------------------------------------------

PYTHON="python3"

if [ -x backend/.venv/bin/python ]; then
  PYTHON="backend/.venv/bin/python"
fi

"$PYTHON" - <<'PY' ||
import fastapi
import sqlalchemy

try:
    import psycopg
except ImportError:
    import psycopg2

print("BACKEND_IMPORTS_OK")
PY
fail "FastAPI/SQLAlchemy/PostgreSQL Python dependencies incomplete"

pass "backend imports"

# --------------------------------------------------
# PostgreSQL
# --------------------------------------------------

PGPASSWORD=lenny psql \
  -h 127.0.0.1 \
  -U lenny \
  -d lenny_growth \
  -c "SELECT 1;" >/dev/null ||
  fail "PostgreSQL unavailable"

pass "PostgreSQL"

# --------------------------------------------------
# Ollama
# --------------------------------------------------

curl -sf \
  http://127.0.0.1:11434/api/tags >/dev/null ||
  fail "Ollama unavailable"

ollama list | grep -F "qwen2.5:0.5b" >/dev/null ||
  fail "qwen2.5:0.5b missing"

pass "Ollama qwen2.5:0.5b"

# --------------------------------------------------
# Backend tests
# --------------------------------------------------

if [ -d backend/tests ]; then
  (
    cd backend
    if [ -x .venv/bin/python ]; then
      .venv/bin/python -m pytest -q
    else
      python3 -m pytest -q
    fi
  ) || fail "backend tests failed"
else
  fail "backend/tests missing"
fi

pass "backend tests"

# --------------------------------------------------
# Agent service
# --------------------------------------------------

(
  cd agent-service

  node -e '
    const p=require("./package.json");
    if (!p.scripts?.test) throw new Error("agent-service test script missing");
  '

  npm test

  if npm run | grep -q "typecheck"; then
    npm run typecheck
  fi

  if npm run | grep -q "build"; then
    npm run build
  fi
) || fail "agent-service validation failed"

pass "agent-service tests/build"

# --------------------------------------------------
# Frontend
# --------------------------------------------------

(
  cd frontend

  node -e '
    const p=require("./package.json");
    if (!p.scripts?.build) throw new Error("frontend build script missing");
    if (!p.scripts?.test) throw new Error("frontend test script missing");
  '

  npm test -- --run 2>/dev/null || npm test
  npm run build
) || fail "frontend validation failed"

pass "frontend tests/build"

# --------------------------------------------------
# Required multi-agent source
# --------------------------------------------------

for name in \
  orchestrator \
  research \
  grounded \
  ship30 \
  artifact \
  verification
do
  grep -R \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    -i "$name" \
    agent-service/src >/dev/null ||
    fail "Missing multi-agent implementation evidence: $name"
done

pass "multi-agent implementation"

# --------------------------------------------------
# Submission ZIP
# --------------------------------------------------

[ -f "$ZIP" ] ||
  fail "submission ZIP missing"

pass "submission ZIP"

# --------------------------------------------------
# Git cleanliness / push
# --------------------------------------------------

if [ -n "$(git status --porcelain)" ]; then
  echo "Current changes:"
  git status --short
  fail "target Git working tree is not clean"
fi

git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1 ||
  fail "Git upstream not configured"

read -r behind ahead <<< "$(git rev-list --left-right --count HEAD...@{u})"

[ "$behind" = "0" ] ||
  fail "local branch is behind origin"

[ "$ahead" = "0" ] ||
  fail "local commits have not been pushed"

pass "Git clean and synced"

echo
echo "FDE_ACCEPTANCE_OK"
