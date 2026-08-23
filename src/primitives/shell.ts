import { spawn } from "node:child_process";
import { logger } from "../logging/logger.js";
import { checkAccess } from "./permissions.js";

export type CommandResult = { code: number; stdout: string; stderr: string };

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; permission?: string } = {},
): Promise<CommandResult> {
  const access = checkAccess({
    task: `${command} ${args.join(" ")}`,
    resumeStep: "run_command",
    requiredPermissions: [options.permission ?? "execute_code"],
  });
  if (!access.ok) throw new Error(`ACCESS_REQUIRED:${JSON.stringify(access.blocker)}`);

  logger.info({ command, args, cwd: options.cwd }, "[shell] start");
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`COMMAND_TIMEOUT:${command}`));
    }, options.timeoutMs ?? 120_000);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = { code: code ?? 1, stdout, stderr };
      logger.info({ command, code, stdout: stdout.slice(-1500), stderr: stderr.slice(-1500) }, "[shell] done");
      resolve(result);
    });
  });
}
