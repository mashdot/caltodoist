import { getStore } from '@netlify/blobs';
import { withRetry } from '../utils/retry';

const STORE_NAME = 'caltodoist-mappings';

interface BookingMapping {
  taskId: string;
  createdAt: string;
}

function isBookingMapping(value: unknown): value is BookingMapping {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BookingMapping).taskId === 'string'
  );
}

export async function saveMapping(bookingUid: string, taskId: string): Promise<void> {
  const store = getStore(STORE_NAME);
  const mapping: BookingMapping = {
    taskId,
    createdAt: new Date().toISOString(),
  };
  await withRetry(() => store.set(bookingUid, JSON.stringify(mapping)), {
    label: 'storage.saveMapping',
  });
}

export async function getTaskId(bookingUid: string): Promise<string | null> {
  const store = getStore(STORE_NAME);
  const data = await withRetry(() => store.get(bookingUid, { type: 'json' }), {
    label: 'storage.getTaskId',
  });
  return isBookingMapping(data) ? data.taskId : null;
}

export async function deleteMapping(bookingUid: string): Promise<void> {
  const store = getStore(STORE_NAME);
  await withRetry(() => store.delete(bookingUid), { label: 'storage.deleteMapping' });
}
