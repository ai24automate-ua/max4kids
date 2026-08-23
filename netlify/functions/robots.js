// Той самий SITE_URL, що й у product-page.js/sitemap.js — коли зміниш
// домен, онови env-змінну в Netlify, код чіпати не треба.
const SITE_URL = (process.env.SITE_URL || 'https://max4kids.netlify.app').replace(/\/$/, '');

export async function handler() {
  const body = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    body,
  };
}
