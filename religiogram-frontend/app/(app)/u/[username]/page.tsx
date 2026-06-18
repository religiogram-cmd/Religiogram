import UserProfileScreen from '@/components/community/UserProfileScreen';

export default function UserProfilePage({ params }: { params: { username: string } }) {
  return <UserProfileScreen username={params.username} />;
}
