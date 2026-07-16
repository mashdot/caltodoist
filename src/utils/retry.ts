export interface RetryOptions {
  /** Maximum number of attempts (including the first). Defaults to 3. */
  retries?: number;
  /** Base delay in milliseconds before the first retry. Defaults to 200ms. */
  baseDelayMs?: number;
  /** Label used in log messages to identify the operation. */
  label?: string;
  /** Decides whether a failure is worth retrying. Defaults to `isTransientError`. */
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts an HTTP status code from an error, if it carries one. Covers the
 * Todoist SDK's `TodoistRequestError.httpStatusCode` and fetch-style `status`.
 */
export function getHttpStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { httpStatusCode?: unknown; status?: unknown };
  if (typeof candidate.httpStatusCode === 'number') return candidate.httpStatusCode;
  if (typeof candidate.status === 'number') return candidate.status;
  return undefined;
}

/**
 * Transient failures (network errors, timeouts, rate limits, 5xx) are worth
 * retrying; other 4xx responses are permanent and retrying only adds latency.
 * Errors without a status code are assumed transient (network-level failures).
 */
export function isTransientError(error: unknown): boolean {
  const status = getHttpStatusCode(error);
  if (status === undefined) return true;
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Runs `fn`, retrying transient failures with exponential backoff.
 *
 * External calls (Todoist API, Netlify Blobs) can fail transiently. Wrapping
 * them here means a single network blip or 5xx doesn't immediately bubble up as
 * a 500 to Cal.com. Permanent errors (e.g. 400/401/404) are re-thrown
 * immediately, and the final error is re-thrown once retries are exhausted so
 * callers can still surface genuine failures.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const label = options.label ?? 'operation';
  const isRetryable = options.isRetryable ?? isTransientError;

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) {
        console.error(
          `${label} failed with a non-retryable error:`,
          error instanceof Error ? error.message : error
        );
        throw error;
      }
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
