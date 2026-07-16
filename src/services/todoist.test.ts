import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApi = {
  addTask: vi.fn(),
  updateTask: vi.fn(),
  addComment: vi.fn(),
  deleteTask: vi.fn(),
  closeTask: vi.fn(),
};

vi.mock('@doist/todoist-api-typescript', () => ({
  TodoistApi: vi.fn(() => mockApi),
}));

import type { BookingPayload } from '../types/calcom';
import * as todoist from './todoist';

function booking(overrides: Partial<BookingPayload> = {}): BookingPayload {
  return {
    type: 'intro',
    title: 'Intro call',
    description: '',
    startTime: '2026-06-10T23:00:00-04:00',
    endTime: '2026-06-10T23:30:00-04:00',
    organizer: { name: 'Host', email: 'host@example.com', timeZone: 'America/New_York' },
    attendees: [{ name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' }],
    eventTypeId: 1,
    uid: 'booking-1',
    eventTitle: 'Intro call',
    eventDescription: '',
    length: 30,
    bookingId: 1,
    status: 'ACCEPTED',
    ...overrides,
  };
}

describe('todoist service', () => {
  beforeEach(() => {
    vi.stubEnv('TODOIST_API_TOKEN', 'test-token');
    vi.stubEnv('TODOIST_PROJECT_ID', undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('createTask', () => {
    it('sends the booking start time as a due datetime, preserving time of day', async () => {
      mockApi.addTask.mockResolvedValue({ id: 'task-1' });

      const taskId = await todoist.createTask(booking());

      expect(taskId).toBe('task-1');
      expect(mockApi.addTask).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Intro call with Ada',
          // 23:00 -04:00 is 03:00Z the next day; a datetime keeps that exact
          // instant, where a date-only value would have shifted the day.
          dueDatetime: '2026-06-11T03:00:00.000Z',
          duration: 30,
          durationUnit: 'minute',
        })
      );
      expect(mockApi.addTask.mock.calls[0]?.[0]).not.toHaveProperty('dueDate');
    });

    it('escapes Markdown in booker-supplied text', async () => {
      mockApi.addTask.mockResolvedValue({ id: 'task-1' });

      await todoist.createTask(
        booking({
          attendees: [
            { name: '[Click me](https://evil.example)', email: 'x@example.com', timeZone: 'UTC' },
          ],
          additionalNotes: '**bold** and `code`',
        })
      );

      const args = mockApi.addTask.mock.calls[0]?.[0];
      expect(args.content).toBe('Intro call with \\[Click me\\]\\(https://evil.example\\)');
      expect(args.description).toContain('Notes: \\*\\*bold\\*\\* and \\`code\\`');
    });

    it('passes the configured project id', async () => {
      vi.stubEnv('TODOIST_PROJECT_ID', 'proj-9');
      mockApi.addTask.mockResolvedValue({ id: 'task-1' });

      await todoist.createTask(booking());

      expect(mockApi.addTask).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-9' })
      );
    });
  });

  describe('updateTaskDueDate', () => {
    it('sends the new start time as a due datetime', async () => {
      mockApi.updateTask.mockResolvedValue({});

      await todoist.updateTaskDueDate('task-1', booking({ startTime: '2026-07-01T09:00:00.000Z' }));

      expect(mockApi.updateTask).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({ dueDatetime: '2026-07-01T09:00:00.000Z' })
      );
    });
  });

  describe('deleteTask', () => {
    it('treats a 404 as success so redeliveries stay idempotent', async () => {
      mockApi.deleteTask.mockRejectedValue(
        Object.assign(new Error('not found'), { httpStatusCode: 404 })
      );

      await expect(todoist.deleteTask('task-gone')).resolves.toBeUndefined();
      expect(mockApi.deleteTask).toHaveBeenCalledTimes(1);
    });

    it('propagates other permanent errors', async () => {
      mockApi.deleteTask.mockRejectedValue(
        Object.assign(new Error('unauthorized'), { httpStatusCode: 401 })
      );

      await expect(todoist.deleteTask('task-1')).rejects.toThrow('unauthorized');
    });
  });
});
