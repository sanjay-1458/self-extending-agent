import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { env } from "../config.js";
import { logger } from "../logging/logger.js";
import { runCommand } from "../primitives/shell.js";
import { checkAccess } from "../primitives/permissions.js";
import { generateCapability } from "./generator.js";
import { saveCapability } from "../persistence/store.js";
import type { Capability, PlannerDecision } from "../types.js";
import { commitValidatedChange, pushIfAllowed } from "../git/gitManager.js";

const generatedDir = path.join(env.rootDir, "src", "capabilities", "generated");
const testsDir = path.join(env.rootDir, "tests");

function sanitizeName(name: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`INVALID_CAPABILITY_NAME:${name}`);
  return name;
}

export async function createAndValidateCapability(decision: PlannerDecision, maxAttempts = 4): Promise<Capability> {
  const modifyAccess = checkAccess({
    task: `create capability ${decision.capabilityName}`,
    resumeStep: "create_capability",
    requiredPermissions: ["modify_own_code", "filesystem_write", "execute_code"],
  });
  if (!modifyAccess.ok) throw new Error(`ACCESS_REQUIRED:${JSON.stringify(modifyAccess.blocker)}`);

  let priorFailure = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info({ name: decision.capabilityName, attempt }, "[codegen] attempt");
    const generated = await generateCapability(decision, priorFailure || undefined);
    const name = sanitizeName(generated.name);
    const sourceLocation = path.join("src", "capabilities", "generated", `${name}.ts`);
    const testLocation = path.join("tests", `generated.${name}.test.ts`);
    const absSource = path.join(env.rootDir, sourceLocation);
    const absTest = path.join(env.rootDir, testLocation);

    await fs.mkdir(generatedDir, { recursive: true });
    await fs.mkdir(testsDir, { recursive: true });
    await fs.writeFile(absSource, generated.sourceCode, "utf8");
    await fs.writeFile(absTest, generated.testCode, "utf8");
    logger.info({ sourceLocation, testLocation, npmPackages: generated.npmPackages }, "[codegen] files written");

    if (generated.npmPackages.length > 0) {
      const installAccess = checkAccess({
        task: `install packages for ${name}`,
        resumeStep: `install_packages:${name}`,
        requiredPermissions: ["install_packages", "internet"],
      });
      if (!installAccess.ok) throw new Error(`ACCESS_REQUIRED:${JSON.stringify(installAccess.blocker)}`);

      logger.info({ packages: generated.npmPackages }, "[codegen] installing requested packages");
      const install = await runCommand("npm", ["install", ...generated.npmPackages], {
        cwd: env.rootDir,
        timeoutMs: 180_000,
      });
      if (install.code !== 0) {
        priorFailure = `npm install failed for ${generated.npmPackages.join(", ")}\n${install.stderr}`.slice(-12_000);
        logger.warn({ name, priorFailure }, "[codegen] dependency installation failed; retrying design");
        continue;
      }
    }

    const typecheck = await runCommand("npm", ["run", "typecheck"], { cwd: env.rootDir, timeoutMs: 120_000 });
    const test = typecheck.code === 0
      ? await runCommand("npx", ["vitest", "run", testLocation], { cwd: env.rootDir, timeoutMs: 120_000 })
      : { code: 1, stdout: "", stderr: "typecheck failed" };

    if (typecheck.code === 0 && test.code === 0) {
      logger.info({ name }, "[codegen] capability validated");
      const capability: Capability = {
        id: randomUUID(),
        name,
        description: generated.description,
        requiredPermissions: generated.requiredPermissions,
        requiredEnv: generated.requiredEnv,
        sourceLocation,
        testLocation,
        createdAt: new Date().toISOString(),
        version: 1,
      };

      const commit = await commitValidatedChange(`agent: add ${name} capability`);
      if (commit) capability.lastCommit = commit;
      await saveCapability(capability);
      await pushIfAllowed();
      return capability;
    }

    priorFailure = [
      `Attempt ${attempt} failed.`,
      `TYPECHECK STDOUT:\n${typecheck.stdout}`,
      `TYPECHECK STDERR:\n${typecheck.stderr}`,
      `TEST STDOUT:\n${test.stdout}`,
      `TEST STDERR:\n${test.stderr}`,
    ].join("\n").slice(-12_000);
    logger.warn({ name, attempt, priorFailure }, "[codegen] validation failed; Gemini will repair");
  }

  throw new Error(`CODE_ERROR:Capability generation failed after ${maxAttempts} attempts`);
}

export async function executeCapability(capability: Capability, inputJson: string) {
  const access = checkAccess({
    task: `execute ${capability.name}`,
    resumeStep: `execute:${capability.name}`,
    requiredPermissions: capability.requiredPermissions,
    requiredEnv: capability.requiredEnv,
  });
  if (!access.ok) throw new Error(`ACCESS_REQUIRED:${JSON.stringify(access.blocker)}`);

  const abs = path.join(env.rootDir, capability.sourceLocation);
  const url = `${pathToFileURL(abs).href}?v=${Date.now()}`;
  logger.info({ capability: capability.name, source: capability.sourceLocation }, "[capability] loading");
  const module = (await import(url)) as { run?: (input: unknown) => Promise<unknown> };
  if (typeof module.run !== "function") throw new Error(`CODE_ERROR:${capability.name} does not export run()`);

  const input = JSON.parse(inputJson || "{}");
  logger.info({ capability: capability.name, input }, "[capability] executing");
  const result = await module.run(input);
  logger.info({ capability: capability.name, result }, "[capability] result");
  return result;
}
