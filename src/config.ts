import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

export type PermissionMap = Record<string, boolean>;

const rootDir = process.cwd();
const permissionsPath = path.join(rootDir, "config", "permissions.json");

export function loadPermissions(): PermissionMap {
  return JSON.parse(fs.readFileSync(permissionsPath, "utf8")) as PermissionMap;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

export const env = {
  rootDir,
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.7-flash",
  gitRemote: process.env.GIT_REMOTE ?? "origin",
  gitBranch: process.env.GIT_BRANCH ?? "main",
  githubRepoUrl: process.env.GITHUB_REPO_URL ?? "",
  logLevel: process.env.LOG_LEVEL ?? "debug",
  playwrightHeadless: (process.env.PLAYWRIGHT_HEADLESS ?? "true") !== "false",
};
