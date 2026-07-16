import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockStore = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => mockStore),
}));

import * as storage from './storage';

describe('storage service', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('saves a mapping with the task id and a timestamp', async () => {
    mockStore.set.mockResolvedValue(undefined);

    await storage.saveMapping('booking-1', 'task-1');

    expect(mockStore.set).toHaveBeenCalledTimes(1);
    const [key, value] = mockStore.set.mock.calls[0];
    expect(key).toBe('booking-1');
    const parsed = JSON.parse(value);
    expect(parsed.taskId).toBe('task-1');
    expect(new Date(parsed.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('returns the task id for a stored mapping', async () => {
    mockStore.get.mockResolvedValue({ taskId: 'task-1', createdAt: '2026-01-01T00:00:00.000Z' });

    await expect(storage.getTaskId('booking-1')).resolves.toBe('task-1');
    expect(mockStore.get).toHaveBeenCalledWith('booking-1', { type: 'json' });
  });

  it('returns null for missing or malformed mappings', async () => {
    mockStore.get.mockResolvedValue(null);
    await expect(storage.getTaskId('missing')).resolves.toBeNull();

    mockStore.get.mockResolvedValue({ unexpected: true });
    await expect(storage.getTaskId('malformed')).resolves.toBeNull();
  });

  it('deletes a mapping', async () => {
    mockStore.delete.mockResolvedValue(undefined);

    await storage.deleteMapping('booking-1');

    expect(mockStore.delete).toHaveBeenCalledWith('booking-1');
  });
});
