/**
 * Tests for components/social/PostCard.tsx
 *
 * Mocks @/lib/api to control socialApi behaviour.
 * PostCard is the default export.
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  socialApi: {
    toggleLike:  jest.fn(),
    getComments: jest.fn(),
    addComment:  jest.fn(),
    deletePost:  jest.fn(),
  },
}));

import PostCard from './PostCard';
import { socialApi } from '@/lib/api';

const toggleLikeMock  = socialApi.toggleLike  as jest.Mock;
const getCommentsMock = socialApi.getComments as jest.Mock;
const addCommentMock  = socialApi.addComment  as jest.Mock;
const deletePostMock  = socialApi.deletePost  as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePost(overrides: Record<string, any> = {}) {
  return {
    id: 'post-1',
    caption: 'Om Namah Shivaya',
    imageUrls: [],
    likesCount: 10,
    commentsCount: 3,
    isLiked: false,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    author: { id: 'user-1', fullName: 'Arjun Sharma', avatarUrl: null, role: 'user' as const },
    ...overrides,
  };
}

function makeComment(id: string, content: string) {
  return {
    id,
    postId: 'post-1',
    content,
    createdAt: new Date().toISOString(),
    author: { id: 'u-2', fullName: 'Priya Singh', avatarUrl: null, role: 'user' as const },
  };
}

// ── setup ─────────────────────────────────────────────────────────────────────

describe('PostCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    toggleLikeMock.mockResolvedValue({ liked: true });
    getCommentsMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    addCommentMock.mockImplementation((_id: string, content: string) =>
      Promise.resolve(makeComment('new-c', content)),
    );
    deletePostMock.mockResolvedValue(undefined);
    window.confirm = jest.fn(() => true);
  });

  // ── Author info ───────────────────────────────────────────────────────────

  it('renders the author full name', () => {
    render(<PostCard post={makePost()} />);
    expect(screen.getByText('Arjun Sharma')).toBeInTheDocument();
  });

  it('renders "User" when author is null', () => {
    render(<PostCard post={makePost({ author: null })} />);
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  // ── Avatar ────────────────────────────────────────────────────────────────

  it('renders initials when no avatarUrl ("Arjun Sharma" → "AS")', () => {
    render(<PostCard post={makePost()} />);
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('renders <img> when avatarUrl is provided', () => {
    const post = makePost({ author: { id: 'u-1', fullName: 'Arjun', avatarUrl: 'https://cdn.example.com/a.jpg' } });
    render(<PostCard post={post} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.example.com/a.jpg');
  });

  it('renders single-word initials correctly ("Krishna" → "K")', () => {
    render(<PostCard post={makePost({ author: { id: 'u-1', fullName: 'Krishna', avatarUrl: null, role: 'user' as const } })} />);
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  // ── Caption ───────────────────────────────────────────────────────────────

  it('renders caption text', () => {
    render(<PostCard post={makePost()} />);
    expect(screen.getByText('Om Namah Shivaya')).toBeInTheDocument();
  });

  it('does not render caption element when caption is null', () => {
    render(<PostCard post={makePost({ caption: null })} />);
    expect(screen.queryByText('Om Namah Shivaya')).not.toBeInTheDocument();
  });

  // ── Images ────────────────────────────────────────────────────────────────

  it('renders images when imageUrls is non-empty', () => {
    const { container } = render(<PostCard post={makePost({ imageUrls: ['https://cdn.example.com/photo.jpg'] })} />);
    // Post images use alt="" so their ARIA role is "presentation"; select by tag + src
    const img = container.querySelector('img[src="https://cdn.example.com/photo.jpg"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('photo.jpg');
  });

  it('renders no images when imageUrls is empty and no avatarUrl', () => {
    render(<PostCard post={makePost({ imageUrls: [] })} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  // ── timeAgo ───────────────────────────────────────────────────────────────

  it('shows "just now" for a very recent post', () => {
    const post = makePost({ createdAt: new Date(Date.now() - 10_000).toISOString() });
    render(<PostCard post={post} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('shows "Xm ago" for a post a few minutes ago', () => {
    const post = makePost({ createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() });
    render(<PostCard post={post} />);
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('shows "Xh ago" for a post a few hours ago', () => {
    const post = makePost({ createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString() });
    render(<PostCard post={post} />);
    expect(screen.getByText('3h ago')).toBeInTheDocument();
  });

  it('shows "Xd ago" for a post a few days ago', () => {
    const post = makePost({ createdAt: new Date(Date.now() - 2 * 86400 * 1000).toISOString() });
    render(<PostCard post={post} />);
    expect(screen.getByText('2d ago')).toBeInTheDocument();
  });

  // ── Like counts ───────────────────────────────────────────────────────────

  it('displays initial likesCount', () => {
    render(<PostCard post={makePost({ likesCount: 42 })} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  // ── Optimistic like toggle ────────────────────────────────────────────────

  it('increments like count immediately on click (optimistic)', async () => {
    render(<PostCard post={makePost({ likesCount: 10, isLiked: false })} />);
    const likeBtn = screen.getByText('10').closest('button')!;
    await act(async () => { fireEvent.click(likeBtn); });
    expect(screen.getByText('11')).toBeInTheDocument();
  });

  it('decrements like count when already liked (toggle off)', async () => {
    render(<PostCard post={makePost({ likesCount: 10, isLiked: true })} />);
    const likeBtn = screen.getByText('10').closest('button')!;
    await act(async () => { fireEvent.click(likeBtn); });
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('rolls back like count on API error', async () => {
    toggleLikeMock.mockRejectedValueOnce(new Error('network'));
    render(<PostCard post={makePost({ likesCount: 10, isLiked: false })} />);
    const likeBtn = screen.getByText('10').closest('button')!;
    await act(async () => { fireEvent.click(likeBtn); });
    await waitFor(() => expect(screen.getByText('10')).toBeInTheDocument());
  });

  it('calls socialApi.toggleLike with the post id', async () => {
    render(<PostCard post={makePost({ id: 'post-99' })} />);
    await act(async () => { fireEvent.click(screen.getByText('10').closest('button')!); });
    expect(toggleLikeMock).toHaveBeenCalledWith('post-99');
  });

  // ── Comment toggle ────────────────────────────────────────────────────────

  it('shows comment section after clicking comment button', async () => {
    render(<PostCard post={makePost()} />);
    await act(async () => { fireEvent.click(screen.getByText('3').closest('button')!); });
    expect(await screen.findByText('Be the first to comment')).toBeInTheDocument();
  });

  it('hides comment section after toggling closed', async () => {
    render(<PostCard post={makePost()} />);
    const commentBtn = () => screen.getByText('3').closest('button')!;
    await act(async () => { fireEvent.click(commentBtn()); });   // open
    expect(screen.getByText('Be the first to comment')).toBeInTheDocument();
    await act(async () => { fireEvent.click(commentBtn()); });   // close
    expect(screen.queryByText('Be the first to comment')).not.toBeInTheDocument();
  });

  it('renders fetched comments', async () => {
    getCommentsMock.mockResolvedValueOnce({ items: [makeComment('c-1', 'Jai Shree Ram!')], total: 1, page: 1, limit: 20 });
    render(<PostCard post={makePost()} />);
    await act(async () => { fireEvent.click(screen.getByText('3').closest('button')!); });
    expect(await screen.findByText('Jai Shree Ram!')).toBeInTheDocument();
  });

  it('calls getComments with post id on first open', async () => {
    render(<PostCard post={makePost({ id: 'post-77' })} />);
    await act(async () => { fireEvent.click(screen.getByText('3').closest('button')!); });
    expect(getCommentsMock).toHaveBeenCalledWith('post-77');
  });

  it('does NOT call getComments again on second toggle (lazy, cached)', async () => {
    // Return 1 comment so comments.length > 0 after the first fetch;
    // the condition !showComments && comments.length === 0 is then false on re-open.
    getCommentsMock.mockResolvedValueOnce({
      items: [makeComment('c-seed', 'First comment')],
      total: 1, page: 1, limit: 20,
    });
    render(<PostCard post={makePost()} />);
    const commentBtn = () => screen.getByText('3').closest('button')!;
    await act(async () => { fireEvent.click(commentBtn()); });   // open (fetches)
    await act(async () => { fireEvent.click(commentBtn()); });   // close
    await act(async () => { fireEvent.click(commentBtn()); });   // open again (no fetch)
    expect(getCommentsMock).toHaveBeenCalledTimes(1);
  });

  // ── Comment submission ────────────────────────────────────────────────────

  it('adds a comment via send button', async () => {
    render(<PostCard post={makePost()} />);
    await act(async () => { fireEvent.click(screen.getByText('3').closest('button')!); });
    const input = await screen.findByPlaceholderText('Write a comment…');
    fireEvent.change(input, { target: { value: 'Beautiful!' } });
    const sendBtn = input.nextSibling as HTMLElement;
    await act(async () => { fireEvent.click(sendBtn); });
    expect(addCommentMock).toHaveBeenCalledWith('post-1', 'Beautiful!');
    expect(await screen.findByText('Beautiful!')).toBeInTheDocument();
  });

  it('adds a comment via Enter key', async () => {
    render(<PostCard post={makePost()} />);
    await act(async () => { fireEvent.click(screen.getByText('3').closest('button')!); });
    const input = await screen.findByPlaceholderText('Write a comment…');
    fireEvent.change(input, { target: { value: 'Har Har Mahadev' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(addCommentMock).toHaveBeenCalledWith('post-1', 'Har Har Mahadev');
  });

  it('clears input after successful comment submission', async () => {
    render(<PostCard post={makePost()} />);
    await act(async () => { fireEvent.click(screen.getByText('3').closest('button')!); });
    const input = await screen.findByPlaceholderText('Write a comment…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Hello' } });
    await act(async () => { fireEvent.click(input.nextSibling as HTMLElement); });
    await waitFor(() => expect(input.value).toBe(''));
  });

  // ── Delete button (owner-only) ────────────────────────────────────────────

  it('shows delete button when currentUserId matches post author id', () => {
    render(<PostCard post={makePost()} currentUserId="user-1" />);
    // Delete button is the only button with a <polyline> inside its SVG
    const deleteBtn = screen.getAllByRole('button').find(
      btn => !!btn.querySelector('svg polyline')
    );
    expect(deleteBtn).toBeDefined();
  });

  it('does NOT show delete button when currentUserId does not match', () => {
    render(<PostCard post={makePost()} currentUserId="other-user" />);
    const deleteBtn = screen.getAllByRole('button').find(
      btn => !!btn.querySelector('svg polyline')
    );
    expect(deleteBtn).toBeUndefined();
  });

  it('does NOT show delete button when currentUserId is absent', () => {
    render(<PostCard post={makePost()} />);
    const deleteBtn = screen.getAllByRole('button').find(
      btn => !!btn.querySelector('svg polyline')
    );
    expect(deleteBtn).toBeUndefined();
  });

  it('calls socialApi.deletePost and onDelete when confirmed', async () => {
    const onDelete = jest.fn();
    render(<PostCard post={makePost({ id: 'post-42' })} currentUserId="user-1" onDelete={onDelete} />);
    const deleteBtn = screen.getAllByRole('button').find(
      btn => !!btn.querySelector('svg polyline')
    )!;
    await act(async () => { fireEvent.click(deleteBtn); });
    expect(deletePostMock).toHaveBeenCalledWith('post-42');
    expect(onDelete).toHaveBeenCalledWith('post-42');
  });

  it('does NOT delete when confirm is cancelled', async () => {
    window.confirm = jest.fn(() => false);
    const onDelete = jest.fn();
    render(<PostCard post={makePost()} currentUserId="user-1" onDelete={onDelete} />);
    const deleteBtn = screen.getAllByRole('button').find(
      btn => !!btn.querySelector('svg polyline')
    )!;
    await act(async () => { fireEvent.click(deleteBtn); });
    expect(deletePostMock).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  // ── onProfilePress ────────────────────────────────────────────────────────

  it('calls onProfilePress with author id when avatar button is clicked', () => {
    const onProfilePress = jest.fn();
    render(<PostCard post={makePost()} onProfilePress={onProfilePress} />);
    // First button in author row is the avatar button
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onProfilePress).toHaveBeenCalledWith('user-1');
  });
});
