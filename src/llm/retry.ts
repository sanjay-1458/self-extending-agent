import { logger } from "../logging/logger.js";

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

function isRateLimit(error: unknown): boolean {
  const text = errorText(error);

  return (
    /quota exceeded/i.test(text) ||
    /rate.?limit/i.test(text) ||
    /\b429\b/.test(text) ||
    /resource_exhausted/i.test(text)
  );
}

function retryDelayMs(error: unknown, attempt: number): number {
  const text = errorText(error);

  const match = text.match(
    /retry in\s+([\d.]+)s/i,
  );

  if (match) {
    const seconds = Number(match[1]);

    if (Number.isFinite(seconds)) {
      return Math.ceil(seconds * 1000) + 2500;
    }
  }

  return Math.min(
    65_000,
    10_000 * attempt,
  );
}

export async function invokeWithQuotaBackoff<T>(
  label: string,
  operation: () => Promise<T>,
  maxAttempts = 8,
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isRateLimit(error) ||
        attempt === maxAttempts
      ) {
        throw error;
      }

      const waitMs =
        retryDelayMs(error, attempt);

      logger.warn(
        {
          label,
          attempt,
          waitMs,
        },
        "[llm] quota/rate limit reached; waiting before retry",
      );

      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitMs);
      });
    }
  }

  throw new Error(
    `LLM retry loop exhausted for ${label}`,
  );
}
