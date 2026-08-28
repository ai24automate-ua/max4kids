/**
 * Netlify Function: /api/order (редірект з netlify.toml на /.netlify/functions/order)
 * Приймає POST із форми замовлення на сайті (js/app.js -> submitOrder())
 * і створює заявку в SalesDrive через офіційний метод API "Додавання заявок":
 * https://salesdrive.ua/knowledge/api/order-add-api/
 *
 * Ключ форми НІКОЛИ не потрапляє в браузер — читається тільки тут, з env,
 * так само як AIRTABLE_TOKEN і SALESDRIVE_YML_URL зараз.
 *
 * Env-змінні (Netlify -> Site settings -> Environment variables):
 *   SALESDRIVE_DOMAIN     піддомен кабінету, напр. "yourcompany" або повний
 *                          "yourcompany.salesdrive.me" — обидва варіанти ок.
 *   SALESDRIVE_FORM_KEY    ключ форми з кабінету SalesDrive (Установки ->
 *                          Загальні налаштування і інтеграції -> Інші
 *                          сервіси -> API -> Додавання заявок).
 */
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const domainRaw = process.env.SALESDRIVE_DOMAIN;
  const formKey = process.env.SALESDRIVE_FORM_KEY;

  if (!domainRaw || !formKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'SALESDRIVE_DOMAIN / SALESDRIVE_FORM_KEY не задані в Netlify env' }),
    };
  }

  const domain = domainRaw.includes('.') ? domainRaw : `${domainRaw}.salesdrive.me`;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Невалідний JSON у тілі запиту' }) };
  }

  const { name, phone, email, mode, product } = payload;

  // Мінімальна серверна валідація — форма на сайті вже вимагає name/phone,
  // але не довіряємо клієнту, бо ендпоінт публічний.
  if (!name || typeof name !== 'string' || !phone || typeof phone !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: "Поля 'name' і 'phone' обов'язкові" }) };
  }

  // SalesDrive очікує products[].id — це має збігатись з id товару в
  // самому SalesDrive. Оскільки YML-фід, з якого сайт бере ціни/залишки,
  // сам генерується SalesDrive, crmId з offerEl (js/salesdrive-yml.js)
  // це і є той самий id товару в CRM — підставляємо як є.
  const salesdriveBody = {
    form: formKey,
    getResultData: '1',
    fName: name.trim(),
    phone: phone.trim(),
    email: (email || '').trim(),
    products: product
      ? [
          {
            id: product.crmId || '',
            name: [product.title, product.colorName].filter(Boolean).join(' — '),
            costPerItem: product.price != null ? String(product.price) : '',
            amount: '1',
          },
        ]
      : [],
    comment:
      mode === 'notify'
        ? 'Заявка "Повідомити про надходження" з сайту (товару ще немає в наявності)'
        : 'Заявка з сайту (кнопка "Купити")',
    sajt: 'max4kids',
  };

  try {
    const resp = await fetch(`https://${domain}/handler/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(salesdriveBody),
    });

    const resultText = await resp.text();
    let result = null;
    try { result = JSON.parse(resultText); } catch { /* SalesDrive іноді віддає порожнє тіло при помилці */ }

    if (!resp.ok || (result && result.success === false)) {
      console.error('SalesDrive order-add failed:', resp.status, resultText);
      return { statusCode: 502, body: JSON.stringify({ error: 'SalesDrive proxy failed' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, orderId: result?.data?.orderId || null }),
    };
  } catch (err) {
    console.error('order.js: SalesDrive request failed', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'SalesDrive proxy failed' }) };
  }
}
