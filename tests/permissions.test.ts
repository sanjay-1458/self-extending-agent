import { describe, expect, it } from "vitest";
import { checkAccess } from "../src/primitives/permissions.js";

describe("permission manager", () => {
  it("allows configured local filesystem permission", () => {
    const result = checkAccess({
      task: "test",
      resumeStep: "test",
      requiredPermissions: ["filesystem_read"],
    });
    expect(result.ok).toBe(true);
  });

  it("blocks a missing environment secret", () => {
    delete process.env.__AGENT_TEST_SECRET__;
    const result = checkAccess({
      task: "test",
      resumeStep: "test",
      requiredEnv: ["__AGENT_TEST_SECRET__"],
    });
    expect(result.ok).toBe(false);
  });
});
