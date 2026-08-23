import { fetchAirtableProducts } from './_shared/airtable.js';

// Той самий SITE_URL, що й у product-page.js — коли зміниш домен,
// онови цю змінну в Netlify env, код чіпати не треба.
const SITE_URL = (process.env.SITE_URL || 'https://max4kids.netlify.app').replace(/\/$/, '');

export async function handler() {
  let products = [];
  try {
    products = await fetchAirtableProducts();
  } catch (err) {
    console.error('sitemap: Airtable fetch failed', err);
    // Навіть якщо Airtable недоступний, віддаємо мапу хоч з головною
    // сторінкою — краще неповний sitemap, ніж 502 на цьому ендпоінті.
  }

  const urls = [
    `<url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...products.map(
      (p) => `<url><loc>${SITE_URL}/product/${p.slug}/</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>`
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    body: xml,
  };
}
