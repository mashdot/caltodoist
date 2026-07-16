import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string | undefined
): boolean {
  // If no secret is configured, fail closed. Environment detection (e.g.
  // NODE_ENV) is unreliable on Netlify Functions, so skipping verification
  // requires an explicit local-dev opt-out.
  if (!secret) {
    if (process.env.ALLOW_UNVERIFIED_WEBHOOKS === 'true') {
      console.warn(
        'CALCOM_WEBHOOK_SECRET not set and ALLOW_UNVERIFIED_WEBHOOKS=true - skipping signature verification (local dev only)'
      );
      return true;
    }
    console.error(
      'CALCOM_WEBHOOK_SECRET not set - rejecting webhook (set ALLOW_UNVERIFIED_WEBHOOKS=true to skip verification in local dev)'
    );
    return false;
  }

  if (!signature) {
    console.error('Missing x-cal-signature-256 header');
    return false;
  }

  const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');

  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
