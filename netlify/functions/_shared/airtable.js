/**
 * Node-версія AirtableClient (js/airtable-client.js), для SSR-функцій.
 * Кешується в пам'яті процесу функції на короткий час — Netlify
 * перевикористовує "теплі" інстанси функції між викликами, тому
 * кеш реально економить запити до Airtable API (ліміт 5 req/sec
 * на базу), не вимагаючи зовнішнього сховища.
 */
let cache = { ts: 0, products: null };
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 хв — компроміс між свіжістю і навантаженням

function extractPhotoUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) {
    return value[0].url || value[0]?.thumbnails?.large?.url || null;
  }
  return null;
}

function normalize(record) {
  const f = record.fields || {};
  return {
    airtableId: record.id,
    title: f.title || 'Без назви',
    slug: f.slug || record.id,
    parent_crm_code: (f.parent_crm_code || '').trim(),
    is_featured: !!f.is_featured,
    short_description: f.short_description || '',
    description: f.description || f.short_description || '',
    video_youtube_id: f.video_youtube_id || null,
    default_photo: extractPhotoUrl(f.default_photo),
    seo_title: f.seo_title || f.title || 'Без назви',
    meta_description: f.meta_description || f.short_description || '',
    meta_keywords: f.meta_keywords || '',
  };
}

export async function fetchAirtableProducts({ force = false } = {}) {
  if (!force && cache.products && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.products;
  }

  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'Products';

  if (!token || !baseId) {
    throw new Error('AIRTABLE_TOKEN / AIRTABLE_BASE_ID не задані в Netlify env');
  }

  let allRecords = [];
  let offset;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    if (offset) url.searchParams.set('offset', offset);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Airtable ${resp.status}: ${errText}`);
    }

    const json = await resp.json();
    allRecords = allRecords.concat(json.records || []);
    offset = json.offset;
  } while (offset);

  const products = allRecords.map(normalize).filter((p) => p.parent_crm_code);
  cache = { ts: Date.now(), products };
  return products;
}
