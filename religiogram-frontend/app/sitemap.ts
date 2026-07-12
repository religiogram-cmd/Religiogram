import type { MetadataRoute } from 'next';

// Public sitemap consumed by Google / Bing and referenced from
// public/robots.txt. Keep this in sync with the public routes we want
// crawlers to index. Authenticated / provider / consult routes are
// deliberately excluded — see robots.txt Disallow list.
const BASE_URL = 'https://www.religiogram.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: `${BASE_URL}/`,                    lastModified: now, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${BASE_URL}/priests`,             lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${BASE_URL}/astrology`,           lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${BASE_URL}/astrology/browse`,    lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE_URL}/places`,              lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE_URL}/rituals`,             lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE_URL}/rituals?faith=hindu`, lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE_URL}/rituals?faith=muslim`,lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE_URL}/rituals?faith=sikh`,  lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE_URL}/rituals?faith=christian`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/terms`,               lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${BASE_URL}/privacy`,             lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${BASE_URL}/delete-account`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ];
}
