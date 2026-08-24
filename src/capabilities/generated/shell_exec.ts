import { runCommand } from "../../primitives/shell.js";

const TARGET_DIR =
  "/home/daytona/workspace/lenny-growth-assistant";

type ShellInput = {
  command: string;
};

export async function run(input: unknown): Promise<unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    typeof (input as ShellInput).command !== "string" ||
    !(input as ShellInput).command.trim()
  ) {
    throw new Error(
      "Input must be an object with a non-empty command string.",
    );
  }

  const command = (input as ShellInput).command.trim();

  const result = await runCommand(
    "/bin/bash",
    ["-lc", command],
    {
      cwd: TARGET_DIR,
      timeoutMs: 300_000,
      permission: "shell_access",
    },
  );

  if (result.code !== 0) {
    throw new Error(
      [
        `Command failed with code ${result.code}`,
        result.stderr,
        result.stdout,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return {
    success: true,
    exitCode: result.code,
    cwd: TARGET_DIR,
    command,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
