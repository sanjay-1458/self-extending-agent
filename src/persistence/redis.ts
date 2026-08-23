import { createClient } from "redis";
import { env } from "../config.js";
import { logger } from "../logging/logger.js";

export const redis = createClient({
  url: env.redisUrl,
});

redis.on("error", (err) =>
  logger.error({ err }, "[redis] client error")
);

export async function connectRedis() {
  if (!redis.isOpen) {
    logger.info(
      { url: env.redisUrl },
      "[redis] connecting"
    );

    await redis.connect();

    logger.info("[redis] connected");
  }
}
