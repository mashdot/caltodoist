import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyWebhookSignature } from './verify';

const SECRET = 'test-secret';

function sign(payload: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

describe('verifyWebhookSignature', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('accepts a valid signature', () => {
    const payload = '{"hello":"world"}';
    expect(verifyWebhookSignature(payload, sign(payload), SECRET)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const payload = '{"hello":"world"}';
    expect(verifyWebhookSignature(payload, sign(payload, 'other'), SECRET)).toBe(false);
  });

  it('rejects when the signature is missing', () => {
    expect(verifyWebhookSignature('{}', undefined, SECRET)).toBe(false);
  });

  it('rejects a malformed (non-hex) signature without throwing', () => {
    expect(verifyWebhookSignature('{}', 'not-hex-zzzz', SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length', () => {
    expect(verifyWebhookSignature('{}', 'abcd', SECRET)).toBe(false);
  });

  it('fails closed when no secret is set in production', () => {
    process.env.NODE_ENV = 'production';
    expect(verifyWebhookSignature('{}', sign('{}'), undefined)).toBe(false);
  });

  it('skips verification when no secret is set outside production', () => {
    process.env.NODE_ENV = 'development';
    expect(verifyWebhookSignature('{}', undefined, undefined)).toBe(true);
  });
});
