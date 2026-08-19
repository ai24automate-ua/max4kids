/**
 * Netlify Function: /api/products (редірект з netlify.toml на /.netlify/functions/products)
 * Токен НІКОЛИ не потрапляє в браузер — читається тільки тут, з env.
 * Env-змінні задаються в Netlify UI: Site settings -> Environment variables.
 */
export async function handler() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'Products';

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
        throw new Error(`Airtable ${resp.status}: ${errText}`);
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
