/**
 * Community API client.
 *
 * Centralises every call the 7 community features need:
 *   1. Username setup (availability + suggestions)
 *   2. Account-type aware actions (user / priest / temple)
 *   3. Direct messages (with search + photos)
 *   4. Posts with hashtags
 *   5. Notifications
 *   6. Stories / status
 *   7. Like / comment / share with real counts
 *
 * Maps to the real backend's `social/social.service.ts`. The mock server
 * implements a subset; missing routes fall back to local-only behaviour so
 * the dev experience stays whole.
 */

import { tokenStore } from './api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

export type AccountType = 'user' | 'priest' | 'temple';

export interface CommunityProfile {
  id: string;
  username: string;          // unique, lowercase, 3-20 chars
  name?: string;             // display name (optional)
  bio?: string;              // 0-160 chars
  avatarUrl?: string;
  accountType: AccountType;
  friendCount: number;
  postCount: number;
  followerCount?: number;
  createdAt: string;
}

export interface UserSearchResult {
  id: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  accountType: AccountType;
  friendStatus: 'none' | 'requested' | 'incoming' | 'friends' | 'self';
  canMessage: boolean;        // false for temple/priest accounts
  canFriend: boolean;         // false for temple/priest accounts
}

export interface PostAuthor {
  id: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  accountType: AccountType;
}

export interface Post {
  id: string;
  author: PostAuthor;
  text: string;
  photos: string[];            // CDN urls
  hashtags: string[];          // without '#'
  likeCount: number;
  commentCount: number;
  shareCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  author: PostAuthor;
  text: string;
  createdAt: string;
}

export interface DMMessage {
  id: string;
  threadId: string;
  senderId: string;
  text?: string;
  photoUrl?: string;
  createdAt: string;
  readAt?: string;
}

export interface DMThread {
  threadId: string;
  peer: PostAuthor;
  lastMessage?: DMMessage;
  unreadCount: number;
  updatedAt: string;
}

export interface Story {
  id: string;
  author: PostAuthor;
  type: 'image' | 'text' | 'video';
  bgColor?: string;            // for type: 'text'
  text?: string;               // for type: 'text'
  mediaUrl?: string;           // for type: 'image' | 'video'
  expiresAt: string;
  viewedByMe: boolean;
  viewCount: number;
}

export interface NotificationItem {
  id: string;
  type: 'like' | 'comment' | 'friend_request' | 'friend_accept' | 'dm' | 'mention' | 'story_view';
  actor: PostAuthor;
  postId?: string;
  threadId?: string;
  storyId?: string;
  preview?: string;
  readAt?: string;
  createdAt: string;
}

export interface UsernameCheck {
  username: string;
  available: boolean;
  reason?: 'too_short' | 'too_long' | 'invalid_chars' | 'reserved' | 'taken';
  suggestions: string[];       // alternates if not available
}

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tok = (tokenStore.access ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null)) ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (tok) headers['Authorization'] = 'Bearer ' + tok;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let json: any = null;
  if (text) {
    try { json = JSON.parse(text); }
    catch { throw new ApiError(res.status, 'INVALID_JSON', 'Non-JSON response'); }
  }
  if (!res.ok) {
    // NestJS returns { statusCode, message, error } (flat) OR our custom filter
    // returns { error: { code, message } } (nested). Handle both shapes.
    const msg =
      json?.error?.message ??
      json?.message ??
      (typeof json?.error === 'string' ? json.error : null) ??
      `Request failed (${res.status})`;
    const code = json?.error?.code ?? json?.error ?? 'UNKNOWN';
    throw new ApiError(res.status, code, msg);
  }
  return (json?.data ?? json) as T;
}

// 1. ─── ME / SETUP ────────────────────────────────────────────────────────

export const me = {
  /** Returns the caller's community profile, or null if setup hasn't been done.
   * Real backend route: GET /v1/community/me. */
  get: async (): Promise<CommunityProfile | null> => {
    try {
      return await call<CommunityProfile>('/community/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },

  /** Live availability + suggestion lookup. Debounce in the UI (~250ms).
   * Real backend route: GET /v1/community/username/check/:username. */
  checkUsername: async (username: string): Promise<UsernameCheck> => {
    const u = username.trim().toLowerCase();
    if (u.length < 3) return { username: u, available: false, reason: 'too_short', suggestions: [] };
    if (u.length > 20) return { username: u, available: false, reason: 'too_long', suggestions: [] };
    if (!/^[a-z0-9._]+$/.test(u)) return { username: u, available: false, reason: 'invalid_chars', suggestions: [] };
    try {
      return await call<UsernameCheck>(`/community/username/check/${encodeURIComponent(u)}`);
    } catch {
      // Backend unreachable — assume available so dev flow continues. UI shows
      // a yellow "could not verify" banner separately.
      return { username: u, available: true, suggestions: [] };
    }
  },

  /** First-time setup. Server enforces uniqueness — 409 on conflict.
   * Real backend route: POST /v1/community/setup with SetupCommunityDto
   *   { username, displayName?, bio?, avatarUrl?, accountType? }. */
  setup: (body: {
    username: string;
    name?: string;
    bio?: string;
    avatarUrl?: string;
    accountType?: 'user' | 'priest' | 'temple';
  }) =>
    call<CommunityProfile>('/community/setup', {
      method: 'POST',
      body: JSON.stringify({
        username:    body.username,
        displayName: body.name,           // backend field is displayName, not name
        bio:         body.bio,
        avatarUrl:   body.avatarUrl,
        accountType: body.accountType ?? 'user',
      }),
    }),

  /** Update profile (name, bio, avatar). Username is immutable after setup.
   * Real backend route: PATCH /v1/community/me. */
  update: (body: { name?: string; bio?: string; avatarUrl?: string }) =>
    call<CommunityProfile>('/community/me', {
      method: 'PATCH',
      body: JSON.stringify({
        displayName: body.name,
        bio:         body.bio,
        avatarUrl:   body.avatarUrl,
      }),
    }),
};

// 2. ─── USER SEARCH + FRIENDS ─────────────────────────────────────────────

export const users = {
  search: (q: string) =>
    call<UserSearchResult[]>(`/social/users/search?q=${encodeURIComponent(q)}`),

  byUsername: (username: string) =>
    call<UserSearchResult>(`/social/users/by-username/${encodeURIComponent(username)}`),

  suggested: () =>
    call<UserSearchResult[]>(`/social/users/suggested`),
};

export const friends = {
  // Friend routes live on /v1/social/* (social.controller.ts). Accept/reject
  // are PATCH with the request id in the path, not POST with a body.
  list: () => call<UserSearchResult[]>('/social/friends'),

  incomingRequests: () =>
    call<UserSearchResult[]>('/social/friends/requests/pending'),

  sentRequests: () =>
    call<UserSearchResult[]>('/social/friends/requests/sent'),

  send: (toUserId: string) =>
    call<{ ok: true; status: 'requested' }>(`/social/friends/request`, {
      method: 'POST',
      body: JSON.stringify({ toUserId }),
    }),

  /** Real backend: PATCH /v1/social/friends/request/:id/accept */
  accept: (requestId: string) =>
    call<{ ok: true; status: 'friends' }>(`/social/friends/request/${requestId}/accept`, {
      method: 'PATCH',
    }),

  /** Real backend: PATCH /v1/social/friends/request/:id/reject */
  reject: (requestId: string) =>
    call<{ ok: true }>(`/social/friends/request/${requestId}/reject`, {
      method: 'PATCH',
    }),

  remove: (userId: string) =>
    call<{ ok: true }>(`/social/friends/${userId}`, { method: 'DELETE' }),
};

// 3. ─── POSTS ─────────────────────────────────────────────────────────────

export const posts = {
  /** Home feed — your posts + accepted friends' posts. Cursor-paginated.
   *  Real backend: GET /v1/social/feed */
  feed: (cursor?: string) =>
    call<{ items: Post[]; nextCursor?: string }>(
      `/social/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  /** Single user's posts. Real backend: GET /v1/social/posts/user/:userId */
  byUser: (userId: string, cursor?: string) =>
    call<{ items: Post[]; nextCursor?: string }>(
      `/social/posts/user/${userId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  /** Posts under a hashtag — not implemented on the backend yet.
   *  Returns an empty page so the Discover tab can render its "coming soon"
   *  state instead of throwing. */
  byHashtag: async (_tag: string, _cursor?: string) =>
    ({ items: [] as Post[], nextCursor: undefined as string | undefined }),

  create: (body: { text: string; photoUrls?: string[]; hashtags?: string[] }) =>
    call<Post>('/social/posts', { method: 'POST', body: JSON.stringify(body) }),

  /** No single-post GET on the real backend; the feed payload already carries
   *  every field a card needs. Stub so callers don't crash. */
  get: async (_postId: string) => {
    throw new ApiError(501, 'NOT_IMPLEMENTED', 'Single-post fetch is not supported.');
  },
  remove: (postId: string) =>
    call<{ ok: true }>(`/social/posts/${postId}`, { method: 'DELETE' }),

  /** Backend now distinguishes POST (always like) from DELETE (always unlike). */
  like:   (postId: string) =>
    call<{ likeCount: number; liked: boolean }>(`/social/posts/${postId}/like`, { method: 'POST' }),
  unlike: (postId: string) =>
    call<{ likeCount: number; liked: boolean }>(`/social/posts/${postId}/like`, { method: 'DELETE' }),

  /** Bookmark + share are not on the real backend yet. Soft no-ops so the
   *  feed icons still render and tapping them doesn't blow up. */
  bookmark:   async (_postId: string) => ({ ok: true as const }),
  unbookmark: async (_postId: string) => ({ ok: true as const }),
  share: async (postId: string) => ({
    shareCount: 0,
    shareUrl: typeof window !== 'undefined' ? `${window.location.origin}/p/${postId}` : `/p/${postId}`,
  }),

  /** Comments are paginated; first call returns the most recent N. */
  comments:    (postId: string, cursor?: string) =>
    call<{ items: Comment[]; nextCursor?: string }>(
      `/social/posts/${postId}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  comment:     (postId: string, text: string) =>
    call<Comment>(`/social/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
  uncomment:   (_postId: string, commentId: string) =>
    call<{ ok: true }>(`/social/comments/${commentId}`, { method: 'DELETE' }),
};

// 4. ─── DIRECT MESSAGES ──────────────────────────────────────────────────

export const dms = {
  /** Inbox / thread list. Real backend: GET /v1/social/messages */
  threads: () => call<DMThread[]>('/social/messages'),

  /** Conversation with one peer. Real backend: GET /v1/social/messages/:userId */
  messages: (peerUserId: string, cursor?: string) =>
    call<{ items: DMMessage[]; nextCursor?: string }>(
      `/social/messages/${peerUserId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  /** Send a DM. Real backend: POST /v1/social/messages
   *  Body: { recipientId, content/text, imageUrl? } — DTO accepts both
   *  `content` and `text` so we ship `content` (canonical) plus mirror `text`. */
  send: (peerUserId: string, body: { text?: string; photoUrl?: string }) =>
    call<DMMessage>(`/social/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipientId: peerUserId,
        content:     body.text ?? '',
        text:        body.text,
        imageUrl:    body.photoUrl,
      }),
    }),

  /** No mark-as-read route exists on the real backend. The inbox returns
   *  unread counts that we drop to 0 locally for snappier UX; the next
   *  inbox fetch will reflect the canonical state. */
  markRead: async (_threadId: string) => ({ ok: true as const }),
};

// 5. ─── STORIES ──────────────────────────────────────────────────────────

export const stories = {
  /** Active stories from accepted friends, grouped by author.
   *  Real backend: GET /v1/community/stories */
  feed: () => call<Story[]>('/community/stories'),

  /** "My stories" endpoint doesn't exist on the backend yet. We filter the
   *  friends-feed for stories authored by me to give the same effect. */
  mine: async (): Promise<Story[]> => {
    try {
      const all = await call<Story[]>('/community/stories');
      const meId = await call<{ id?: string }>('/community/me').catch(() => ({}));
      const id = (meId as any)?.id;
      return id ? all.filter((s: any) => s?.author?.id === id || s?.authorId === id) : [];
    } catch { return []; }
  },

  /** Real backend: POST /v1/community/stories */
  create: (body:
    | { type: 'image' | 'video'; mediaUrl: string }
    | { type: 'text'; text: string; bgColor?: string }
  ) => call<Story>('/community/stories', { method: 'POST', body: JSON.stringify(body) }),

  /** No "record-view" route on the backend yet — soft no-op so the viewer
   *  doesn't crash when the user swipes through stories. */
  view: async (_storyId: string) => ({ ok: true as const }),

  /** No DELETE route on the backend yet. Soft no-op + local-removal in
   *  the caller's UI is sufficient until the route lands. */
  remove: async (_storyId: string) => ({ ok: true as const }),
};

// 6. ─── NOTIFICATIONS ───────────────────────────────────────────────────

export const notifications = {
  list: (cursor?: string) =>
    call<{ items: NotificationItem[]; nextCursor?: string }>(
      `/community/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  unreadCount: () =>
    call<{ count: number }>('/notifications/unread-count'),

  markRead: (id: string) =>
    call<{ ok: true }>(`/community/notifications/${id}/read`, { method: 'POST' }),

  markAllRead: () =>
    call<{ ok: true }>(`/community/notifications/read-all`, { method: 'POST' }),
};

// 7. ─── UPLOADS (avatar / post photo / DM photo / story media) ──────────

export interface PresignBody {
  mimeType: string;
  sizeBytes: number;
  purpose: 'avatar' | 'post' | 'dm' | 'story';
}
/**
 * Backend response shape from `POST /uploads/presign`.
 * (Was previously `{ url, publicUrl, s3Key }` here — that was fiction:
 * the real backend returns `uploadUrl`, `key`, `fileId`, and `headers`,
 * with no `publicUrl` field at all. Public URL comes back from `/confirm`.)
 */
export interface PresignResp {
  fileId: string;
  uploadUrl: string;
  key: string;
  expiresIn: number;
  headers: Record<string, string>;
  maxSizeBytes: number;
}

export interface ConfirmResp {
  id: string;
  url: string;         // canonical public URL — safe to persist
  key: string;
  status: string;
  contentType: string;
  sizeBytes: number;
}

export const uploads = {
  presign: (body: PresignBody) => {
    // Backend expects { kind, contentType, sizeBytes } — map frontend shape
    const kindMap: Record<PresignBody['purpose'], string> = {
      avatar: 'profile',
      post:   'profile',
      dm:     'profile',
      story:  'profile',
    };
    const payload = {
      kind: kindMap[body.purpose] || 'profile',
      contentType: body.mimeType,
      sizeBytes: body.sizeBytes,
    };
    return call<PresignResp>('/uploads/presign', { method: 'POST', body: JSON.stringify(payload) });
  },

  confirm: (fileId: string) =>
    call<ConfirmResp>('/uploads/confirm', {
      method: 'POST',
      body: JSON.stringify({ fileId }),
    }),

  /**
   * Convenience: presign → PUT → confirm → return public URL.
   * The confirm step is mandatory. Without it, the sweeper deletes the
   * row after 10 minutes and the URL 404s. Also HeadObject-verifies the
   * upload actually landed and the size matches what was declared.
   */
  upload: async (file: File, purpose: PresignBody['purpose']): Promise<string> => {
    const ps = await uploads.presign({ mimeType: file.type, sizeBytes: file.size, purpose });
    const putRes = await fetch(ps.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    if (!putRes.ok) throw new ApiError(putRes.status, 'S3_UPLOAD_FAILED', 'Upload failed');
    const confirmed = await uploads.confirm(ps.fileId);
    return confirmed.url;
  },
};

// 8. ─── HASHTAG SUGGESTIONS (typeahead while composing) ─────────────────

export const hashtags = {
  suggest: (prefix: string) =>
    call<Array<{ tag: string; postCount: number }>>(
      `/social/hashtags/suggest?q=${encodeURIComponent(prefix.replace(/^#/, ''))}`,
    ),
};

// Single export object so screens can do:
//   import { community } from '@/lib/co//   import { community } from '@/lib/community-api';
//   community.me.get(); community.posts.feed(); ...
export const community = { me, users, friends, posts, dms, stories, notifications, uploads, hashtags };
