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

- A result containing "success": true is successful even
  when stdout is empty.

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
