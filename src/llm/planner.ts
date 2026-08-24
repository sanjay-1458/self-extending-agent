import {
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

import {
  PlannerDecisionSchema,
  type AgentTask,
  type Capability,
} from "../types.js";

import { createModel } from "./model.js";
import { invokeWithQuotaBackoff } from "./retry.js";
import { logger } from "../logging/logger.js";

const SYSTEM = `
You are the planner inside a persistent autonomous
self-extending software agent.

Choose exactly ONE next action that materially moves
the original user goal toward completion.

ACTIONS:

USE_CAPABILITY
CREATE_CAPABILITY
COMPLETE

RULES:

- Prefer an existing capability whenever it can do
  the required work.

- For shell_exec, batch logically related deterministic operations into one
  command when safe. For example, scaffold a component and install its
  dependencies in one meaningful milestone rather than spending one planner
  turn on every mkdir/touch/grep.

- Do not repeatedly inspect one dependency implementation line-by-line.
  Inspect package documentation, exports, examples, or type declarations in
  a small number of targeted commands and then implement using the public API.

- If shell_exec exists, reuse shell_exec for ordinary
  target-project operations such as:
  creating directories,
  creating/scaffolding projects,
  running npm/pip,
  running scripts,
  running tests,
  starting services,
  inspecting files,
  Git commands inside the target project.

- Do NOT create separate trivial wrappers for operations
  shell_exec can already perform.

- Create a new capability only when it provides a real
  reusable abstraction that existing capabilities cannot.

- A shell result with "success": true means only that the shell process
  exited with code 0. It does NOT prove the application operation worked.
  If stderr or stdout contains an exception, stack trace, "Failed",
  "TypeError", "Error:", or equivalent application failure, treat the
  operation as FAILED.

- Never modify files inside node_modules, site-packages, installed package
  internals, system library source, or dependency distributions to work
  around an API error.

- If a dependency API attempt fails twice using substantially the same
  approach, STOP PATCHING THAT APPROACH. Switch strategy.

- When a third-party SDK API is unclear:
  1. inspect its package exports,
  2. inspect its bundled README/docs/examples/type declarations,
  3. use its documented public factory/API,
  4. change our application code accordingly.

- For @earendil-works/pi-coding-agent specifically:
  use the exported createAgentSession(...) factory for SDK sessions.
  Use SessionManager.inMemory(...) for isolated specialist sessions.
  Do NOT directly construct new AgentSession(mockConfig).
  Do NOT mock Pi internal runtime/core objects.
  Do NOT patch Pi's node_modules implementation.

- Prefer fixing our integration code over modifying a dependency.

- A result containing "success": true is successful when the intended
  application outcome is also verified.

- Do NOT repeat a successful command merely because stdout
  was empty.

- Do not repeatedly recreate directories or files that an
  observation already proves were successfully created.

- For a multi-step production goal, progress to the next
  meaningful milestone after a successful operation.

- Programming errors are NOT reasons to ask a human.

- Do not claim an external side effect succeeded unless
  observations prove it.

- requiredPermissions should contain only permissions
  genuinely needed by the capability.

- requiredEnv must contain only genuine required
  environment variables.

- Do not classify NODE_PATH, normal filesystem paths,
  ports, model names, or ordinary configuration as
  human secrets.

- inputJson MUST contain the REAL input required for the
  selected action. Never put placeholder values such as:
  "string",
  "command",
  "example",
  or "TODO".

- For shell_exec, inputJson must look like:
  {"command":"actual executable shell command"}

- COMPLETE only when the original goal and its acceptance
  conditions are genuinely verified.

Keep reasoningSummary short.
Do not output private chain-of-thought.
`;

export async function chooseNextAction(
  task: AgentTask,
  capabilities: Capability[],
) {
  const model =
    createModel().withStructuredOutput(
      PlannerDecisionSchema,
    );

  const capabilitySummary =
    capabilities.map((c) => ({
      name: c.name,
      description: c.description,
      requiredPermissions:
        c.requiredPermissions,
      requiredEnv: c.requiredEnv,
    }));

  logger.info(
    {
      taskId: task.id,
      capabilityCount: capabilities.length,
    },
    "[planner] asking Gemini for next action",
  );

  const rawDecision =
    await invokeWithQuotaBackoff(
      "planner",
      () =>
        model.invoke([
          new SystemMessage(SYSTEM),

          new HumanMessage(
            JSON.stringify({
              originalGoal:
                task.originalGoal,

              status:
                task.status,

              completedSteps:
                task.completedSteps.slice(-20),

              observations:
                task.observations.slice(-20),

              failedAttempts:
                task.failedAttempts.slice(-12),

              existingCapabilities:
                capabilitySummary,
            }),
          ),
        ]),
    );

  const decision =
    PlannerDecisionSchema.parse(
      rawDecision,
    );

  logger.info(
    {
      taskId: task.id,
      decision,
    },
    "[planner] decision",
  );

  return decision;
}
