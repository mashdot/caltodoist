import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry';

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
});
