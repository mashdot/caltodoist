import { getStore } from '@netlify/blobs';

const STORE_NAME = 'caltodoist-mappings';

interface BookingMapping {
  taskId: string;
  createdAt: string;
}

export async function saveMapping(bookingUid: string, taskId: string): Promise<void> {
  const store = getStore(STORE_NAME);
  const mapping: BookingMapping = {
    taskId,
    createdAt: new Date().toISOString(),
  };
  await store.set(bookingUid, JSON.stringify(mapping));
}

export async function getTaskId(bookingUid: string): Promise<string | null> {
  const store = getStore(STORE_NAME);
  const data = await store.get(bookingUid, { type: 'json' }) as BookingMapping | null;
  return data?.taskId ?? null;
}

export async function deleteMapping(bookingUid: string): Promise<void> {
  const store = getStore(STORE_NAME);
  await store.delete(bookingUid);
}
