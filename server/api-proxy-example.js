/**
 * ПРИКЛАД бекенд-проксі для /api/products і /api/feed.
 * Запускається окремо від статичного index.html (Node/Express тут,
 * але так само легко переноситься у Vercel/Netlify Function або
 * Cloudflare Worker — головне, що токен ЖИВЕ ТІЛЬКИ ТУТ, у env).
 *
 * Встановлення:
 *   npm i express node-fetch
 *   AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=app... node server/api-proxy-example.js
 *
 * ВАЖЛИВО: якщо цей токен колись світився в чаті/логах/скріншотах —
 * перевипусти його в Airtable перед тим, як ставити в продакшн.
 */
const express = require('express');
const fetch = require('node-fetch');

const app = express();

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Products';
const YML_FEED_URL = process.env.SALESDRIVE_YML_URL;

let ymlCache = { ts: 0, xml: null };
const YML_CACHE_TTL_MS = 5 * 60 * 1000;

// ---- /api/products: проксі до Airtable, з пагінацією ----
app.get('/api/products', async (req, res) => {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return res.status(500).json({ error: 'AIRTABLE_TOKEN / AIRTABLE_BASE_ID не задані на сервері' });
  }

  try {
    let allRecords = [];
    let offset = undefined;

    do {
      const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`);
      if (offset) url.searchParams.set('offset', offset);

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      });

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Airtable ${resp.status}: ${body}`);
      }

      const json = await resp.json();
      allRecords = allRecords.concat(json.records || []);
      offset = json.offset;
    } while (offset);

    // Невеликий кеш на самому проксі теж не завадить (тут пропущено
    // для стислості — у продакшні додай той самий TTL-кеш, що й для YML).
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ records: allRecords });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Airtable proxy failed' });
  }
});

// ---- /api/feed: проксі + кеш до YML Salesdrive ----
app.get('/api/feed', async (req, res) => {
  if (!YML_FEED_URL) {
    return res.status(500).json({ error: 'SALESDRIVE_YML_URL не задано на сервері' });
  }

  const now = Date.now();
  if (ymlCache.xml && now - ymlCache.ts < YML_CACHE_TTL_MS) {
    res.set('Content-Type', 'application/xml');
    return res.send(ymlCache.xml);
  }

  try {
    const resp = await fetch(YML_FEED_URL);
    if (!resp.ok) throw new Error(`YML feed ${resp.status}`);
    const xml = await resp.text();

    ymlCache = { ts: now, xml };
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error(err);
    // Якщо є старий кеш — краще віддати його, ніж повний фейл
    if (ymlCache.xml) {
      res.set('Content-Type', 'application/xml');
      return res.send(ymlCache.xml);
    }
    res.status(502).json({ error: 'YML proxy failed' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API proxy listening on :${PORT}`));
