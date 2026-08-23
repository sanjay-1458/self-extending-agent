import { connectRedis, redis } from "./persistence/redis.js";
import { loadTask, saveTask } from "./persistence/store.js";
import { newTask, runAgent } from "./agent/loop.js";
import { logger, safeError } from "./logging/logger.js";
import { closeBrowser } from "./primitives/browser.js";
import { bootstrapGitBaseline } from "./git/gitManager.js";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  logger.info("============================================================");
  logger.info("[boot] self-extending agent starting");
  logger.info({ cwd: process.cwd(), node: process.version }, "[boot] environment");

  await connectRedis();

  // Git setup is attempted on startup because you asked for the agent to set
  // its own upstream from GITHUB_REPO_URL on the first run.
  try {
    await bootstrapGitBaseline();
  } catch (error) {
    logger.warn({ error: safeError(error) }, "[boot] git setup not ready; task loop can surface it as access blocker later");
  }

  const resumeId = arg("--resume");
  const goal = arg("--goal");

  let task;
  if (resumeId) {
    task = await loadTask(resumeId);
    if (!task) throw new Error(`Task '${resumeId}' not found in Redis`);
    logger.info({ taskId: task.id, previousStatus: task.status }, "[boot] resuming task");
  } else {
    if (!goal) {
      console.error('Usage: npm run dev -- --goal "your goal"');
      console.error('   or: npm run dev -- --resume "TASK_ID"');
      process.exitCode = 1;
      return;
    }
    task = newTask(goal);
    await saveTask(task);
    logger.info({ taskId: task.id, goal }, "[boot] new task created");
  }

  const finalTask = await runAgent(task);
  console.log("\n================ FINAL TASK STATE ================");
  console.log(JSON.stringify(finalTask, null, 2));

  if (finalTask.status === "BLOCKED_ON_ACCESS") {
    console.log("\nAdd the missing permission/secret, then resume with:");
    console.log(`npm run dev -- --resume "${finalTask.id}"`);
  }
}

main()
  .catch((error) => {
    logger.fatal({ error: safeError(error) }, "[fatal] agent crashed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBrowser().catch(() => undefined);
    if (redis.isOpen) await redis.quit().catch(() => undefined);
  });
