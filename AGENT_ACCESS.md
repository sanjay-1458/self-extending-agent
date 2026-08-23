# Agent access / initial requirements

The agent reads `config/permissions.json` and environment variables. It should NOT ask for human help for normal code bugs or failed tests. It should only stop with `BLOCKED_ON_ACCESS` when a required permission is disabled/missing or a required secret/account authorization is unavailable.

## Required before first run

1. `GOOGLE_API_KEY` in `.env`.
2. Redis running and `REDIS_URL` in `.env`.
   - Demo choice: Redis is the primary persistent state database.
   - You do NOT need Supabase for this MVP.
3. A private empty GitHub repository URL in `GITHUB_REPO_URL` if `git_push=true`.
4. Git authentication already configured on this machine/container, preferably SSH (`ssh -T git@github.com`) or Git Credential Manager.
5. Node.js 22+.
6. Playwright Chromium installed using `npx playwright install chromium`.

## How future access is added

If the agent needs a new external service, add the permission to `config/permissions.json` and the secret to `.env`, then rerun `npm run dev -- --resume <TASK_ID>`.

Examples:

- Email: set `send_email=true` and add whatever provider credentials the generated capability asks for.
- Supabase later: set/create a relevant permission and add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- Payment: keep `payments=false` unless you intentionally want that capability.

Never commit `.env`.
