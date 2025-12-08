export enum TriggerEvent {
  BOOKING_CREATED = 'BOOKING_CREATED',
  BOOKING_RESCHEDULED = 'BOOKING_RESCHEDULED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  BOOKING_REJECTED = 'BOOKING_REJECTED',
  BOOKING_REQUESTED = 'BOOKING_REQUESTED',
  BOOKING_PAYMENT_INITIATED = 'BOOKING_PAYMENT_INITIATED',
  BOOKING_PAID = 'BOOKING_PAID',
  MEETING_STARTED = 'MEETING_STARTED',
  MEETING_ENDED = 'MEETING_ENDED',
  RECORDING_READY = 'RECORDING_READY',
  FORM_SUBMITTED = 'FORM_SUBMITTED',
  INSTANT_MEETING_CREATED = 'INSTANT_MEETING_CREATED',
  BOOKING_NO_SHOW_UPDATED = 'BOOKING_NO_SHOW_UPDATED',
  AFTER_HOSTS_CAL_VIDEO_NO_SHOW = 'AFTER_HOSTS_CAL_VIDEO_NO_SHOW',
  AFTER_GUESTS_CAL_VIDEO_NO_SHOW = 'AFTER_GUESTS_CAL_VIDEO_NO_SHOW',
}

export interface Person {
  id?: number;
  name: string;
  email: string;
  username?: string;
  timeZone: string;
  language?: {
    locale: string;
  };
  timeFormat?: string;
  phoneNumber?: string | null;
  locale?: string;
  bookingId?: number;
  noShow?: boolean;
}

export interface BookingPayload {
  type: string;
  title: string;
  description: string;
  additionalNotes?: string;
  customInputs?: Record<string, unknown>;
  startTime: string;
  endTime: string;
  organizer: Person;
  responses?: Record<string, { label: string; value?: unknown }>;
  userFieldsResponses?: Record<string, unknown>;
  attendees: Person[];
  location?: string;
  destinationCalendar?: {
    id: number;
    integration: string;
    externalId: string;
    userId: number;
    eventTypeId: number | null;
    credentialId: number;
  };
  hideCalendarNotes?: boolean;
  requiresConfirmation?: boolean | null;
  eventTypeId: number;
  seatsShowAttendees?: boolean;
  seatsPerTimeSlot?: number | null;
  uid: string;
  appsStatus?: Array<{
    appName: string;
    type: string;
    success: number;
    failures: number;
    errors: unknown[];
    warnings: unknown[];
  }>;
  eventTitle: string;
  eventDescription: string;
  price?: number;
  currency?: string;
  length: number;
  bookingId: number;
  metadata?: Record<string, unknown>;
  status: string;
  cancellationReason?: string;
  rejectionReason?: string;
  rescheduleUid?: string;
}

export interface NoShowPayload {
  message: string;
  attendees: Array<{
    email: string;
    noShow: boolean;
  }>;
  bookingUid: string;
  bookingId: number;
}

export interface CalVideoNoShowPayload {
  title: string;
  bookingId: number;
  bookingUid: string;
  startTime: string;
  attendees: Person[];
  endTime: string;
  participants: unknown[];
  hostEmail?: string;
  eventType: {
    id: number;
    teamId: number | null;
    parentId: number | null;
    calVideoSettings: unknown | null;
  };
  webhook: {
    id: string;
    subscriberUrl: string;
    appId: string | null;
    time: number;
    timeUnit: string;
    eventTriggers: string[];
    payloadTemplate: string | null;
  };
  message: string;
}

export interface CalcomWebhookPayload {
  triggerEvent: TriggerEvent;
  createdAt: string;
  payload: BookingPayload | NoShowPayload | CalVideoNoShowPayload;
}

export function isBookingPayload(
  payload: BookingPayload | NoShowPayload | CalVideoNoShowPayload
): payload is BookingPayload {
  return 'uid' in payload && 'title' in payload && 'attendees' in payload && 'organizer' in payload;
}

export function isNoShowPayload(
  payload: BookingPayload | NoShowPayload | CalVideoNoShowPayload
): payload is NoShowPayload {
  return 'message' in payload && 'bookingUid' in payload && !('title' in payload);
}

export function isCalVideoNoShowPayload(
  payload: BookingPayload | NoShowPayload | CalVideoNoShowPayload
): payload is CalVideoNoShowPayload {
  return 'webhook' in payload && 'message' in payload && 'title' in payload;
}
