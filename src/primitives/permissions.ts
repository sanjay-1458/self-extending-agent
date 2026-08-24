import { loadPermissions } from "../config.js";
import type { AccessRequest } from "../types.js";

function looksLikeRealSecret(name: string): boolean {
  return /(API_KEY|TOKEN|SECRET|PASSWORD|OAUTH|CREDENTIAL)/i.test(name);
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
      // Explicit false always wins.
      // Unknown permission aliases are allowed in autonomous FDE mode.
      if (permissions[permission] === false) {
        return {
          ok: false,
          blocker: {
            status: "BLOCKED_ON_ACCESS",
            task: args.task,
            requiredPermission: permission,
            reason: `Permission '${permission}' is explicitly disabled in config/permissions.json`,
            resumeStep: args.resumeStep,
          },
        };
      }
      continue;
    }

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

  for (const name of args.requiredEnv ?? []) {
    if (process.env[name]) continue;

    // During the autonomous FDE build, only genuine credentials
    // should stop for human intervention.
    //
    // Missing paths, ports, NODE_PATH, DATABASE_URL, etc. are normal
    // engineering/configuration problems and should be solved by the agent.
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
