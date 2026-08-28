import { fetchAirtableProducts } from './_shared/airtable.js';
import { fetchYmlVariantsMap } from './_shared/yml.js';
import { renderDescription, escapeHtml } from './_shared/render-description.js';

const BRAND = {
  name: 'Max4Kids',
  // Реальний домен читається з env SITE_URL — коли купиш max4kids.com.ua,
  // просто онови цю змінну в Netlify (Site configuration -> Environment
  // variables) і задеплой заново. Код чіпати не треба.
  siteUrl: (process.env.SITE_URL || 'https://max4kids.netlify.app').replace(/\/$/, ''),
};

function pageNotFound() {
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Товар не знайдено — ${BRAND.name}</title></head><body><p>Товар не знайдено. <a href="/">Повернутись у каталог</a></p></body></html>`,
  };
}

export async function handler(event) {
  const slug = event.queryStringParameters?.slug;
  if (!slug) return pageNotFound();

  let airtableProducts;
  let ymlMap;

  try {
    airtableProducts = await fetchAirtableProducts();
  } catch (err) {
    console.error('product-page: Airtable fetch failed', err);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: '<p>Тимчасова помилка завантаження даних. Спробуйте оновити сторінку.</p>',
    };
  }

  const product = airtableProducts.find((p) => p.slug === slug);
  if (!product) return pageNotFound();

  try {
    ymlMap = await fetchYmlVariantsMap(airtableProducts.map((p) => p.parent_crm_code));
  } catch (err) {
    console.error('product-page: YML fetch failed, показуємо як Stage 1', err);
    ymlMap = new Map();
  }

  const allVariants = ymlMap.get(product.parent_crm_code) || [];
  const liveVariants = allVariants.filter((v) => v.price > 0 && v.qty > 0);
  const stage = liveVariants.length > 0 ? 2 : 1;

  // Вибір кольору без JS — через query-параметр ?color=INDEX (звичайне
  // посилання, нова відповідь сервера). Працює і для краулера, і для
  // людини з вимкненим JS, і як прогресивне покращення для решти.
  const requestedColorIdx = parseInt(event.queryStringParameters?.color, 10);
  const colorIdx = Number.isInteger(requestedColorIdx) && liveVariants[requestedColorIdx]
    ? requestedColorIdx
    : 0;
  const activeVariant = stage === 2 ? liveVariants[colorIdx] : null;

  const canonicalUrl = `${BRAND.siteUrl}/product/${product.slug}/`;

  // Якщо товар Stage 2 (є ціна/залишок), але жоден "живий" варіант з
  // YML не приніс фото (Salesdrive іноді віддає offer без <picture>) —
  // падаємо назад на default_photo з Airtable, а не показуємо порожню
  // галерею. Той самий фолбек, що й у cardImage()/detailsGalleryPhotos()
  // в js/app.js.
  let photos;
  if (stage === 2) {
    if (activeVariant?.photos?.length) {
      photos = activeVariant.photos;
    } else {
      const withPhoto = liveVariants.find((v) => v.photos?.length);
      photos = withPhoto ? withPhoto.photos : (product.default_photo ? [product.default_photo] : []);
    }
  } else {
    photos = product.default_photo ? [product.default_photo] : [];
  }

  const priceHtml = stage === 2
    ? `${activeVariant.price} ₴${activeVariant.oldPrice ? ` <span style="text-decoration:line-through;color:#9aa5ad;font-weight:400;">${activeVariant.oldPrice} ₴</span>` : ''}`
    : 'Ціну буде уточнено';

  const availability = stage === 2 ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder';
  const ctaHref = stage === 2
    ? `${BRAND.siteUrl}/?openOrder=${encodeURIComponent(product.slug)}`
    : `${BRAND.siteUrl}/?notify=${encodeURIComponent(product.slug)}`;
  const ctaLabel = stage === 2 ? 'Купити' : 'Повідомити про надходження';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.short_description || product.meta_description,
    image: photos.length ? photos : undefined,
    url: canonicalUrl,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'UAH',
      price: stage === 2 ? activeVariant.price : '0',
      availability,
      url: canonicalUrl,
    },
  };

  const colorSwitcherHtml = stage === 2 && liveVariants.length > 1
    ? `<div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap;">
        ${liveVariants.map((v, i) => `
          <a href="?color=${i}" title="${escapeHtml(v.colorName)}"
             style="width:32px;height:32px;border-radius:999px;display:inline-block;
                    border:2px solid ${i === colorIdx ? '#1C2B39' : '#fff'};
                    box-shadow:0 0 0 1px #e2e8ee;background:${v.colorHex};"></a>
        `).join('')}
      </div>`
    : '';

  const galleryHtml = photos.length
    ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px;">
        ${photos.map((src, i) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(product.title)} фото ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" style="width:100%;aspect-ratio:${i === 0 ? '16/9' : '1/1'};object-fit:cover;border-radius:12px;grid-column:${i === 0 ? '1 / -1' : 'auto'};">`).join('')}
      </div>`
    : `<div style="aspect-ratio:16/9;background:#eef2f4;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#9aa5ad;margin-bottom:20px;">Фото буде додано</div>`;

  const videoHtml = product.video_youtube_id
    ? `<div style="aspect-ratio:16/9;border-radius:12px;overflow:hidden;margin-bottom:20px;">
        <iframe src="https://www.youtube.com/embed/${escapeHtml(product.video_youtube_id)}" title="Відео огляд" style="width:100%;height:100%;border:0;" loading="lazy" allowfullscreen></iframe>
      </div>`
    : '';

  const html = `<!doctype html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(product.seo_title)}</title>
<meta name="description" content="${escapeHtml(product.meta_description)}">
${product.meta_keywords ? `<meta name="keywords" content="${escapeHtml(product.meta_keywords)}">` : ''}
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="product">
<meta property="og:title" content="${escapeHtml(product.seo_title)}">
<meta property="og:description" content="${escapeHtml(product.meta_description)}">
${photos[0] ? `<meta property="og:image" content="${escapeHtml(photos[0])}">` : ''}
<meta property="og:url" content="${canonicalUrl}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  body { font-family: 'Manrope', system-ui, sans-serif; color:#1C2B39; background:#fff; max-width:720px; margin:0 auto; padding:24px 16px 64px; line-height:1.5; }
  a { color:#00BBFF; }
  h1 { font-size:1.6rem; margin:0 0 12px; }
  .price { font-size:1.5rem; font-weight:800; margin:16px 0; }
  .cta { display:inline-block; background:#FF914C; color:#fff; font-weight:700; padding:12px 24px; border-radius:999px; text-decoration:none; }
  .back { display:inline-block; margin-top:32px; font-size:.9rem; }
</style>
</head>
<body>
  <p><a href="${BRAND.siteUrl}/">← ${escapeHtml(BRAND.name)}</a></p>
  ${galleryHtml}
  <h1>${escapeHtml(product.title)}</h1>
  ${colorSwitcherHtml}
  <div class="price">${priceHtml}</div>
  <a class="cta" href="${ctaHref}">${escapeHtml(ctaLabel)}</a>
  ${videoHtml}
  <div>${renderDescription(product.description)}</div>
  <a class="back" href="${BRAND.siteUrl}/">← Повернутись до всього каталогу</a>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
    body: html,
  };
}
