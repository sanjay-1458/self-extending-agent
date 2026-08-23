import { describe, expect, it } from "vitest";
import { newTask } from "../src/agent/loop.js";

describe("task", () => {
  it("starts in RUNNING state", () => {
    const task = newTask("do something");
    expect(task.status).toBe("RUNNING");
    expect(task.originalGoal).toBe("do something");
  });
});
