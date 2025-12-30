import {
  CalcomWebhookPayload,
  TriggerEvent,
  isBookingPayload,
  isNoShowPayload,
  isCalVideoNoShowPayload,
  BookingPayload,
} from '../types/calcom';
import { verifyWebhookSignature } from '../utils/verify';
import * as todoist from '../services/todoist';
import * as storage from '../services/storage';

async function handleBookingCreated(payload: BookingPayload): Promise<void> {
  const existingTaskId = await storage.getTaskId(payload.uid);
  if (existingTaskId) {
    console.log(`Task already exists for booking ${payload.uid}, skipping`);
    return;
  }

  const taskId = await todoist.createTask(payload);
  await storage.saveMapping(payload.uid, taskId);
  console.log(`Created task ${taskId} for booking ${payload.uid}`);
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
    console.log(`No task found for booking ${payload.uid} (rescheduleUid: ${payload.rescheduleUid}), creating new task`);
    await handleBookingCreated(payload);
    return;
  }

  await todoist.updateTaskDueDate(taskId, payload);

  // Migrate the storage mapping from old UID to new UID
  if (oldUid && oldUid !== payload.uid) {
    await storage.deleteMapping(oldUid);
    await storage.saveMapping(payload.uid, taskId);
    console.log(`Updated task ${taskId} and migrated mapping from ${oldUid} to ${payload.uid}`);
  } else {
    console.log(`Updated task ${taskId} with new schedule for booking ${payload.uid}`);
  }
}

async function handleBookingCancelled(payload: BookingPayload): Promise<void> {
  const taskId = await storage.getTaskId(payload.uid);
  if (!taskId) {
    console.log(`No task found for cancelled booking ${payload.uid}`);
    return;
  }

  await todoist.deleteTask(taskId);
  await storage.deleteMapping(payload.uid);
  console.log(`Deleted task ${taskId} for cancelled booking ${payload.uid}`);
}

async function handleBookingRejected(payload: BookingPayload): Promise<void> {
  const taskId = await storage.getTaskId(payload.uid);
  if (!taskId) {
    console.log(`No task found for rejected booking ${payload.uid}`);
    return;
  }

  await todoist.deleteTask(taskId);
  await storage.deleteMapping(payload.uid);
  console.log(`Deleted task ${taskId} for rejected booking ${payload.uid}`);
}

async function handleBookingRequested(payload: BookingPayload): Promise<void> {
  const existingTaskId = await storage.getTaskId(payload.uid);
  if (existingTaskId) {
    console.log(`Task already exists for booking ${payload.uid}, skipping`);
    return;
  }

  const taskId = await todoist.createTask(payload);
  await storage.saveMapping(payload.uid, taskId);
  console.log(`Created pending task ${taskId} for booking request ${payload.uid}`);
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

  await todoist.addTaskComment(taskId, `Meeting started at ${new Date().toLocaleTimeString()}`);
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

async function handleNoShowUpdated(
  bookingUid: string,
  message: string
): Promise<void> {
  const taskId = await storage.getTaskId(bookingUid);
  if (!taskId) {
    console.log(`No task found for booking ${bookingUid}`);
    return;
  }

  await todoist.addTaskComment(taskId, `No-show update: ${message}`);
  console.log(`Added no-show comment to task ${taskId}`);
}

async function handleCalVideoNoShow(
  bookingUid: string,
  message: string
): Promise<void> {
  const taskId = await storage.getTaskId(bookingUid);
  if (!taskId) {
    console.log(`No task found for booking ${bookingUid}`);
    return;
  }

  await todoist.addTaskComment(taskId, `Cal Video: ${message}`);
  console.log(`Added Cal Video no-show comment to task ${taskId}`);
}

export async function handleWebhookRequest(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get('x-cal-signature-256') ?? undefined;
  const secret = process.env.CALCOM_WEBHOOK_SECRET;

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const webhookPayload = JSON.parse(rawBody) as CalcomWebhookPayload;
  const { triggerEvent, payload } = webhookPayload;

  console.log(`Received webhook: ${triggerEvent}`);

  try {
    switch (triggerEvent) {
      case TriggerEvent.BOOKING_CREATED:
        if (isBookingPayload(payload)) {
          await handleBookingCreated(payload);
        }
        break;

      case TriggerEvent.BOOKING_RESCHEDULED:
        if (isBookingPayload(payload)) {
          await handleBookingRescheduled(payload);
        }
        break;

      case TriggerEvent.BOOKING_CANCELLED:
        if (isBookingPayload(payload)) {
          await handleBookingCancelled(payload);
        }
        break;

      case TriggerEvent.BOOKING_REJECTED:
        if (isBookingPayload(payload)) {
          await handleBookingRejected(payload);
        }
        break;

      case TriggerEvent.BOOKING_REQUESTED:
        if (isBookingPayload(payload)) {
          await handleBookingRequested(payload);
        }
        break;

      case TriggerEvent.BOOKING_PAYMENT_INITIATED:
        if (isBookingPayload(payload)) {
          await handlePaymentEvent(payload, 'initiated');
        }
        break;

      case TriggerEvent.BOOKING_PAID:
        if (isBookingPayload(payload)) {
          await handlePaymentEvent(payload, 'paid');
        }
        break;

      case TriggerEvent.MEETING_STARTED:
        if (isBookingPayload(payload)) {
          await handleMeetingStarted(payload);
        }
        break;

      case TriggerEvent.MEETING_ENDED:
        if (isBookingPayload(payload)) {
          await handleMeetingEnded(payload);
        }
        break;

      case TriggerEvent.BOOKING_NO_SHOW_UPDATED:
        if (isNoShowPayload(payload)) {
          await handleNoShowUpdated(payload.bookingUid, payload.message);
        }
        break;

      case TriggerEvent.AFTER_HOSTS_CAL_VIDEO_NO_SHOW:
      case TriggerEvent.AFTER_GUESTS_CAL_VIDEO_NO_SHOW:
        if (isCalVideoNoShowPayload(payload)) {
          await handleCalVideoNoShow(payload.bookingUid, payload.message);
        }
        break;

      default:
        console.log(`Unhandled event type: ${triggerEvent}`);
    }

    return Response.json({ success: true, event: triggerEvent });
  } catch (error) {
    console.error(`Error handling webhook ${triggerEvent}:`, error);
    return Response.json(
      { error: 'Internal server error', event: triggerEvent },
      { status: 500 }
    );
  }
}
