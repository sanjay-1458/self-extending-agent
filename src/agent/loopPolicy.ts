import type {
  AgentTask,
  PlannerDecision,
} from "../types.js";

export type GuardResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

function clip(
  value: string,
  max = 2200,
): string {
  if (value.length <= max) {
    return value;
  }

  return (
    value.slice(0, max) +
    "\n...[truncated]"
  );
}

/**
 * The original production goal is huge.
 *
 * Sending the entire thing to Gemini every single turn wastes
 * tokens and makes the model re-reason about the whole project.
 *
 * Keep requirements-heavy lines while dropping verbose spacing.
 */
export function compactGoal(
  goal: string,
): string {
  if (goal.length <= 14_000) {
    return goal;
  }

  const important: string[] = [];

  for (const raw of goal.split("\n")) {
    const line = raw.trim();

    if (!line) continue;

    const isHeading =
      /^={5,}$/.test(line) ||
      /^[A-Z][A-Z0-9 _/()\-]{4,}$/.test(
        line,
      );

    const isBullet =
      /^[-*]\s+/.test(line);

    const isNumbered =
      /^\d+[.)]\s+/.test(line);

    const isApi =
      /^(GET|POST|PUT|PATCH|DELETE)\s+\//.test(
        line,
      );

    const isPath =
      line.includes(
        "/home/daytona/",
      );

    const isRequirement =
      /\b(must|required|never|do not|default|only|exact|verify|test|create|support|include|exclude|complete|completion|input|output)\b/i.test(
        line,
      );

    if (
      isHeading ||
      isBullet ||
      isNumbered ||
      isApi ||
      isPath ||
      isRequirement
    ) {
      important.push(line);
    }
  }

  const result =
    important.join("\n");

  return clip(result, 16_000);
}

export function compactObservations(
  values: string[],
): string[] {
  return values
    .slice(-8)
    .map((value) =>
      clip(value, 2200),
    );
}

export function compactFailures(
  values: string[],
): string[] {
  const recent =
    values.slice(-8);

  const seen =
    new Map<string, number>();

  const result: string[] = [];

  for (const value of recent) {
    const fingerprint =
      failureFingerprint(value);

    const count =
      (seen.get(fingerprint) ?? 0) + 1;

    seen.set(
      fingerprint,
      count,
    );

    if (count === 1) {
      result.push(
        clip(value, 1400),
      );
    } else {
      result.push(
        `[REPEATED_FAILURE x${count}] ${fingerprint}`,
      );
    }
  }

  return result;
}

function extractShellCommandFromDecision(
  decision: PlannerDecision,
): string | null {
  if (
    decision.action !==
      "USE_CAPABILITY" ||
    decision.capabilityName !==
      "shell_exec"
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      decision.inputJson ?? "{}",
    ) as Record<string, unknown>;

    if (
      typeof parsed.command ===
      "string"
    ) {
      return parsed.command.trim();
    }
  } catch {
    return null;
  }

  return null;
}

function extractShellCommandFromObservation(
  observation: string,
): string | null {
  const marker =
    "shell_exec => ";

  const index =
    observation.indexOf(marker);

  if (index < 0) {
    return null;
  }

  const raw = observation
    .slice(index + marker.length)
    .trim();

  try {
    const parsed =
      JSON.parse(raw) as Record<
        string,
        unknown
      >;

    if (
      typeof parsed.command ===
      "string"
    ) {
      return parsed.command.trim();
    }
  } catch {
    return null;
  }

  return null;
}

function extractShellCommandFromFailure(
  failure: string,
): string | null {
  const line = failure
    .split("\n")
    .find((value) =>
      value.startsWith(
        "WORK_PACKET_COMMAND_JSON:",
      ),
    );

  if (!line) {
    return null;
  }

  const raw = line.slice(
    "WORK_PACKET_COMMAND_JSON:".length,
  );

  try {
    const parsed = JSON.parse(raw);

    return typeof parsed === "string"
      ? parsed.trim()
      : null;
  } catch {
    return null;
  }
}

function commandKey(
  command: string,
): string {
  const compact = command
    .replace(/\s+/g, " ")
    .trim();

  const heredocWrite =
    compact.match(
      /cat\s+<<\S+\s*>\s*([^\s;&]+)/i,
    );

  if (heredocWrite?.[1]) {
    return (
      "write:" +
      heredocWrite[1]
    );
  }

  const redirectWrite =
    compact.match(
      /(?:echo|printf)\b.+?>\s*([^\s;&]+)/i,
    );

  if (redirectWrite?.[1]) {
    return (
      "write:" +
      redirectWrite[1]
    );
  }

  if (
    /^mkdir\b/i.test(compact)
  ) {
    return (
      "mkdir:" +
      compact.slice(0, 350)
    );
  }

  if (
    /\b(?:npm|pnpm|yarn)\s+install\b/i.test(
      compact,
    )
  ) {
    return (
      "node-install:" +
      compact.slice(0, 350)
    );
  }

  if (
    /\bpip(?:3)?\s+install\b/i.test(
      compact,
    )
  ) {
    return (
      "python-install:" +
      compact.slice(0, 350)
    );
  }

  if (
    /\b(?:pytest|vitest|npm\s+test|npm\s+run\s+test|tsc|typecheck)\b/i.test(
      compact,
    )
  ) {
    return (
      "test:" +
      compact.slice(0, 350)
    );
  }

  if (
    /^(?:ls|find|grep|head|tail|cat)\b/i.test(
      compact,
    )
  ) {
    return (
      "inspect:" +
      compact.slice(0, 350)
    );
  }

  return compact.slice(0, 450);
}

function isStandaloneInspection(
  command: string,
): boolean {
  const compact =
    command.trim();

  if (
    !/^(?:ls|find|grep|head|tail|cat)\b/i.test(
      compact,
    )
  ) {
    return false;
  }

  const hasMutation =
    /\b(?:mkdir|touch|rm|mv|cp|npm\s+install|pip\s+install|git\s+(?:add|commit)|alembic|pytest|vitest)\b/i.test(
      compact,
    ) ||
    />\s*[^\s]+/.test(compact);

  return !hasMutation;
}

function isTrivialScaffold(
  command: string,
): boolean {
  const compact = command
    .replace(/\s+/g, " ")
    .trim();

  return (
    /^mkdir\s+-p\s+[^;&]+$/i.test(
      compact,
    ) ||
    /^touch\s+[^;&]+$/i.test(
      compact,
    )
  );
}

function containsPlaceholderImplementation(
  command: string,
): boolean {
  return /(?:logic will go here|TODO:\s*implement|FIXME:\s*implement|NotImplementedError|placeholder implementation|implement later)/i.test(
    command,
  );
}

/**
 * Runtime-level loop protection.
 *
 * The model cannot override this with better wording.
 */
export function guardDecision(
  task: AgentTask,
  decision: PlannerDecision,
): GuardResult {
  const command =
    extractShellCommandFromDecision(
      decision,
    );

  if (!command) {
    return { ok: true };
  }

  if (
    process.env.FDE_AUTONOMOUS_MODE === "true"
  ) {
    const summary =
      decision.reasoningSummary ?? "";

    const vagueReverification =
      /(?:verify|confirm|check|ensure).{0,40}(?:again|once more|foundation|integrity|still works|solid)/i.test(
        summary,
      );

    if (vagueReverification) {
      return {
        ok: false,
        reason:
          "REVERIFICATION_CHURN_REJECTED: Previously successful work must not be rechecked merely for confidence. Move to the current unmet acceptance requirement unless a new failure specifically requires regression testing.",
      };
    }
  }

  if (
    process.env
      .FDE_AUTONOMOUS_MODE ===
      "true" &&
    containsPlaceholderImplementation(
      command,
    )
  ) {
    return {
      ok: false,
      reason:
        "PLACEHOLDER_REJECTED: Production autonomous mode forbids placeholder implementations. Implement the real behavior and its test in the same work packet.",
    };
  }

  if (
    isTrivialScaffold(command)
  ) {
    return {
      ok: false,
      reason:
        "MICRO_STEP_REJECTED: Do not spend a planner turn only on mkdir/touch. Batch scaffolding, implementation, dependency changes, and verification into one meaningful work packet.",
    };
  }

  const successfulCommands =
    task.observations
      .slice(-12)
      .map(
        extractShellCommandFromObservation,
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      );

  const failedCommands =
    task.failedAttempts
      .slice(-12)
      .map(
        extractShellCommandFromFailure,
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      );

  const recentCommands = [
    ...successfulCommands,
    ...failedCommands,
  ];

  const proposedKey =
    commandKey(command);

  const recentKeys =
    recentCommands.map(commandKey);

  const sameOperationCount =
    recentKeys.filter(
      (key) =>
        key === proposedKey,
    ).length;

  // After two equivalent recent attempts, force a strategy change.
  if (
    sameOperationCount >= 2
  ) {
    return {
      ok: false,
      reason:
        `LOOP_BREAKER: Operation family '${proposedKey}' has already been attempted ${sameOperationCount} times recently. Abandon that strategy and choose a structurally different approach.`,
    };
  }

  if (
    isStandaloneInspection(command)
  ) {
    const recentInspectCount =
      recentCommands
        .slice(-2)
        .filter(
          isStandaloneInspection,
        ).length;

    if (
      recentInspectCount >= 2
    ) {
      return {
        ok: false,
        reason:
          "INSPECTION_LOOP_BREAKER: Two consecutive read-only inspection actions already occurred. Do not spend another planner call inspecting. Use the information already gathered to implement/repair and verify.",
      };
    }
  }

  return { ok: true };
}

function failureFingerprint(
  failure: string,
): string {
  const lines = failure
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const meaningful =
    lines.filter((line) =>
      /^(?:TypeError|ReferenceError|SyntaxError|RangeError|KeyError|ValueError|ImportError|ModuleNotFoundError|AssertionError|Error):/i.test(
        line,
      ),
    );

  const selected =
    meaningful.at(-1) ??
    lines.at(-1) ??
    "unknown failure";

  return selected
    .replace(
      /\/home\/daytona\/[^\s:)]+/g,
      "<PATH>",
    )
    .replace(
      /line \d+/gi,
      "line <N>",
    )
    .replace(
      /\b\d{4,}\b/g,
      "<N>",
    )
    .slice(0, 500);
}

export function summarizeFailurePatterns(
  failures: string[],
): Array<{
  fingerprint: string;
  count: number;
}> {
  const counts =
    new Map<string, number>();

  for (
    const failure of failures.slice(-12)
  ) {
    const fingerprint =
      failureFingerprint(failure);

    counts.set(
      fingerprint,
      (counts.get(fingerprint) ?? 0) + 1,
    );
  }

  return [...counts.entries()]
    .map(
      ([fingerprint, count]) => ({
        fingerprint,
        count,
      }),
    )
    .filter(
      ({ count }) => count >= 2,
    )
    .sort(
      (a, b) =>
        b.count - a.count,
    );
}
