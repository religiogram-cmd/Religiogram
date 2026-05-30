'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';
import { useAuthStore } from '@/lib/store';
import {
  getNotifications,
  markAllRead,
  markOneRead,
  type Notification,
} from '@/lib/notifications-api';

const TYPE_ICONS: Record<string, string> = {
  booking: '🗓️',
  message: '💬',
  review: '⭐',
  payment: '💳',
  system: '🔔',
};

function getIcon(type: string): string {
  for (const key of Object.keys(TYPE_ICONS)) {
    if (type.toLowerCase().includes(key)) return TYPE_ICONS[key];
  }
  return '🔔';
}

function getDateGroup(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return 'Earlier';
}

function NotificationItem({
  notif,
  onRead,
}: {
  notif: Notification;
  onRead?: (id: string) => void;
}) {
  return (
    <div
      onClick={() => !notif.isRead && onRead?.(notif.id)}
      className={`flex gap-3 px-4 py-3.5 bg-white transition-colors ${
        !notif.isRead ? 'border-l-[3px] border-l-saffron-500 cursor-pointer active:bg-gray-50' : ''
      }`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg ${
        !notif.isRead ? 'bg-saffron-50' : 'bg-gray-50'
      }`}>
        {getIcon(notif.type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-tight ${!notif.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
            {notif.title}
          </p>
          {!notif.isRead && (
            <span className="w-2 h-2 rounded-full bg-saffron-500 flex-shrink-0 mt-1" />
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
          {notif.body}
        </p>
        <p className="text-[10px] text-gray-400 mt-1">
          {formatDistanceToNow(parseISO(notif.createdAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

function SkeletonItem() {
  return (
    <div className="flex gap-3 px-4 py-3.5 bg-white animate-pulse">
      <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1">
        <div className="h-3.5 bg-gray-200 rounded w-2/3 mb-2" />
        <div className="h-3 bg-gray-200 rounded w-full mb-1" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { accessToken } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [marking, setMarking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchInitial = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const result = await getNotifications(accessToken);
      setNotifications(result.items);
      setNextCursor(result.nextCursor);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const fetchMore = useCallback(async () => {
    if (!accessToken || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await getNotifications(accessToken, nextCursor);
      setNotifications((prev: any) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [accessToken, nextCursor, loadingMore]);

  useEffect(() => {
    fetchInitial();
  }, [accessToken]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor) {
          fetchMore();
        }
      },
      { threshold: 0.1 }
    );
    if (bottomRef.current) observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [nextCursor, fetchMore]);

  const handleMarkAllRead = async () => {
    if (!accessToken || marking) return;
    setMarking(true);
    try {
      await markAllRead(accessToken);
      setNotifications((prev: any) => prev.map((n: any) => ({ ...n, isRead: true })));
    } catch {
      // silently fail
    } finally {
      setMarking(false);
    }
  };

  const handleMarkOneRead = useCallback(async (id: string) => {
    if (!accessToken) return;
    // Optimistic update
    setNotifications((prev: any) =>
      prev.map((n: any) => n.id === id ? { ...n, isRead: true } : n)
    );
    try {
      await markOneRead(accessToken, id);
    } catch {
      // Revert optimistic update on failure
      setNotifications((prev: any) =>
        prev.map((n: any) => n.id === id ? { ...n, isRead: false } : n)
      );
    }
  }, [accessToken]);

  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  // Group notifications
  const grouped = notifications.reduce<{ group: string; items: Notification[] }[]>((acc: any, notif: any) => {
    const group = getDateGroup(notif.createdAt);
    const existing = acc.find((g: any) => g.group === group);
    if (existing) {
      existing.items.push(notif);
    } else {
      acc.push({ group, items: [notif] });
    }
    return acc;
  }, []);

  // Preserve Today > Yesterday > Earlier order
  const ORDER = ['Today', 'Yesterday', 'Earlier'];
  grouped.sort((a: any, b: any) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));

  return (
    <div className="min-h-screen bg-parchment-100">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-parchment-100/95 backdrop-blur-sm px-4 pt-12 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="section-title text-xl">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={marking}
              className="text-xs font-semibold text-saffron-500 active:opacity-70 transition-opacity"
            >
              {marking ? 'Marking...' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      <div className="pb-24">
        {loading ? (
          <div className="bg-white mt-2 divide-y divide-gray-50">
            {[1, 2, 3, 4, 5].map((i) => <SkeletonItem key={i} />)}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-6">
            <div className="text-5xl mb-4">🔔</div>
            <p className="font-cinzel font-semibold text-sacred-700 text-base mb-1">
              No notifications yet
            </p>
            <p className="text-sm text-gray-500">
              Booking updates, messages and alerts will appear here
            </p>
          </div>
        ) : (
          <div className="mt-2">
            {grouped.map(({ group, items }: { group: string; items: Notification[] }) => (
              <div key={group}>
                <div className="px-4 py-2 bg-parchment-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{group}</p>
                </div>
                <div className="bg-white divide-y divide-gray-50 shadow-sm">
                  {items.map((notif) => (
                    <NotificationItem key={notif.id} notif={notif} onRead={handleMarkOneRead} />
                  ))}
                </div>
              </div>
            ))}

            {/* Load more sentinel */}
            <div ref={bottomRef} className="py-4 flex justify-center">
              {loadingMore && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Loading more...
                </div>
              )}
              {!nextCursor && notifications.length > 0 && !loadingMore && (
                <p className="text-xs text-gray-300">You&apos;re all caught up</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
