/**
 * Node-версія renderDescription з js/app.js (браузерна версія
 * використовує document.createElement для екранування — тут
 * ручний escapeHtml, бо в Node немає DOM).
 */
export function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderDescription(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  const lines = escaped.split(/\r?\n/);

  let html = '';
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/^[-•]\s+/.test(line)) {
      if (!inList) { html += '<ul class="list-disc pl-5 space-y-1 my-2">'; inList = true; }
      html += `<li>${line.replace(/^[-•]\s+/, '')}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }

    if (line === '') { html += '<div class="h-2"></div>'; continue; }
    html += `<p class="mb-2">${line}</p>`;
  }
  if (inList) html += '</ul>';

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-ink">$1</strong>');
  return html;
}
