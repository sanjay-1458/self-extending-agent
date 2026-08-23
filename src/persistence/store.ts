import { redis } from "./redis.js";
import { AgentTaskSchema, CapabilitySchema, type AgentTask, type Capability } from "../types.js";
import { logger } from "../logging/logger.js";

const taskKey = (id: string) => `agent:task:${id}`;
const capabilityKey = (name: string) => `agent:capability:${name}`;
const CAPABILITY_SET = "agent:capabilities";
const ACTIVE_TASK_SET = "agent:active_tasks";

export async function saveTask(task: AgentTask) {
  task.updatedAt = new Date().toISOString();
  await redis.set(taskKey(task.id), JSON.stringify(task));
  if (task.status === "COMPLETED" || task.status === "FAILED") {
    await redis.sRem(ACTIVE_TASK_SET, task.id);
  } else {
    await redis.sAdd(ACTIVE_TASK_SET, task.id);
  }
  logger.debug({ taskId: task.id, status: task.status }, "[state] task persisted");
}

export async function loadTask(id: string): Promise<AgentTask | null> {
  const raw = await redis.get(taskKey(id));
  if (!raw) return null;
  return AgentTaskSchema.parse(JSON.parse(raw));
}

export async function listActiveTaskIds() {
  return redis.sMembers(ACTIVE_TASK_SET);
}

export async function saveCapability(capability: Capability) {
  await redis.set(capabilityKey(capability.name), JSON.stringify(capability));
  await redis.sAdd(CAPABILITY_SET, capability.name);
  logger.info({ capability: capability.name }, "[registry] capability saved");
}

export async function loadCapability(name: string): Promise<Capability | null> {
  const raw = await redis.get(capabilityKey(name));
  return raw ? CapabilitySchema.parse(JSON.parse(raw)) : null;
}

export async function listCapabilities(): Promise<Capability[]> {
  const names = await redis.sMembers(CAPABILITY_SET);
  const items = await Promise.all(names.map(loadCapability));
  return items.filter((x): x is Capability => Boolean(x));
}

export async function appendEvent(taskId: string, event: object) {
  await redis.rPush(`agent:events:${taskId}`, JSON.stringify({ at: new Date().toISOString(), ...event }));
}
