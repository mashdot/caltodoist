import { TodoistApi } from '@doist/todoist-api-typescript';
import { BookingPayload } from '../types/calcom';

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

function formatTaskContent(booking: BookingPayload): string {
  const attendeeName = booking.attendees[0]?.name || 'Unknown';
  return `${booking.title} with ${attendeeName}`;
}

function formatDueDate(startTime: string): string {
  return new Date(startTime).toISOString();
}

function formatDescription(booking: BookingPayload, prefix?: string): string {
  const parts: string[] = [];

  if (prefix) {
    parts.push(prefix);
    parts.push('');
  }

  parts.push(`Event: ${booking.eventTitle}`);
  parts.push(`Duration: ${booking.length} minutes`);

  if (booking.location) {
    parts.push(`Location: ${booking.location}`);
  }

  if (booking.attendees.length > 0) {
    const attendeeInfo = booking.attendees
      .map(a => `${a.name} (${a.email})`)
      .join(', ');
    parts.push(`Attendees: ${attendeeInfo}`);
  }

  if (booking.additionalNotes) {
    parts.push('');
    parts.push(`Notes: ${booking.additionalNotes}`);
  }

  parts.push('');
  parts.push(`Booking ID: ${booking.uid}`);

  return parts.join('\n');
}

export async function createTask(booking: BookingPayload): Promise<string> {
  const api = getApi();

  const task = await api.addTask({
    content: formatTaskContent(booking),
    description: formatDescription(booking),
    dueDate: formatDueDate(booking.startTime),
    projectId: process.env.TODOIST_PROJECT_ID || undefined,
    duration: booking.length,
    durationUnit: 'minute',
  });

  return task.id;
}

export async function updateTaskDueDate(taskId: string, booking: BookingPayload): Promise<void> {
  const api = getApi();

  await api.updateTask(taskId, {
    content: formatTaskContent(booking),
    description: formatDescription(booking),
    dueDate: formatDueDate(booking.startTime),
    duration: booking.length,
    durationUnit: 'minute',
  });
}

export async function updateTaskDescription(
  taskId: string,
  booking: BookingPayload,
  prefix: string
): Promise<void> {
  const api = getApi();

  await api.updateTask(taskId, {
    description: formatDescription(booking, prefix),
  });
}

export async function addTaskComment(taskId: string, content: string): Promise<void> {
  const api = getApi();

  await api.addComment({
    taskId,
    content,
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  const api = getApi();
  await api.deleteTask(taskId);
}

export async function completeTask(taskId: string): Promise<void> {
  const api = getApi();
  await api.closeTask(taskId);
}
