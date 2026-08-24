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

it("rejects direct Pi AgentSession construction", async () => {
  await expect(
    run({
      command: `cat > /tmp/example.js <<'JS'
import { AgentSession } from '@earendil-works/pi-coding-agent';
const session = new AgentSession({});
JS`,
    }),
  ).rejects.toThrow(/createAgentSession/);
});

it("rejects unquoted heredocs", async () => {
  await expect(
    run({
      command: [
        "cat <<EOF > unsafe.md",
        "# Example",
        "`echo SHOULD_NOT_EXECUTE`",
        "EOF",
      ].join("\n"),
    }),
  ).rejects.toThrow(/UNSAFE_HEREDOC_REJECTED/);
});

it("allows quoted literal heredocs", async () => {
  const result = await run({
    command: [
      "cat <<'EOF' > /tmp/safe-heredoc-test.md",
      "# Example",
      "`echo SHOULD_NOT_EXECUTE`",
      "EOF",
      "grep -F 'SHOULD_NOT_EXECUTE' /tmp/safe-heredoc-test.md",
    ].join("\n"),
  });

  expect(result).toBeTruthy();
});
