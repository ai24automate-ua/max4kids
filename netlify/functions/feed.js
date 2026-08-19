/**
 * Netlify Function: /api/feed (редірект з netlify.toml на /.netlify/functions/feed)
 * Качає YML на сервері Netlify, а не в браузері — так обходимо CORS,
 * бо Salesdrive не віддає заголовки, дозволені для fetch з чужого домену.
 */
exports.handler = async function () {
  const feedUrl = process.env.SALESDRIVE_YML_URL;

  if (!feedUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'SALESDRIVE_YML_URL не задано в Netlify env' }),
    };
  }

  try {
    const resp = await fetch(feedUrl);
    if (!resp.ok) throw new Error(`YML feed ${resp.status}`);
    const xml = await resp.text();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=300' },
      body: xml,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 502, body: JSON.stringify({ error: 'YML proxy failed' }) };
  }
};
