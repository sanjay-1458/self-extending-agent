import { ChatGoogle } from "@langchain/google/node";
import { env, requireEnv } from "../config.js";
import { logger } from "../logging/logger.js";

export function createModel() {
  const apiKey = requireEnv("GOOGLE_API_KEY");
  logger.debug({ model: env.geminiModel }, "[llm] creating Gemini model");
  return new ChatGoogle({
    apiKey,
    model: env.geminiModel,
    maxRetries: 2,
  });
}
