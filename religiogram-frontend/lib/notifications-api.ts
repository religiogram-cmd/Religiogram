import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  isRead: boolean;
  createdAt: string;
}

export async function getNotifications(
  token: string,
  cursor?: string
): Promise<{ items: Notification[]; nextCursor?: string }> {
  const url = cursor
    ? `${API}/notifications?cursor=${cursor}&limit=20`
    : `${API}/notifications?limit=20`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    withCredentials: true,
  });
  return data.data;
}

/**
 * Cheap unread count — used by BottomNav badge.
 * Hits GET /notifications/unread-count → { count: number }
 */
export async function getUnreadCount(token: string): Promise<number> {
  try {
    const { data } = await axios.get<{ count: number }>(
      `${API}/notifications/unread-count`,
      { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
    );
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

/** Mark a single notification as read. */
export async function markOneRead(token: string, notificationId: string): Promise<void> {
  await axios.patch(
    `${API}/notifications/${notificationId}/read`,
    {},
    { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
  );
}

/** Mark all notifications as read. */
export async function markAllRead(token: string): Promise<void> {
  await axios.patch(
    `${API}/notifications/read-all`,
    {},
    { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
  );
}

/** Register an FCM / APNS device token for push notifications. */
export async function registerDeviceToken(
  token: string,
  deviceToken: string,
  platform: 'web' | 'ios' | 'android',
): Promise<void> {
  await axios.post(
    `${API}/notifications/device-tokens`,
    { deviceToken, platform },
    { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
  );
}
