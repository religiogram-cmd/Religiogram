'use client';
import dynamic from 'next/dynamic';

const HomeScreen = dynamic(
  () => import('@/components/home/HomeScreen'),
  {
    ssr: false,
    loading: () => (
      <div style={{ minHeight: '100svh', background: '#FDF6E3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(200,146,10,0.2)', borderTopColor: '#C8920A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    ),
  }
);

export default function HomePage() {
  return <HomeScreen />;
}
