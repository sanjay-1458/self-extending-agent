import type { AccessRequest } from "../types.js";

export function parseAccessError(error: unknown): AccessRequest | null {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = "ACCESS_REQUIRED:";
  const index = message.indexOf(prefix);
  if (index < 0) return null;
  try {
    return JSON.parse(message.slice(index + prefix.length)) as AccessRequest;
  } catch {
    return {
      status: "BLOCKED_ON_ACCESS",
      task: "unknown external access",
      reason: message,
      resumeStep: "unknown",
    };
  }
}
