/**
 * Public landing page at `/` — Server Component.
 *
 * Split into two pieces so we get the best of both worlds:
 *   • This file is a Server Component → it can export `metadata` and
 *     stream JSON-LD structured data into the initial HTML for crawlers
 *     (Google, Bing, GPTBot, ClaudeBot, PerplexityBot).
 *   • `./LandingClient` is the Client Component that carries every
 *     interactive piece (hero video autoplay, tokenStore auth check,
 *     mobile-vs-desktop media switching).
 *
 * Do NOT add `'use client'` here — that would blow away the metadata
 * export and the JSON-LD scripts and Next would silently drop them.
 */

import type { Metadata } from 'next';
import LandingClient from './LandingClient';

const SITE_URL = 'https://www.religiogram.com';

// Route-level metadata overrides. Root layout supplies the site-wide
// defaults; these narrow the copy to the landing page specifically so
// SERPs and social-card previews render the marketing pitch, not the
// generic app description.
export const metadata: Metadata = {
  title:
    'ReligioGram — Book Verified Pandits, Priests & Astrologers Online in India',
  description:
    "India's trusted multi-faith spiritual services marketplace. Verified Pandits, Imams, Granthis, Christian Priests. Live astrology, holy places, Kundli — all in one app.",
  alternates: { canonical: '/' },
  openGraph: {
    title:
      'ReligioGram — Book Verified Pandits, Priests & Astrologers Online in India',
    description:
      "India's trusted multi-faith spiritual services marketplace. Verified Pandits, Imams, Granthis, Christian Priests. Live astrology, holy places, Kundli — all in one app.",
    url: SITE_URL,
    siteName: 'ReligioGram',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'ReligioGram — Book Verified Pandits, Priests & Astrologers',
      },
    ],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title:
      'ReligioGram — Book Verified Pandits, Priests & Astrologers Online in India',
    description:
      "India's trusted multi-faith spiritual services marketplace. Verified Pandits, Imams, Granthis, Christian Priests. Live astrology, holy places, Kundli — all in one app.",
    images: ['/og-image.jpg'],
  },
};

/* ─────────────────────────  JSON-LD structured data  ─────────────────────────
 * Each JSON-LD block is emitted as a plain <script type="application/ld+json">
 * next to the page body. Crawlers pick these up on the raw HTML response —
 * they do NOT wait for the client bundle to hydrate. Keep the JSON strictly
 * valid: no trailing commas, no comments inside the string, no unescaped
 * quotes. Serialising a JS object with JSON.stringify handles all of that
 * automatically. */

const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'ReligioGram',
  url: SITE_URL,
  logo: `${SITE_URL}/logo-icon-hires.png`,
  sameAs: [],
  contactPoint: [
    {
      '@type': 'ContactPoint',
      email: 'support@religiogram.com',
      contactType: 'customer support',
      areaServed: 'IN',
      availableLanguage: ['en', 'hi'],
    },
  ],
};

const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ReligioGram',
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
};

const webApplicationLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'ReligioGram',
  url: SITE_URL,
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Android',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'INR',
  },
};

// A single ItemList that enumerates the platform's primary Service offerings.
// Keeps each Service crawler-visible while staying inside one JSON-LD block
// (fewer network parses, easier for LLMs to consume as a coherent list).
const servicesLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'ReligioGram services',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      item: {
        '@type': 'Service',
        name: 'Priest Booking',
        description:
          'Book verified Pandits, Imams, Granthis and Christian Priests for pujas, weddings, funerals and religious ceremonies at home or venue.',
        provider: { '@type': 'Organization', name: 'ReligioGram' },
        areaServed: 'IN',
      },
    },
    {
      '@type': 'ListItem',
      position: 2,
      item: {
        '@type': 'Service',
        name: 'Astrology Consultation',
        description:
          'Live chat, voice, and video consultations with verified astrologers. Per-minute billing via wallet.',
        provider: { '@type': 'Organization', name: 'ReligioGram' },
        areaServed: 'IN',
      },
    },
    {
      '@type': 'ListItem',
      position: 3,
      item: {
        '@type': 'Service',
        name: 'Holy Places Directory',
        description:
          'Discover temples, mosques, gurudwaras and churches across India with photos, reviews and directions.',
        provider: { '@type': 'Organization', name: 'ReligioGram' },
        areaServed: 'IN',
      },
    },
    {
      '@type': 'ListItem',
      position: 4,
      item: {
        '@type': 'Service',
        name: 'Puja & Rituals',
        description:
          'Catalog of Hindu, Muslim, Sikh, and Christian rituals with pricing, duration, and priest availability.',
        provider: { '@type': 'Organization', name: 'ReligioGram' },
        areaServed: 'IN',
      },
    },
    {
      '@type': 'ListItem',
      position: 5,
      item: {
        '@type': 'Service',
        name: 'Kundli Matching',
        description:
          'Free automated birth-chart generation, kundli matching and daily horoscope predictions.',
        provider: { '@type': 'Organization', name: 'ReligioGram' },
        areaServed: 'IN',
      },
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <LandingClient />

      {/*
        JSON-LD blocks. React allows a plain <script> element with
        dangerouslySetInnerHTML in Server Components — Next streams the raw
        string into the HTML response, so search-engine crawlers see the
        structured data on the first byte, no JS execution required.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(servicesLd) }}
      />
    </>
  );
}
