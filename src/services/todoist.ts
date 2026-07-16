import { TodoistApi } from '@doist/todoist-api-typescript';
import type { BookingPayload } from '../types/calcom';
import { getHttpStatusCode, withRetry } from '../utils/retry';

let apiInstance: TodoistApi | null = null;

function getApi(): TodoistApi {
  if (!apiInstance) {
    const token = process.env.TODOIST_API_TOKEN;
    if (!token) {
      throw new Error('TODOIST_API_TOKEN environment variable is required');
    }
    apiInstance = new TodoistApi(token);
  }
  return apiInstance;
}

/**
 * Todoist renders task content/description as Markdown. Booker-supplied text
 * (names, notes, locations) is escaped so it can't inject links or formatting
 * into the task list. Escapes render invisibly, so display is unaffected.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]()#>|~]/g, '\\$&');
}

function formatTaskContent(booking: BookingPayload): string {
  const attendeeName = booking.attendees[0]?.name || 'Unknown';
  return escapeMarkdown(`${booking.title} with ${attendeeName}`);
}

function formatDueDatetime(startTime: string): string {
  return new Date(startTime).toISOString();
}

function formatDescription(booking: BookingPayload, prefix?: string): string {
  const parts: string[] = [];

  if (prefix) {
    parts.push(prefix);
    parts.push('');
  }

  parts.push(`Event: ${escapeMarkdown(booking.eventTitle)}`);
  parts.push(`Duration: ${booking.length} minutes`);

  if (booking.location) {
    parts.push(`Location: ${escapeMarkdown(booking.location)}`);
  }

  if (booking.attendees.length > 0) {
    const attendeeInfo = booking.attendees
      .map((a) => escapeMarkdown(`${a.name} (${a.email})`))
      .join(', ');
    parts.push(`Attendees: ${attendeeInfo}`);
  }

  if (booking.additionalNotes) {
    parts.push('');
    parts.push(`Notes: ${escapeMarkdown(booking.additionalNotes)}`);
  }

  parts.push('');
  parts.push(`Booking ID: ${booking.uid}`);

  return parts.join('\n');
}

export async function createTask(booking: BookingPayload): Promise<string> {
  const api = getApi();

  const task = await withRetry(
    () =>
      api.addTask({
        content: formatTaskContent(booking),
        description: formatDescription(booking),
        dueDatetime: formatDueDatetime(booking.startTime),
        projectId: process.env.TODOIST_PROJECT_ID || undefined,
        duration: booking.length,
        durationUnit: 'minute',
      }),
    { label: 'todoist.createTask' }
  );

  return task.id;
}

export async function updateTaskDueDate(taskId: string, booking: BookingPayload): Promise<void> {
  const api = getApi();

  await withRetry(
    () =>
      api.updateTask(taskId, {
        content: formatTaskContent(booking),
        description: formatDescription(booking),
        dueDatetime: formatDueDatetime(booking.startTime),
        duration: booking.length,
        durationUnit: 'minute',
      }),
    { label: 'todoist.updateTaskDueDate' }
  );
}

export async function updateTaskDescription(
  taskId: string,
  booking: BookingPayload,
  prefix: string
): Promise<void> {
  const api = getApi();

  await withRetry(
    () =>
      api.updateTask(taskId, {
        description: formatDescription(booking, prefix),
      }),
    { label: 'todoist.updateTaskDescription' }
  );
}

export async function addTaskComment(taskId: string, content: string): Promise<void> {
  const api = getApi();

  await withRetry(
    () =>
      api.addComment({
        taskId,
        content,
      }),
    { label: 'todoist.addTaskComment' }
  );
}

export async function deleteTask(taskId: string): Promise<void> {
  const api = getApi();
  try {
    await withRetry(() => api.deleteTask(taskId), { label: 'todoist.deleteTask' });
  } catch (error) {
    // A missing task means a previous delivery already deleted it. Treating
    // 404 as success keeps deletes idempotent under Cal.com redelivery.
    if (getHttpStatusCode(error) === 404) {
      console.log(`Task ${taskId} already deleted, treating as success`);
      return;
    }
    throw error;
  }
}

export async function completeTask(taskId: string): Promise<void> {
  const api = getApi();
  await withRetry(() => api.closeTask(taskId), { label: 'todoist.completeTask' });
}
