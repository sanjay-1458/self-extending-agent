# Self-Extending Agent Demo (LangChain + Gemini + Redis)

This is a local VS Code demo of a persistent autonomous agent that can:

1. Receive a high-level goal.
2. Ask Gemini (through LangChain) for the next capability/action.
3. Reuse an existing capability when possible.
4. Generate a new TypeScript capability when one is missing.
5. Generate tests for that capability.
6. Run TypeScript checks and Vitest.
7. Let Gemini repair failed generated code automatically.
8. Register successful capabilities in Redis.
9. Git commit each validated capability.
10. Push to a configured private Git repository when allowed.
11. Execute the capability and persist the observation.
12. Continue until Gemini determines the verified goal is complete.
13. Stop for a human only when a permission/secret/account authorization is missing.

The design follows a persistent self-extending loop: missing capabilities are generated, tested, registered, committed/pushed, executed, and then the original goal continues.

## 1. Prerequisites

- Node.js 22+
- VS Code
- Git
- Redis (Docker is easiest)
- Google AI Studio API key
- Private GitHub repository if `git_push` is enabled

## 2. Install

```bash
npm install
cp .env.example .env
```

Edit `.env`.

Important initial values:

```env
GOOGLE_API_KEY=...
GEMINI_MODEL=gemini-3.7-flash
REDIS_URL=redis://localhost:6379
GITHUB_REPO_URL=git@github.com:YOUR_USER/YOUR_PRIVATE_REPO.git
GIT_REMOTE=origin
GIT_BRANCH=main
```

Git authentication should be configured outside the LLM, preferably with SSH or your OS Git credential manager.

## 3. Start Redis

```bash
npm run redis:up
```

Or use any Redis instance and put its URL in `REDIS_URL`.

Redis is the primary persistent database for this MVP. Supabase is not required.

## 4. Install Playwright browser

```bash
npx playwright install chromium
```

Playwright is installed as a library so generated capabilities can import the browser primitive.

## 5. Configure permissions

Open:

```text
config/permissions.json
```

If a permission is `true`, the agent does not ask the human for approval each time.

Example:

```json
{
  "git_commit": true,
  "git_push": true,
  "modify_own_code": true,
  "execute_code": true,
  "browser": true
}
```

Secrets remain in `.env` and `.env` is ignored by Git.

## 6. First run

```bash
npm run dev -- --goal "Create a text file called hello.txt containing hello world"
```

A more interesting test:

```bash
npm run dev -- --goal "Visit example.com, get the page title, save it to output.txt, and finish only after the file exists"
```

## 7. Resume after missing access

If the agent needs a secret/permission it prints a state like:

```json
{
  "status": "BLOCKED_ON_ACCESS",
  "requiredSecret": "SOME_API_KEY",
  "resumeStep": "..."
}
```

Add the secret to `.env` or enable the permission, then:

```bash
npm run dev -- --resume "TASK_ID"
```

The task state comes from Redis, so it does not need to restart reasoning from zero.

## 8. Git behavior

On the first run the project checks Git:

- If this directory is not a repository, it runs `git init`.
- It renames/creates the branch configured by `GIT_BRANCH`.
- If `origin` is absent, it adds `GITHUB_REPO_URL`.
- Every successfully tested generated capability is committed.
- If `git_push=true`, it executes `git push -u origin <branch>`.
- If Git authentication is missing, the task becomes `BLOCKED_ON_ACCESS` rather than asking you to debug agent code.

Before running the agent, configure your Git identity if needed:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

For SSH GitHub authentication, configure SSH on your machine/container before running the demo.

## 9. Logs

You get logs both in the VS Code terminal and at:

```text
logs/agent.log
```

Useful prefixes:

```text
[boot]
[redis]
[planner]
[codegen]
[shell]
[git]
[capability]
[agent]
```

If something breaks, inspect the last 100-200 lines of `logs/agent.log`.

## 10. Important MVP limitation

This version mainly self-expands by creating persistent modules in:

```text
src/capabilities/generated/
```

Those modules are real project source, are tested, committed, pushed, registered in Redis, and reused later. Keep the small orchestration core stable while you test the idea. Once this loop is reliable, the next version can add a guarded project-patching capability for broader edits to the core itself.

Do this first because it makes debugging much easier: if a generated capability is bad, your supervisor/agent loop is still alive and can repair it.
