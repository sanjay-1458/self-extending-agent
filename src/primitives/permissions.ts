import { loadPermissions } from "../config.js";
import type { AccessRequest } from "../types.js";

function looksLikeRealSecret(name: string): boolean {
  return /(API_KEY|TOKEN|SECRET|PASSWORD|OAUTH|CREDENTIAL|PRIVATE_KEY)/i.test(
    name,
  );
}

export function checkAccess(args: {
  task: string;
  resumeStep: string;
  requiredPermissions?: string[];
  requiredEnv?: string[];
}): { ok: true } | { ok: false; blocker: AccessRequest } {
  const permissions = loadPermissions();

  const autonomousMode =
    process.env.FDE_AUTONOMOUS_MODE === "true";

  for (const permission of args.requiredPermissions ?? []) {
    if (autonomousMode) {
      // Explicit denial always wins.
      if (permissions[permission] === false) {
        return {
          ok: false,
          blocker: {
            status: "BLOCKED_ON_ACCESS",
            task: args.task,
            requiredPermission: permission,
            reason:
              `Permission '${permission}' is explicitly disabled in config/permissions.json`,
            resumeStep: args.resumeStep,
          },
        };
      }

      // In FDE autonomous mode, unknown internal permission aliases
      // are allowed. This avoids stopping because the planner used a
      // semantically equivalent but previously unseen permission name.
      continue;
    }

    if (permissions[permission] !== true) {
      return {
        ok: false,
        blocker: {
          status: "BLOCKED_ON_ACCESS",
          task: args.task,
          requiredPermission: permission,
          reason:
            `Permission '${permission}' is absent or false in config/permissions.json`,
          resumeStep: args.resumeStep,
        },
      };
    }
  }

  for (const name of args.requiredEnv ?? []) {
    if (process.env[name]) {
      continue;
    }

    // Paths, ports, database URLs, NODE_PATH, model names, etc.
    // are engineering/configuration concerns, not human secrets.
    if (autonomousMode && !looksLikeRealSecret(name)) {
      continue;
    }

    return {
      ok: false,
      blocker: {
        status: "BLOCKED_ON_ACCESS",
        task: args.task,
        requiredSecret: name,
        reason: `Required external credential '${name}' is missing.`,
        resumeStep: args.resumeStep,
      },
    };
  }

  return { ok: true };
}
