import { randomUUID } from "node:crypto";
import type { AgentTask, Capability } from "../types.js";
import { chooseNextAction } from "../llm/planner.js";
import { listCapabilities, loadCapability, saveTask, appendEvent } from "../persistence/store.js";
import { createAndValidateCapability, executeCapability } from "../selfmod/capabilityManager.js";
import { logger, safeError } from "../logging/logger.js";
import { parseAccessError } from "./errors.js";

export function newTask(goal: string): AgentTask {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    originalGoal: goal,
    status: "RUNNING",
    plan: [],
    currentStep: null,
    completedSteps: [],
    createdCapabilities: [],
    observations: [],
    failedAttempts: [],
    createdAt: now,
    updatedAt: now,
  };
}

function resultText(value: unknown) {
  try { return JSON.stringify(value).slice(0, 10_000); }
  catch { return String(value).slice(0, 10_000); }
}

export async function runAgent(task: AgentTask, maxTurns = Math.max(30, Number.parseInt(process.env.AGENT_MAX_TURNS ?? "250", 10) || 250)): Promise<AgentTask> {
  task.status = "RUNNING";
  task.blocker = undefined;
  await saveTask(task);

  for (let turn = 1; turn <= maxTurns; turn++) {
    logger.info({ taskId: task.id, turn, goal: task.originalGoal }, "[agent] turn start");
    await appendEvent(task.id, { type: "TURN_START", turn });

    try {
      const capabilities = await listCapabilities();
      const decision = await chooseNextAction(task, capabilities);
      task.currentStep = `${decision.action}:${decision.capabilityName ?? ""}`;
      await saveTask(task);

      if (decision.action === "COMPLETE") {
      if (process.env.FDE_AUTONOMOUS_MODE === "true") {
        const lastObservation =
          task.observations[task.observations.length - 1] ?? "";

        if (!lastObservation.includes("FDE_ACCEPTANCE_OK")) {
          const message =
            "Completion rejected by runtime: FDE production tasks may " +
            "only COMPLETE immediately after the deterministic acceptance " +
            "checker returns FDE_ACCEPTANCE_OK. Run " +
            "/home/daytona/workspace/self-extending-agent/workspace/" +
            "fde-acceptance.sh with shell_exec, repair every failure, " +
            "and rerun it until it passes.";

          task.failedAttempts.push(message);

          logger.warn(
            {
              taskId: task.id,
            },
            "[agent] rejected premature COMPLETE",
          );

          await saveTask(task);
          continue;
        }
      }

        task.status = "COMPLETED";
        task.currentStep = null;
        task.observations.push(`COMPLETED: ${decision.completionMessage ?? "Goal completed"}`);
        await saveTask(task);
        logger.info({ taskId: task.id }, "[agent] goal completed");
        return task;
      }

      let capability: Capability | null = null;
      if (decision.action === "USE_CAPABILITY") {
        if (!decision.capabilityName) throw new Error("CODE_ERROR:Planner omitted capabilityName");
        capability = await loadCapability(decision.capabilityName);
        if (!capability) {
          task.failedAttempts.push(`Planner selected missing capability '${decision.capabilityName}'.`);
          await saveTask(task);
          continue;
        }
      } else {
        capability = await createAndValidateCapability(decision);
        task.createdCapabilities.push(capability.name);
        if (capability.lastCommit) task.lastCommit = capability.lastCommit;
        await saveTask(task);
      }

      const result = await executeCapability(capability, decision.inputJson);
      const observation = `${capability.name} => ${resultText(result)}`;
      task.observations.push(observation);
      task.completedSteps.push(decision.reasoningSummary);
      task.currentStep = null;
      await appendEvent(task.id, { type: "CAPABILITY_RESULT", capability: capability.name, result });
      await saveTask(task);
    } catch (error) {
      const blocker = parseAccessError(error);
      if (blocker) {
        task.status = "BLOCKED_ON_ACCESS";
        task.blocker = blocker;
        task.currentStep = blocker.resumeStep;
        await appendEvent(task.id, { type: "ACCESS_BLOCKER", blocker });
        await saveTask(task);
        logger.warn({ taskId: task.id, blocker }, "[agent] blocked only because access/secret is missing");
        return task;
      }

      const message = error instanceof Error ? error.message : String(error);
      task.failedAttempts.push(message.slice(0, 8_000));
      await appendEvent(task.id, { type: "ERROR", error: safeError(error) });
      await saveTask(task);
      logger.error({ taskId: task.id, error: safeError(error) }, "[agent] code/runtime failure; continuing autonomous loop");
    }
  }

  task.status = "FAILED";
  task.failedAttempts.push(`Reached maxTurns=${maxTurns}`);
  await saveTask(task);
  return task;
}
