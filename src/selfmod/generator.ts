import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { GeneratedCapabilitySchema, type PlannerDecision } from "../types.js";
import { createModel } from "../llm/model.js";
import { logger } from "../logging/logger.js";

const SYSTEM = `You generate one reusable TypeScript capability for a local autonomous agent.
Return source code and Vitest test code as structured fields.

MANDATORY SOURCE CONTRACT:
- Export: async function run(input: unknown): Promise<unknown>
- The source lives under src/capabilities/generated/<name>.ts
- The test lives under tests/generated.<name>.test.ts
- Tests must import the source using ../src/capabilities/generated/<name>.js
- Validate inputs inside the capability when practical.
- Do not read secrets except from process.env.
- Never hardcode secrets.
- Do not modify .env.
- You MAY import existing primitives:
  ../../primitives/browser.js -> browserRead(url)
  ../../primitives/shell.js -> runCommand(command,args,options)
- Prefer standard Node APIs or already-installed dependencies.
- If an extra npm package is truly needed, list it in npmPackages. Do not run npm install from generated code.
- Make tests deterministic. Mock external network/service behavior when possible.
- For a real external action, tests should validate logic without actually sending money/email/deleting data.
- Do not wrap code in Markdown fences.`;

export async function generateCapability(decision: PlannerDecision, priorFailure?: string) {
  const model = createModel().withStructuredOutput(GeneratedCapabilitySchema);
  logger.info({ capability: decision.capabilityName }, "[codegen] generating capability");
  return model.invoke([
    new SystemMessage(SYSTEM),
    new HumanMessage(JSON.stringify({
      requestedName: decision.capabilityName,
      requestedDescription: decision.capabilityDescription,
      requiredPermissions: decision.requiredPermissions,
      requiredEnv: decision.requiredEnv,
      expectedResult: decision.expectedResult,
      priorFailure,
    })),
  ]);
}
