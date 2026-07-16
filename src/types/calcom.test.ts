import { describe, expect, it } from 'vitest';
import { isBookingPayload, isCalVideoNoShowPayload, isNoShowPayload } from './calcom';

const validBooking = {
  uid: 'booking-123',
  title: 'Intro call',
  attendees: [{ name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' }],
  organizer: { name: 'Host', email: 'host@example.com', timeZone: 'UTC' },
  startTime: '2026-06-10T10:00:00.000Z',
  length: 30,
};

const validNoShow = {
  message: 'Attendee did not show',
  bookingUid: 'booking-123',
  attendees: [{ email: 'ada@example.com', noShow: true }],
  bookingId: 1,
};

const validCalVideoNoShow = {
  title: 'Intro call',
  bookingUid: 'booking-123',
  message: 'Host did not join',
  webhook: { id: 'wh_1' },
};

describe('isBookingPayload', () => {
  it('accepts a well-formed booking payload', () => {
    expect(isBookingPayload(validBooking as never)).toBe(true);
  });

  it('rejects when uid is the wrong type', () => {
    expect(isBookingPayload({ ...validBooking, uid: 123 } as never)).toBe(false);
  });

  it('rejects when length is missing', () => {
    const { length: _length, ...rest } = validBooking;
    expect(isBookingPayload(rest as never)).toBe(false);
  });

  it('rejects null and non-objects', () => {
    expect(isBookingPayload(null as never)).toBe(false);
    expect(isBookingPayload('nope' as never)).toBe(false);
  });
});

describe('isNoShowPayload', () => {
  it('accepts a no-show payload', () => {
    expect(isNoShowPayload(validNoShow as never)).toBe(true);
  });

  it('rejects payloads that carry a title (i.e. bookings)', () => {
    expect(isNoShowPayload({ ...validNoShow, title: 'x' } as never)).toBe(false);
  });
});

describe('isCalVideoNoShowPayload', () => {
  it('accepts a cal video no-show payload', () => {
    expect(isCalVideoNoShowPayload(validCalVideoNoShow as never)).toBe(true);
  });

  it('rejects when the webhook field is absent', () => {
    const { webhook: _webhook, ...rest } = validCalVideoNoShow;
    expect(isCalVideoNoShowPayload(rest as never)).toBe(false);
  });
});
