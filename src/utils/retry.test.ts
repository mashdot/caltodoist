import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHttpStatusCode, isTransientError, withRetry } from './retry';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('recovered');

    const promise = withRetry(fn, { retries: 3, baseDelayMs: 10 });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    const promise = withRetry(fn, { retries: 3, baseDelayMs: 10 });
    // Attach the rejection assertion before advancing timers so the rejection
    // is never momentarily unhandled.
    const assertion = expect(promise).rejects.toThrow('always fails');
    await vi.runAllTimersAsync();

    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry permanent (4xx) errors', async () => {
    const notFound = Object.assign(new Error('not found'), { httpStatusCode: 404 });
    const fn = vi.fn().mockRejectedValue(notFound);

    await expect(withRetry(fn, { retries: 3, baseDelayMs: 10 })).rejects.toThrow('not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries rate limits and server errors', async () => {
    const rateLimited = Object.assign(new Error('too many requests'), { httpStatusCode: 429 });
    const fn = vi.fn().mockRejectedValueOnce(rateLimited).mockResolvedValueOnce('recovered');

    const promise = withRetry(fn, { retries: 3, baseDelayMs: 10 });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respects a custom isRetryable predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('nope'));

    const promise = withRetry(fn, { retries: 3, baseDelayMs: 10, isRetryable: () => false });
    await expect(promise).rejects.toThrow('nope');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('getHttpStatusCode', () => {
  it('reads httpStatusCode and status properties', () => {
    expect(getHttpStatusCode(Object.assign(new Error('x'), { httpStatusCode: 404 }))).toBe(404);
    expect(getHttpStatusCode(Object.assign(new Error('x'), { status: 500 }))).toBe(500);
    expect(getHttpStatusCode(new Error('x'))).toBeUndefined();
    expect(getHttpStatusCode('string error')).toBeUndefined();
  });
});

describe('isTransientError', () => {
  it('treats network errors, 408, 429 and 5xx as transient', () => {
    expect(isTransientError(new Error('socket hang up'))).toBe(true);
    expect(isTransientError(Object.assign(new Error('x'), { httpStatusCode: 408 }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('x'), { httpStatusCode: 429 }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('x'), { httpStatusCode: 503 }))).toBe(true);
  });

  it('treats other 4xx as permanent', () => {
    expect(isTransientError(Object.assign(new Error('x'), { httpStatusCode: 400 }))).toBe(false);
    expect(isTransientError(Object.assign(new Error('x'), { httpStatusCode: 401 }))).toBe(false);
    expect(isTransientError(Object.assign(new Error('x'), { httpStatusCode: 404 }))).toBe(false);
  });
});
