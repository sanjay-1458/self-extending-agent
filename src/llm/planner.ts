import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { PlannerDecisionSchema, type AgentTask, type Capability } from "../types.js";
import { createModel } from "./model.js";
import { logger } from "../logging/logger.js";

const SYSTEM = `You are the planner inside a persistent autonomous self-extending software agent.
Your job is to choose exactly ONE next action that moves the user's original goal toward completion.

Rules:
- Prefer reusing an existing capability when one can do the job.
- If no capability exists, choose CREATE_CAPABILITY and describe a small reusable capability.
- A programming error is NOT a reason to ask a human; code generation/testing handles it.
- Do not claim external side effects succeeded unless observations prove it.
- requiredPermissions must use permission names that should be checked before execution.
- requiredEnv must list exact environment variable names needed for external credentials.
- COMPLETE only when observations show the original goal is actually done.
- inputJson must be valid JSON text.
- Keep reasoningSummary short; do not output private chain-of-thought.`;

export async function chooseNextAction(task: AgentTask, capabilities: Capability[]) {
  const model = createModel().withStructuredOutput(PlannerDecisionSchema);
  const capabilitySummary = capabilities.map((c) => ({
    name: c.name,
    description: c.description,
    requiredPermissions: c.requiredPermissions,
    requiredEnv: c.requiredEnv,
  }));

  logger.info({ taskId: task.id, capabilityCount: capabilities.length }, "[planner] asking Gemini for next action");
  const decision = await model.invoke([
    new SystemMessage(SYSTEM),
    new HumanMessage(JSON.stringify({
      originalGoal: task.originalGoal,
      status: task.status,
      completedSteps: task.completedSteps,
      observations: task.observations.slice(-12),
      failedAttempts: task.failedAttempts.slice(-8),
      existingCapabilities: capabilitySummary,
    })),
  ]);
  logger.info({ taskId: task.id, decision }, "[planner] decision");
  return decision;
}
