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

  const placeholderImplementation =
    process.env.FDE_AUTONOMOUS_MODE === "true" &&
    /(?:logic will go here|TODO:\s*implement|FIXME:\s*implement|NotImplementedError|placeholder implementation|implement later)/i.test(
      command,
    );

  if (placeholderImplementation) {
    throw new Error(
      "Placeholder implementation rejected. " +
      "Production autonomous mode requires real implementation " +
      "and executable verification."
    );
  }

  // Pi must be integrated through its public SDK factory.
  // Direct AgentSession construction caused a repeated dependency-internal loop.
  const forbiddenDirectPiConstruction =
    /new\s+AgentSession\s*\(/.test(command) ||
    /import\s*\{[^}]*\bAgentSession\b[^}]*\}\s*from\s*['"]@earendil-works\/pi-coding-agent['"]/.test(command);

  if (forbiddenDirectPiConstruction) {
    throw new Error(
      "Direct Pi AgentSession construction is forbidden. " +
      "Use createAgentSession(...) with SessionManager.inMemory(...) " +
      "from @earendil-works/pi-coding-agent."
    );
  }

  const mutatesDependencyInternals =
    command.includes("node_modules/") &&
    /(?:sed\s+-i|perl\s+-pi|rm\s+-|cat\s+.*>|echo\s+.*>|printf\s+.*>|cp\s+|mv\s+)/i.test(command);

  if (mutatesDependencyInternals) {
    throw new Error(
      "Direct mutation of node_modules is forbidden. " +
      "Use the dependency's documented public API, change application code, " +
      "or reinstall/change the dependency version."
    );
  }

  const result = await runCommand(
    "/bin/bash",
    ["-lc", command],
    {
      cwd: TARGET_DIR,
      timeoutMs: 300_000,
      permission: "shell_access",
    },
  );

  const applicationFailure =
    /(?:TypeError|ReferenceError|SyntaxError|RangeError|Unhandled|Failed to construct session|ERR_[A-Z_]+|npm ERR!)/i.test(
      result.stderr ?? ""
    );

  if (result.code !== 0 || applicationFailure) {
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
