import { loadPermissions } from "../config.js";
import type { AccessRequest } from "../types.js";

export function checkAccess(args: {
  task: string;
  resumeStep: string;
  requiredPermissions?: string[];
  requiredEnv?: string[];
}): { ok: true } | { ok: false; blocker: AccessRequest } {
  const permissions = loadPermissions();

  for (const permission of args.requiredPermissions ?? []) {
    if (permissions[permission] !== true) {
      return {
        ok: false,
        blocker: {
          status: "BLOCKED_ON_ACCESS",
          task: args.task,
          requiredPermission: permission,
          reason: `Permission '${permission}' is absent or false in config/permissions.json`,
          resumeStep: args.resumeStep,
        },
      };
    }
  }

  for (const secret of args.requiredEnv ?? []) {
    if (!process.env[secret]) {
      return {
        ok: false,
        blocker: {
          status: "BLOCKED_ON_ACCESS",
          task: args.task,
          requiredSecret: secret,
          reason: `Required environment variable '${secret}' is missing. Add it to .env and resume the task.`,
          resumeStep: args.resumeStep,
        },
      };
    }
  }

  return { ok: true };
}
