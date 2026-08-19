/**
 * AIRTABLE CLIENT — контентне ядро каталогу.
 * Фронтенд НІКОЛИ не звертається до api.airtable.com напряму —
 * тільки до свого /api/products, який на бекенді підставляє токен.
 */
window.AirtableClient = (function () {
  const CACHE_KEY = 'catalog:airtable:v1';

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > window.CATALOG_CONFIG.CACHE_TTL_MS) return null;
      return data;
    } catch {
      return null;
    }
  }

  function writeCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      /* sessionStorage може бути недоступний (приватний режим) — не критично */
    }
  }

  /**
   * Нормалізує сирий запис Airtable у плоский об'єкт з дефолтами,
   * щоб решта коду не думала про record.fields.X щоразу.
   */
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
      default_photo: f.default_photo || null,
      seo_title: f.seo_title || f.title || 'Без назви',
      meta_description: f.meta_description || f.short_description || '',
      meta_keywords: f.meta_keywords || '',
    };
  }

  /**
   * Завантажує всі продукти. Очікує від /api/products відповідь
   * у форматі Airtable REST API: { records: [{ id, fields }, ...] }
   * Бекенд відповідає за пагінацію (offset) — фронтенд отримує вже
   * повний список.
   */
  async function fetchProducts({ force = false } = {}) {
    if (!force) {
      const cached = readCache();
      if (cached) return cached;
    }

    const res = await fetch(window.CATALOG_CONFIG.AIRTABLE_ENDPOINT, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Airtable proxy error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    const records = Array.isArray(json.records) ? json.records : [];
    const products = records.map(normalize).filter((p) => p.parent_crm_code);

    writeCache(products);
    return products;
  }

  return { fetchProducts };
})();
