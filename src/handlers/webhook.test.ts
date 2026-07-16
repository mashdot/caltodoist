import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TriggerEvent } from '../types/calcom';

vi.mock('../services/todoist', () => ({
  createTask: vi.fn(),
  updateTaskDueDate: vi.fn(),
  updateTaskDescription: vi.fn(),
  addTaskComment: vi.fn(),
  deleteTask: vi.fn(),
  completeTask: vi.fn(),
}));

vi.mock('../services/storage', () => ({
  getTaskId: vi.fn(),
  saveMapping: vi.fn(),
  deleteMapping: vi.fn(),
}));

import * as storage from '../services/storage';
import * as todoist from '../services/todoist';
import { handleWebhookRequest } from './webhook';

const SECRET = 'test-secret';

function bookingPayload(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'booking-new',
    title: 'Intro call',
    attendees: [{ name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' }],
    organizer: { name: 'Host', email: 'host@example.com', timeZone: 'UTC' },
    startTime: '2026-06-10T10:00:00.000Z',
    eventTitle: 'Intro call',
    length: 30,
    ...overrides,
  };
}

function makeRequest(body: string): Request {
  const signature = createHmac('sha256', SECRET).update(body).digest('hex');
  return new Request('https://example.com/api/cal/webhook', {
    method: 'POST',
    headers: { 'x-cal-signature-256': signature },
    body,
  });
}

describe('handleWebhookRequest', () => {
  beforeEach(() => {
    process.env.CALCOM_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('returns 401 when the signature is invalid', async () => {
    const req = new Request('https://example.com/api/cal/webhook', {
      method: 'POST',
      headers: { 'x-cal-signature-256': 'deadbeef' },
      body: '{}',
    });
    const res = await handleWebhookRequest(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on malformed JSON instead of throwing', async () => {
    const res = await handleWebhookRequest(makeRequest('not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when triggerEvent/payload are missing', async () => {
    const res = await handleWebhookRequest(makeRequest(JSON.stringify({ foo: 'bar' })));
    expect(res.status).toBe(400);
  });

  it('creates a task on BOOKING_CREATED', async () => {
    vi.mocked(storage.getTaskId).mockResolvedValue(null);
    vi.mocked(todoist.createTask).mockResolvedValue('task-1');

    const body = JSON.stringify({
      triggerEvent: TriggerEvent.BOOKING_CREATED,
      payload: bookingPayload(),
    });
    const res = await handleWebhookRequest(makeRequest(body));

    expect(res.status).toBe(200);
    expect(todoist.createTask).toHaveBeenCalledOnce();
    expect(storage.saveMapping).toHaveBeenCalledWith('booking-new', 'task-1');
  });

  it('migrates the mapping from the old uid on reschedule', async () => {
    // Old uid resolves to an existing task; new uid does not.
    vi.mocked(storage.getTaskId).mockImplementation(async (uid: string) =>
      uid === 'booking-old' ? 'task-1' : null
    );

    const body = JSON.stringify({
      triggerEvent: TriggerEvent.BOOKING_RESCHEDULED,
      payload: bookingPayload({ uid: 'booking-new', rescheduleUid: 'booking-old' }),
    });
    const res = await handleWebhookRequest(makeRequest(body));

    expect(res.status).toBe(200);
    expect(todoist.updateTaskDueDate).toHaveBeenCalledWith('task-1', expect.anything());
    expect(storage.deleteMapping).toHaveBeenCalledWith('booking-old');
    expect(storage.saveMapping).toHaveBeenCalledWith('booking-new', 'task-1');
  });

  it('returns 400 when a known event has an unrecognized payload shape', async () => {
    const body = JSON.stringify({
      triggerEvent: TriggerEvent.BOOKING_CREATED,
      payload: { uid: 'booking-new' }, // missing title/attendees/etc.
    });
    const res = await handleWebhookRequest(makeRequest(body));

    expect(res.status).toBe(400);
    expect(todoist.createTask).not.toHaveBeenCalled();
  });

  it('deletes the created task when saving the mapping fails, so redelivery cannot duplicate it', async () => {
    vi.mocked(storage.getTaskId).mockResolvedValue(null);
    vi.mocked(todoist.createTask).mockResolvedValue('task-1');
    vi.mocked(storage.saveMapping).mockRejectedValue(new Error('blobs down'));

    const body = JSON.stringify({
      triggerEvent: TriggerEvent.BOOKING_CREATED,
      payload: bookingPayload(),
    });
    const res = await handleWebhookRequest(makeRequest(body));

    expect(res.status).toBe(500);
    expect(todoist.deleteTask).toHaveBeenCalledWith('task-1');
  });

  it('saves the new mapping before deleting the old one on reschedule', async () => {
    vi.mocked(storage.getTaskId).mockImplementation(async (uid: string) =>
      uid === 'booking-old' ? 'task-1' : null
    );

    const body = JSON.stringify({
      triggerEvent: TriggerEvent.BOOKING_RESCHEDULED,
      payload: bookingPayload({ uid: 'booking-new', rescheduleUid: 'booking-old' }),
    });
    await handleWebhookRequest(makeRequest(body));

    const saveOrder = vi.mocked(storage.saveMapping).mock.invocationCallOrder[0];
    const deleteOrder = vi.mocked(storage.deleteMapping).mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(deleteOrder);
  });

  it('deletes the task and mapping on BOOKING_CANCELLED', async () => {
    vi.mocked(storage.getTaskId).mockResolvedValue('task-1');

    const body = JSON.stringify({
      triggerEvent: TriggerEvent.BOOKING_CANCELLED,
      payload: bookingPayload(),
    });
    const res = await handleWebhookRequest(makeRequest(body));

    expect(res.status).toBe(200);
    expect(todoist.deleteTask).toHaveBeenCalledWith('task-1');
    expect(storage.deleteMapping).toHaveBeenCalledWith('booking-new');
  });

  it('creates a new task when a rescheduled booking has no known task', async () => {
    vi.mocked(storage.getTaskId).mockResolvedValue(null);
    vi.mocked(todoist.createTask).mockResolvedValue('task-2');

    const body = JSON.stringify({
      triggerEvent: TriggerEvent.BOOKING_RESCHEDULED,
      payload: bookingPayload({ uid: 'booking-new', rescheduleUid: 'unknown' }),
    });
    const res = await handleWebhookRequest(makeRequest(body));

    expect(res.status).toBe(200);
    expect(todoist.createTask).toHaveBeenCalledOnce();
    expect(todoist.updateTaskDueDate).not.toHaveBeenCalled();
  });
});
