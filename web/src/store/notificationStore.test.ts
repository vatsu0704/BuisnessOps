import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '@/types/notification';

const list = vi.fn<(businessId: string) => Promise<AppNotification[]>>();
const markOne = vi.fn<(businessId: string, id: string) => Promise<AppNotification>>();

vi.mock('@/api/notifications', () => ({
  listNotifications: (b: string) => list(b),
  markNotificationRead: (b: string, id: string) => markOne(b, id),
  markAllNotificationsRead: vi.fn().mockResolvedValue({ count: 0 }),
}));

const { useNotificationStore } = await import('./notificationStore');

const unread = (id: string) => ({ id, status: 'UNREAD', readAt: null }) as AppNotification;

describe('notificationStore', () => {
  beforeEach(() => {
    list.mockReset();
    markOne.mockReset();
    useNotificationStore.getState().reset();
  });

  it('marks read at once, before the server answers', async () => {
    list.mockResolvedValue([unread('n1'), unread('n2')]);
    await useNotificationStore.getState().load('b1');
    let settle: () => void = () => undefined;
    markOne.mockImplementation(() => new Promise((resolve) => (settle = () => resolve({} as AppNotification))));

    const marking = useNotificationStore.getState().markRead('n1');
    expect(useNotificationStore.getState().notifications[0].status).toBe('READ');
    settle();
    await marking;
  });

  it('puts the dot back when the server refuses', async () => {
    list.mockResolvedValue([unread('n1')]);
    await useNotificationStore.getState().load('b1');
    markOne.mockRejectedValue(new Error('offline'));

    await useNotificationStore.getState().markRead('n1');
    expect(useNotificationStore.getState().notifications[0].status).toBe('UNREAD');
    expect(list).toHaveBeenCalledTimes(2);
  });
});
