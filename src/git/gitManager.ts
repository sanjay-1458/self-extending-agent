import { env } from "../config.js";
import { logger } from "../logging/logger.js";
import { runCommand } from "../primitives/shell.js";
import { checkAccess } from "../primitives/permissions.js";

async function git(args: string[], permission = "git_commit") {
  return runCommand("git", args, { cwd: env.rootDir, permission });
}

export async function ensureGitRepository() {
  const commitAccess = checkAccess({ task: "initialize git", resumeStep: "git_init", requiredPermissions: ["git_commit"] });
  if (!commitAccess.ok) throw new Error(`ACCESS_REQUIRED:${JSON.stringify(commitAccess.blocker)}`);

  const inside = await git(["rev-parse", "--is-inside-work-tree"]);
  if (inside.code !== 0) {
    logger.info("[git] initializing repository");
    const init = await git(["init"]);
    if (init.code !== 0) throw new Error(`GIT_INIT_FAILED:${init.stderr}`);
  }

  await git(["branch", "-M", env.gitBranch]);

  const remotes = await git(["remote"]);
  const remoteNames = remotes.stdout.split(/\s+/).filter(Boolean);
  if (!remoteNames.includes(env.gitRemote)) {
    if (!env.githubRepoUrl) {
      throw new Error(`ACCESS_REQUIRED:${JSON.stringify({
        status: "BLOCKED_ON_ACCESS",
        task: "configure git remote",
        requiredSecret: "GITHUB_REPO_URL",
        reason: "No Git remote exists and GITHUB_REPO_URL is empty.",
        resumeStep: "configure_git_remote",
      })}`);
    }
    logger.info({ remote: env.gitRemote, repo: env.githubRepoUrl }, "[git] adding remote");
    const added = await git(["remote", "add", env.gitRemote, env.githubRepoUrl]);
    if (added.code !== 0) throw new Error(`GIT_REMOTE_ADD_FAILED:${added.stderr}`);
  }
}

export async function commitValidatedChange(message: string): Promise<string | null> {
  const access = checkAccess({ task: "git commit", resumeStep: "git_commit", requiredPermissions: ["git_commit"] });
  if (!access.ok) throw new Error(`ACCESS_REQUIRED:${JSON.stringify(access.blocker)}`);

  await ensureGitRepository();
  await git(["add", "-A"]);
  const status = await git(["status", "--porcelain"]);
  if (!status.stdout.trim()) {
    logger.info("[git] no changes to commit");
    return null;
  }

  const commit = await git(["commit", "-m", message]);
  if (commit.code !== 0) {
    if (/identity unknown|user\.email|user\.name/i.test(commit.stderr)) {
      throw new Error(`ACCESS_REQUIRED:${JSON.stringify({
        status: "BLOCKED_ON_ACCESS",
        task: "git commit",
        reason: "Git user.name/user.email are not configured. Configure them locally, then resume.",
        resumeStep: "git_commit",
      })}`);
    }
    throw new Error(`GIT_COMMIT_FAILED:${commit.stderr}`);
  }

  const hash = await git(["rev-parse", "HEAD"]);
  const commitHash = hash.stdout.trim();
  logger.info({ commitHash, message }, "[git] committed");
  return commitHash;
}

export async function pushIfAllowed() {
  const access = checkAccess({ task: "git push", resumeStep: "git_push", requiredPermissions: ["git_push"] });
  if (!access.ok) return { pushed: false, blocker: access.blocker } as const;

  await ensureGitRepository();
  const result = await git(["push", "-u", env.gitRemote, env.gitBranch], "git_push");
  if (result.code !== 0) {
    if (/authentication|permission denied|could not read username|repository not found|publickey/i.test(result.stderr)) {
      throw new Error(`ACCESS_REQUIRED:${JSON.stringify({
        status: "BLOCKED_ON_ACCESS",
        task: "git push",
        reason: `Git remote authentication failed: ${result.stderr.slice(-500)}`,
        resumeStep: "git_push",
      })}`);
    }
    throw new Error(`GIT_PUSH_FAILED:${result.stderr}`);
  }
  logger.info("[git] pushed");
  return { pushed: true } as const;
}

export async function bootstrapGitBaseline() {
  await ensureGitRepository();
  const head = await git(["rev-parse", "--verify", "HEAD"]);
  if (head.code === 0) return;

  logger.info("[git] creating initial baseline commit");
  await git(["add", "-A"]);
  const commit = await git(["commit", "-m", "chore: bootstrap self-extending agent"]);
  if (commit.code !== 0) {
    if (/identity unknown|user\.email|user\.name/i.test(commit.stderr)) {
      throw new Error(`ACCESS_REQUIRED:${JSON.stringify({
        status: "BLOCKED_ON_ACCESS",
        task: "initial git commit",
        reason: "Git user.name/user.email are not configured. Configure them locally, then resume.",
        resumeStep: "git_bootstrap",
      })}`);
    }
    throw new Error(`GIT_BOOTSTRAP_COMMIT_FAILED:${commit.stderr}`);
  }

  const pushAccess = checkAccess({ task: "initial git push", resumeStep: "git_bootstrap_push", requiredPermissions: ["git_push"] });
  if (pushAccess.ok) {
    await pushIfAllowed();
  }
}
