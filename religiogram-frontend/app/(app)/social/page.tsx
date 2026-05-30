'use client';

/**
 * /social — the Community route.
 *
 * The legacy implementation (Feed/Discover/Requests/Messages with its own
 * design) has been superseded by the redesigned CommunityScreen which
 * matches the supplied mockup. This page is now a thin wrapper so the
 * BottomNav's "Community" link lands on the right surface.
 */

import CommunityScreen from '@/components/community/CommunityScreen';

export default function SocialPage() {
  return <CommunityScreen />;
}
