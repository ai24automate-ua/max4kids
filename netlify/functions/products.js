/**
 * Netlify Function: /api/products (редірект з netlify.toml на /.netlify/functions/products)
 * Токен НІКОЛИ не потрапляє в браузер — читається тільки тут, з env.
 * Env-змінні задаються в Netlify UI: Site settings -> Environment variables.
 */
export async function handler() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'Products';

  // ТИМЧАСОВА ДІАГНОСТИКА (нічого секретного не показує):
  // довжина токена і точні значення baseId/tableName в лапках,
  // щоб побачити приховані пробіли чи порожні змінні.
  console.log('DEBUG env check:', {
    tokenPresent: !!token,
    tokenLength: token ? token.length : 0,
    tokenStartsWithPat: token ? token.startsWith('pat') : false,
    tokenHasWhitespace: token ? /\s/.test(token) : false,
    baseId: JSON.stringify(baseId),
    tableName: JSON.stringify(tableName),
  });

  if (!token || !baseId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'AIRTABLE_TOKEN / AIRTABLE_BASE_ID не задані в Netlify env' }),
    };
  }

  try {
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
        throw new Error(`Airtable ${resp.status} for URL ${url.toString()}: ${errText}`);
      }

      const json = await resp.json();
      allRecords = allRecords.concat(json.records || []);
      offset = json.offset;
    } while (offset);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
      body: JSON.stringify({ records: allRecords }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Airtable proxy failed' }) };
  }
}
