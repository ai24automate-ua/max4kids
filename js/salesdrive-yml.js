/**
 * SALESDRIVE YML CLIENT — динамічний шар: ціни, залишки, кольори.
 * Фронтенд читає YML через власний /api/feed (бекенд качає та
 * кешує XML на своєму боці — прямий fetch у браузера на чужий
 * домен майже завжди впаде в CORS).
 *
 * Повертає Map<parent_crm_code, Variant[]>, де Variant:
 * { crmId, colorName, colorHex, price, oldPrice, qty, photos: string[], name }
 */
window.SalesdriveYml = (function () {
  const CACHE_KEY = 'catalog:yml:v1';

  function readCache(cacheKey) {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > window.CATALOG_CONFIG.CACHE_TTL_MS) return null;
      // Map не серіалізується напряму — відновлюємо з масиву пар
      return new Map(data);
    } catch {
      return null;
    }
  }

  function writeCache(cacheKey, map) {
    try {
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ ts: Date.now(), data: Array.from(map.entries()) })
      );
    } catch {
      /* ignore */
    }
  }

  function text(el, selector) {
    const node = el.querySelector(selector);
    return node ? node.textContent.trim() : '';
  }

  function colorHex(colorName) {
    const cfg = window.CATALOG_CONFIG;
    const key = (colorName || '').trim().toLowerCase();
    return cfg.COLOR_HEX_FALLBACK[key] || cfg.COLOR_HEX_DEFAULT;
  }

  /**
   * Колір спершу шукаємо в структурованому <param>, а якщо його
   * немає — витягуємо з тексту назви за патерном "колір: XXX"
   * (саме так це виглядає в реальних назвах Salesdrive, напр.
   * "...Мрія 2025 колір: рожевий рейки-рожево-ванільні ТМ Veloz" —
   * бере лише перше слово після "колір:", решту тексту ігнорує).
   */
  function extractColorName(offerEl, offerName) {
    const params = Array.from(offerEl.querySelectorAll('param'));
    const colorParam = params.find((p) =>
      /колір|цвет|color/i.test(p.getAttribute('name') || '')
    );
    if (colorParam) return colorParam.textContent.trim();

    const match = (offerName || '').match(/колір\s*:?\s*([a-zа-яіїєґ'’-]+)/i);
    return match ? match[1] : '';
  }

  /**
   * Готує список parent_crm_code з Airtable, відсортований від
   * найдовшого до найкоротшого — так при підрядковому пошуку
   * спершу перевіряється більш специфічний код ("Мрія 2025" раніше
   * за "Мрія"), що знижує ризик хибного збігу.
   */
  function prepareParentCodes(parentCodes) {
    const cfg = window.CATALOG_CONFIG;
    return (parentCodes || [])
      .map((c) => (c || '').trim())
      .filter((c) => c.length >= cfg.YML_MATCH_MIN_CODE_LENGTH)
      .sort((a, b) => b.length - a.length);
  }

  /**
   * Визначає parent_crm_code для конкретного <offer>, залежно від
   * налаштованої стратегії матчингу (див. config.js).
   */
  function resolveParentCode(offerEl, offerName, sortedParentCodes) {
    const cfg = window.CATALOG_CONFIG;

    if (cfg.YML_MATCH_STRATEGY === 'param') {
      const params = Array.from(offerEl.querySelectorAll('param'));
      const match = params.find(
        (p) => p.getAttribute('name') === cfg.YML_MATCH_PARAM_NAME
      );
      return { code: match ? match.textContent.trim() : '', ambiguousWith: [] };
    }

    if (cfg.YML_MATCH_STRATEGY === 'vendorCode-prefix') {
      const vendorCode = text(offerEl, 'vendorCode');
      if (!vendorCode) return { code: '', ambiguousWith: [] };
      const sep = cfg.YML_VENDOR_CODE_SEPARATOR;
      const code = vendorCode.includes(sep) ? vendorCode.split(sep)[0] : vendorCode;
      return { code, ambiguousWith: [] };
    }

    // 'name-contains' (дефолт): шукаємо, які parent_crm_code входять
    // як підрядок у назву офера. Список уже відсортований від
    // найдовшого коду до найкоротшого.
    const haystack = (offerName || '').toLowerCase();
    const matches = sortedParentCodes.filter((code) =>
      haystack.includes(code.toLowerCase())
    );

    if (matches.length === 0) return { code: '', ambiguousWith: [] };
    return { code: matches[0], ambiguousWith: matches.slice(1) };
  }

  function parseOffer(offerEl) {
    const offerName = text(offerEl, 'name');
    const colorName = extractColorName(offerEl, offerName);

    const price = parseFloat(text(offerEl, 'price')) || 0;
    const oldPriceRaw = text(offerEl, 'oldprice') || text(offerEl, 'oldPrice');
    const oldPrice = parseFloat(oldPriceRaw) || null;

    const available = offerEl.getAttribute('available') === 'true';
    const qtyRaw = text(offerEl, 'quantity_in_stock') || text(offerEl, 'stock_quantity');
    // Якщо явного лічильника немає, орієнтуємось на available="true"
    const qty = qtyRaw ? parseInt(qtyRaw, 10) : available ? 1 : 0;

    const photos = Array.from(offerEl.querySelectorAll('picture'))
      .map((p) => p.textContent.trim())
      .filter(Boolean);

    return {
      crmId: offerEl.getAttribute('id') || '',
      colorName,
      colorHex: colorHex(colorName),
      price,
      oldPrice,
      qty,
      photos,
      name: offerName,
    };
  }

  function parseYml(xmlText, parentCodes) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error('YML parse error: невалідний XML від Salesdrive');
    }

    const sortedParentCodes = prepareParentCodes(parentCodes);
    const offers = Array.from(doc.querySelectorAll('offer'));
    const map = new Map();

    for (const offerEl of offers) {
      const offerName = text(offerEl, 'name');
      const { code: parentCode, ambiguousWith } = resolveParentCode(
        offerEl,
        offerName,
        sortedParentCodes
      );
      if (!parentCode) continue;

      if (ambiguousWith.length > 0) {
        console.warn(
          `[SalesdriveYml] Неоднозначний збіг для офера "${offerName}": ` +
          `обрано "${parentCode}", але також підходить [${ambiguousWith.join(', ')}]. ` +
          `Зроби parent_crm_code в Airtable специфічнішим, якщо це неправильний вибір.`
        );
      }

      const variant = parseOffer(offerEl);
      if (!map.has(parentCode)) map.set(parentCode, []);
      map.get(parentCode).push(variant);
    }

    return map;
  }

  async function fetchVariantsMap(parentCodes, { force = false } = {}) {
    const cacheKey = CACHE_KEY + ':' + (parentCodes || []).slice().sort().join('|');

    if (!force) {
      const cached = readCache(cacheKey);
      if (cached) return cached;
    }

    const res = await fetch(window.CATALOG_CONFIG.YML_ENDPOINT, {
      headers: { Accept: 'application/xml' },
    });

    if (!res.ok) {
      throw new Error(`YML proxy error: ${res.status} ${res.statusText}`);
    }

    const xmlText = await res.text();
    const map = parseYml(xmlText, parentCodes);
    writeCache(cacheKey, map);
    return map;
  }

  return { fetchVariantsMap, parseYml };
})();
