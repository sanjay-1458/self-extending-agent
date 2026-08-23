import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import { env } from "../config.js";

const logDir = path.join(env.rootDir, "logs");
fs.mkdirSync(logDir, { recursive: true });

const streams = [
  { stream: pino.transport({ target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }) },
  { stream: fs.createWriteStream(path.join(logDir, "agent.log"), { flags: "a" }) },
];

export const logger = pino({ level: env.logLevel }, pino.multistream(streams));

export function safeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}
