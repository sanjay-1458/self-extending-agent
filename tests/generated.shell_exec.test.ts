import { describe, expect, it } from "vitest";
import { run } from "../src/capabilities/generated/shell_exec.js";

describe("shell_exec", () => {
  it("executes commands and returns explicit success", async () => {
    const result = await run({
      command: "printf 'SHELL_OK'",
    }) as {
      success: boolean;
      exitCode: number;
      stdout: string;
      cwd: string;
    };

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("SHELL_OK");
    expect(result.cwd).toBe(
      "/home/daytona/workspace/lenny-growth-assistant",
    );
  });

  it("rejects invalid input", async () => {
    await expect(run({})).rejects.toThrow(
      "non-empty command",
    );
  });
});
