import {
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

import {
  GeneratedCapabilitySchema,
  type PlannerDecision,
} from "../types.js";

import { createModel } from "../llm/model.js";
import { invokeWithQuotaBackoff } from "../llm/retry.js";
import { logger } from "../logging/logger.js";

const SYSTEM = `
You generate one reusable TypeScript capability
for a persistent autonomous agent.

Return source code and Vitest test code as
structured fields.

MANDATORY SOURCE CONTRACT:

- Export:
  async function run(input: unknown): Promise<unknown>

- Source:
  src/capabilities/generated/<name>.ts

- Test:
  tests/generated.<name>.test.ts

- Tests import:
  ../src/capabilities/generated/<name>.js

- Validate inputs.

- Never hardcode secrets.

- Never modify .env.

Available primitives:

../../primitives/browser.js
  browserRead(url)

../../primitives/shell.js
  runCommand(command,args,options)

Prefer existing primitives and standard Node APIs.

Generated tests must be deterministic.

Do not wrap generated source or tests in Markdown fences.
`;

export async function generateCapability(
  decision: PlannerDecision,
  priorFailure?: string,
) {
  const model =
    createModel().withStructuredOutput(
      GeneratedCapabilitySchema,
    );

  logger.info(
    {
      capability:
        decision.capabilityName,
    },
    "[codegen] generating capability",
  );

  const rawGenerated =
    await invokeWithQuotaBackoff(
      `codegen:${decision.capabilityName ?? "unknown"}`,
      () =>
        model.invoke([
          new SystemMessage(SYSTEM),

          new HumanMessage(
            JSON.stringify({
              requestedName:
                decision.capabilityName,

              requestedDescription:
                decision.capabilityDescription,

              requiredPermissions:
                decision.requiredPermissions,

              requiredEnv:
                decision.requiredEnv,

              expectedResult:
                decision.expectedResult,

              priorFailure,
            }),
          ),
        ]),
    );

  return GeneratedCapabilitySchema.parse(
    rawGenerated,
  );
}
