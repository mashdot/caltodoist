export interface RetryOptions {
  /** Maximum number of attempts (including the first). Defaults to 3. */
  retries?: number;
  /** Base delay in milliseconds before the first retry. Defaults to 200ms. */
  baseDelayMs?: number;
  /** Label used in log messages to identify the operation. */
  label?: string;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn`, retrying on failure with exponential backoff.
 *
 * External calls (Todoist API, Netlify Blobs) can fail transiently. Wrapping
 * them here means a single network blip or 5xx doesn't immediately bubble up as
 * a 500 to Cal.com. The final error is re-thrown once retries are exhausted so
 * callers can still surface genuine failures.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const label = options.label ?? 'operation';

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const wait = baseDelayMs * 2 ** (attempt - 1);
        console.warn(
          `${label} failed (attempt ${attempt}/${retries}), retrying in ${wait}ms:`,
          error instanceof Error ? error.message : error
        );
        await delay(wait);
      }
    }
  }

  console.error(`${label} failed after ${retries} attempts`);
  throw lastError;
}
