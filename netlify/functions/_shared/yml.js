/**
 * Node-версія js/salesdrive-yml.js для SSR-функцій.
 * У браузері XML парситься через DOMParser (Web API, немає в Node).
 * Тут — регекс-парсинг: YML-фіди мають досить регулярну структуру,
 * тому це надійно і не додає npm-залежностей. Якщо колись доведеться
 * розбирати справді складний/вкладений XML — варто перейти на
 * бібліотеку (fast-xml-parser), але для плаского списку <offer> цього
 * не потрібно.
 */
import { CATALOG_CONFIG } from './config.js';

let cache = { ts: 0, xml: null };
const CACHE_TTL_MS = 5 * 60 * 1000;

function decodeXmlEntities(str) {
  return (str || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeXmlEntities(m[1].trim()) : '';
}

function allTagValues(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(block)) !== null) out.push(decodeXmlEntities(m[1].trim()));
  return out;
}

function paramValue(block, namePattern) {
  const re = /<param\s+name="([^"]*)">([\s\S]*?)<\/param>/gi;
  let m;
  while ((m = re.exec(block)) !== null) {
    if (namePattern.test(m[1])) return decodeXmlEntities(m[2].trim());
  }
  return '';
}

function colorHex(colorName) {
  const key = (colorName || '').trim().toLowerCase();
  return CATALOG_CONFIG.COLOR_HEX_FALLBACK[key] || CATALOG_CONFIG.COLOR_HEX_DEFAULT;
}

/**
 * Той самий фолбек, що й guessColorFromStem() у js/salesdrive-yml.js —
 * порівнює кожне слово назви офера з основами кольорів (COLOR_NAME_STEMS),
 * щоб покрити випадки на кшталт "SnowStar зелені" без префікса "колір:".
 */
function guessColorFromStem(offerName) {
  const stems = CATALOG_CONFIG.COLOR_NAME_STEMS || {};
  const words = (offerName || '').split(/[^\p{L}'’]+/u).filter(Boolean);
  for (const word of words) {
    const lower = word.toLowerCase();
    for (const [stem, canonical] of Object.entries(stems)) {
      if (lower.startsWith(stem)) return canonical;
    }
  }
  return '';
}

function extractColorName(block, offerName) {
  const fromParam = paramValue(block, /колір|цвет|color/i);
  if (fromParam) return fromParam;
  const match = (offerName || '').match(/колір\s*:?\s*([a-zа-яіїєґ'’-]+)/i);
  if (match) return match[1];
  return guessColorFromStem(offerName);
}

function prepareParentCodes(parentCodes) {
  return (parentCodes || [])
    .map((c) => (c || '').trim())
    .filter((c) => c.length >= CATALOG_CONFIG.YML_MATCH_MIN_CODE_LENGTH)
    .sort((a, b) => b.length - a.length);
}

function resolveParentCode(offerName, sortedParentCodes) {
  const haystack = (offerName || '').toLowerCase();
  const matches = sortedParentCodes.filter((code) => haystack.includes(code.toLowerCase()));
  if (matches.length === 0) return { code: '', ambiguousWith: [] };
  return { code: matches[0], ambiguousWith: matches.slice(1) };
}

function parseOffer(block) {
  const offerName = tagText(block, 'name');
  const colorName = extractColorName(block, offerName);

  const idMatch = block.match(/<offer\b[^>]*\bid="([^"]*)"/i);
  const availableMatch = block.match(/<offer\b[^>]*\bavailable="([^"]*)"/i);
  const available = availableMatch ? availableMatch[1] === 'true' : false;

  const price = parseFloat(tagText(block, 'price')) || 0;
  const oldPriceRaw = tagText(block, 'oldprice');
  const oldPrice = parseFloat(oldPriceRaw) || null;

  const qtyRaw = tagText(block, 'quantity_in_stock') || tagText(block, 'stock_quantity');
  const qty = qtyRaw ? parseInt(qtyRaw, 10) : available ? 1 : 0;

  const photos = allTagValues(block, 'picture').filter(Boolean);

  return {
    crmId: idMatch ? idMatch[1] : '',
    colorName,
    colorHex: colorHex(colorName),
    price,
    oldPrice,
    qty,
    photos,
    name: offerName,
  };
}

export function parseYml(xmlText, parentCodes) {
  const sortedParentCodes = prepareParentCodes(parentCodes);
  const offerBlocks = xmlText.match(/<offer\b[^>]*>[\s\S]*?<\/offer>/gi) || [];
  const map = new Map();

  for (const block of offerBlocks) {
    const offerName = tagText(block, 'name');

    // Той самий фільтр, що й у браузерній версії: позиції з поміткою
    // браку/пошкодження — це не товар для показу на сайті.
    if (/пошкодж/i.test(offerName)) continue;

    const { code: parentCode, ambiguousWith } = resolveParentCode(offerName, sortedParentCodes);
    if (!parentCode) continue;

    if (ambiguousWith.length > 0) {
      console.warn(
        `[yml.js] Неоднозначний збіг для офера "${offerName}": обрано "${parentCode}", ` +
        `але також підходить [${ambiguousWith.join(', ')}].`
      );
    }

    const variant = parseOffer(block);
    if (!map.has(parentCode)) map.set(parentCode, []);
    map.get(parentCode).push(variant);
  }

  return map;
}

export async function fetchYmlVariantsMap(parentCodes, { force = false } = {}) {
  const feedUrl = process.env.SALESDRIVE_YML_URL;
  if (!feedUrl) throw new Error('SALESDRIVE_YML_URL не задано в Netlify env');

  let xml;
  if (!force && cache.xml && Date.now() - cache.ts < CACHE_TTL_MS) {
    xml = cache.xml;
  } else {
    const resp = await fetch(feedUrl);
    if (!resp.ok) throw new Error(`YML feed ${resp.status}`);
    xml = await resp.text();
    cache = { ts: Date.now(), xml };
  }

  return parseYml(xml, parentCodes);
}
