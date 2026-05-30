import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Playfair_Display } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import PwaInit from '@/components/PwaInit';

// Self-host the two brand families. `display: 'swap'` eliminates FOIT and
// drops ~120ms off FCP vs. the previous Google-Fonts @import in globals.css.
// `subsets: ['latin']` keeps the WOFF2 payload small. `preload: true` issues
// an early <link rel="preload"> on the HTML response so the browser starts
// fetching during the critical request.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  preload: true,
});
const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '700', '800', '900'],
  variable: '--font-playfair',
  preload: true,
});

export const metadata: Metadata = {
  title: 'ReligioGram — Book Spiritual Services',
  description: 'Connect with pandits, priests and spiritual guides. Book puja, rituals and consultations.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/logo-icon.svg', type: 'image/svg+xml' },
      { url: '/logo-icon.png', type: 'image/png', sizes: '192x192' },
      { url: '/logo-icon-hires.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/logo-icon.png',
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ReligioGram' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0F2452',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${playfair.variable} font-jakarta`}>
      <body style={{ background: 'var(--color-bg)', fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' }}>
        <ThemeProvider>
          <div className="mx-auto max-w-app min-h-screen relative" style={{ background: 'var(--color-bg)' }}>
            {children}
            {/* PWA service worker init */}
            <PwaInit />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
