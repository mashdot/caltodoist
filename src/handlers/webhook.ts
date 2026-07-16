import * as storage from '../services/storage';
import * as todoist from '../services/todoist';
import {
  type BookingPayload,
  type CalcomWebhookPayload,
  TriggerEvent,
  isBookingPayload,
  isCalVideoNoShowPayload,
  isNoShowPayload,
} from '../types/calcom';
import { verifyWebhookSignature } from '../utils/verify';

async function handleBookingCreated(payload: BookingPayload, kind = 'booking'): Promise<void> {
  const existingTaskId = await storage.getTaskId(payload.uid);
  if (existingTaskId) {
    console.log(`Task already exists for booking ${payload.uid}, skipping`);
    return;
  }

  const taskId = await todoist.createTask(payload);
  try {
    await storage.saveMapping(payload.uid, taskId);
  } catch (error) {
    // Without a persisted mapping, Cal.com's redelivery would create a
    // duplicate task, so undo the create before surfacing the failure.
    console.error(
      `Failed to save mapping for booking ${payload.uid}, deleting orphaned task ${taskId}`
    );
    await todoist.deleteTask(taskId).catch((cleanupError) => {
      console.error(`Failed to delete orphaned task ${taskId}:`, cleanupError);
    });
    throw error;
  }
  console.log(`Created task ${taskId} for ${kind} ${payload.uid}`);
}

async function handleBookingRescheduled(payload: BookingPayload): Promise<void> {
  // When rescheduling, Cal.com creates a new booking with a new UID
  // The original booking's UID is in rescheduleUid
  let taskId: string | null = null;
  let oldUid: string | null = null;

  // First, try to find the task using the original booking's UID
  if (payload.rescheduleUid) {
    taskId = await storage.getTaskId(payload.rescheduleUid);
    if (taskId) {
      oldUid = payload.rescheduleUid;
    }
  }

  // Fall back to checking the new UID (in case of re-reschedule or other edge cases)
  if (!taskId) {
    taskId = await storage.getTaskId(payload.uid);
  }

  if (!taskId) {
    console.log(
      `No task found for booking ${payload.uid} (rescheduleUid: ${payload.rescheduleUid}), creating new task`
    );
    await handleBookingCreated(payload);
    return;
  }

  await todoist.updateTaskDueDate(taskId, payload);

  // Migrate the storage mapping from old UID to new UID. Save the new
  // mapping before deleting the old one so a failure between the two never
  // leaves the task unreachable (a leftover old mapping is harmless).
  if (oldUid && oldUid !== payload.uid) {
    await storage.saveMapping(payload.uid, taskId);
    await storage.deleteMapping(oldUid);
    console.log(`Updated task ${taskId} and migrated mapping from ${oldUid} to ${payload.uid}`);
  } else {
    console.log(`Updated task ${taskId} with new schedule for booking ${payload.uid}`);
  }
}

async function handleBookingRemoved(
  payload: BookingPayload,
  kind: 'cancelled' | 'rejected'
): Promise<void> {
  const taskId = await storage.getTaskId(payload.uid);
  if (!taskId) {
    console.log(`No task found for ${kind} booking ${payload.uid}`);
    return;
  }

  await todoist.deleteTask(taskId);
  await storage.deleteMapping(payload.uid);
  console.log(`Deleted task ${taskId} for ${kind} booking ${payload.uid}`);
}

async function handlePaymentEvent(
  payload: BookingPayload,
  eventType: 'initiated' | 'paid'
): Promise<void> {
  const taskId = await storage.getTaskId(payload.uid);
  if (!taskId) {
    console.log(`No task found for booking ${payload.uid}`);
    return;
  }

  const prefix = eventType === 'paid' ? '✅ Payment received' : '💳 Payment initiated';
  await todoist.updateTaskDescription(taskId, payload, prefix);
  console.log(`Updated task ${taskId} with payment status for booking ${payload.uid}`);
}

async function handleMeetingStarted(payload: BookingPayload): Promise<void> {
  const taskId = await storage.getTaskId(payload.uid);
  if (!taskId) {
    console.log(`No task found for booking ${payload.uid}`);
    return;
  }

  await todoist.addTaskComment(taskId, `Meeting started at ${new Date().toISOString()}`);
  console.log(`Added meeting started comment to task ${taskId}`);
}

async function handleMeetingEnded(payload: BookingPayload): Promise<void> {
  const taskId = await storage.getTaskId(payload.uid);
  if (!taskId) {
    console.log(`No task found for booking ${payload.uid}`);
    return;
  }

  await todoist.completeTask(taskId);
  console.log(`Completed task ${taskId} for ended meeting ${payload.uid}`);
}

async function handleNoShowUpdated(bookingUid: string, message: string): Promise<void> {
  const taskId = await storage.getTaskId(bookingUid);
  if (!taskId) {
    console.log(`No task found for booking ${bookingUid}`);
    return;
  }

  await todoist.addTaskComment(taskId, `No-show update: ${message}`);
  console.log(`Added no-show comment to task ${taskId}`);
}

async function handleCalVideoNoShow(bookingUid: string, message: string): Promise<void> {
  const taskId = await storage.getTaskId(bookingUid);
  if (!taskId) {
    console.log(`No task found for booking ${bookingUid}`);
    return;
  }

  await todoist.addTaskComment(taskId, `Cal Video: ${message}`);
  console.log(`Added Cal Video no-show comment to task ${taskId}`);
}

function unrecognizedPayload(triggerEvent: string): Response {
  // A 400 makes schema drift visible in Cal.com's webhook logs instead of
  // silently dropping the event with a 200.
  console.error(`Payload for ${triggerEvent} did not match the expected shape, rejecting`);
  return Response.json(
    { error: 'Unrecognized payload shape', event: triggerEvent },
    { status: 400 }
  );
}

export async function handleWebhookRequest(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get('x-cal-signature-256') ?? undefined;
  const secret = process.env.CALCOM_WEBHOOK_SECRET;

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let webhookPayload: CalcomWebhookPayload;
  try {
    webhookPayload = JSON.parse(rawBody) as CalcomWebhookPayload;
  } catch {
    console.error('Failed to parse webhook body as JSON');
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { triggerEvent, payload } = webhookPayload ?? {};
  if (!triggerEvent || typeof payload !== 'object' || payload === null) {
    console.error('Webhook body missing triggerEvent or payload');
    return Response.json({ error: 'Malformed webhook payload' }, { status: 400 });
  }

  console.log(`Received webhook: ${triggerEvent}`);

  try {
    switch (triggerEvent) {
      case TriggerEvent.BOOKING_CREATED:
        if (!isBookingPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handleBookingCreated(payload);
        break;

      case TriggerEvent.BOOKING_RESCHEDULED:
        if (!isBookingPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handleBookingRescheduled(payload);
        break;

      case TriggerEvent.BOOKING_CANCELLED:
        if (!isBookingPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handleBookingRemoved(payload, 'cancelled');
        break;

      case TriggerEvent.BOOKING_REJECTED:
        if (!isBookingPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handleBookingRemoved(payload, 'rejected');
        break;

      case TriggerEvent.BOOKING_REQUESTED:
        if (!isBookingPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handleBookingCreated(payload, 'booking request');
        break;

      case TriggerEvent.BOOKING_PAYMENT_INITIATED:
        if (!isBookingPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handlePaymentEvent(payload, 'initiated');
        break;

      case TriggerEvent.BOOKING_PAID:
        if (!isBookingPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handlePaymentEvent(payload, 'paid');
        break;

      case TriggerEvent.MEETING_STARTED:
        if (!isBookingPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handleMeetingStarted(payload);
        break;

      case TriggerEvent.MEETING_ENDED:
        if (!isBookingPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handleMeetingEnded(payload);
        break;

      case TriggerEvent.BOOKING_NO_SHOW_UPDATED:
        if (!isNoShowPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handleNoShowUpdated(payload.bookingUid, payload.message);
        break;

      case TriggerEvent.AFTER_HOSTS_CAL_VIDEO_NO_SHOW:
      case TriggerEvent.AFTER_GUESTS_CAL_VIDEO_NO_SHOW:
        if (!isCalVideoNoShowPayload(payload)) return unrecognizedPayload(triggerEvent);
        await handleCalVideoNoShow(payload.bookingUid, payload.message);
        break;

      default:
        console.log(`Unhandled event type: ${triggerEvent}`);
    }

    return Response.json({ success: true, event: triggerEvent });
  } catch (error) {
    console.error(`Error handling webhook ${triggerEvent}:`, error);
    return Response.json({ error: 'Internal server error', event: triggerEvent }, { status: 500 });
  }
}
