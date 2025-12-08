import { createHmac, timingSafeEqual } from 'crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string | undefined
): boolean {
  // If no secret is configured, skip verification
  if (!secret) {
    console.warn('CALCOM_WEBHOOK_SECRET not set - skipping signature verification');
    return true;
  }

  if (!signature) {
    console.error('Missing x-cal-signature-256 header');
    return false;
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

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
