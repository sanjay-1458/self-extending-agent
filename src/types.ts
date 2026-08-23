import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "RUNNING",
  "BLOCKED_ON_ACCESS",
  "FAILED",
  "COMPLETED",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const StepSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(["PENDING", "RUNNING", "DONE", "FAILED"]),
  result: z.string().optional(),
});
export type AgentStep = z.infer<typeof StepSchema>;

export const AccessRequestSchema = z.object({
  status: z.literal("BLOCKED_ON_ACCESS"),
  task: z.string(),
  requiredPermission: z.string().optional(),
  requiredSecret: z.string().optional(),
  reason: z.string(),
  resumeStep: z.string(),
});
export type AccessRequest = z.infer<typeof AccessRequestSchema>;

export const CapabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  requiredPermissions: z.array(z.string()),
  requiredEnv: z.array(z.string()).default([]),
  sourceLocation: z.string(),
  testLocation: z.string(),
  createdAt: z.string(),
  version: z.number().int().positive(),
  lastCommit: z.string().optional(),
});
export type Capability = z.infer<typeof CapabilitySchema>;

export const AgentTaskSchema = z.object({
  id: z.string(),
  originalGoal: z.string(),
  status: TaskStatusSchema,
  plan: z.array(StepSchema),
  currentStep: z.string().nullable(),
  completedSteps: z.array(z.string()),
  createdCapabilities: z.array(z.string()),
  observations: z.array(z.string()),
  failedAttempts: z.array(z.string()),
  lastCommit: z.string().optional(),
  blocker: AccessRequestSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;

export const PlannerDecisionSchema = z.object({
  reasoningSummary: z.string().describe("Short, non-sensitive summary of why this next action was chosen."),
  action: z.enum(["USE_CAPABILITY", "CREATE_CAPABILITY", "COMPLETE"]),
  capabilityName: z.string().optional(),
  capabilityDescription: z.string().optional(),
  requiredPermissions: z.array(z.string()).default([]),
  requiredEnv: z.array(z.string()).default([]),
  inputJson: z.string().default("{}").describe("JSON string passed to the capability."),
  expectedResult: z.string().default(""),
  completionMessage: z.string().optional(),
});
export type PlannerDecision = z.infer<typeof PlannerDecisionSchema>;

export const GeneratedCapabilitySchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  description: z.string(),
  requiredPermissions: z.array(z.string()),
  requiredEnv: z.array(z.string()),
  npmPackages: z.array(z.string()).default([]),
  sourceCode: z.string(),
  testCode: z.string(),
});
export type GeneratedCapability = z.infer<typeof GeneratedCapabilitySchema>;
