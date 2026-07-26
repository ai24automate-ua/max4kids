import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

async function syncProducts() {
  const url = process.env.SALESDRIVE_YML_URL;

  if (!url) {
    console.error('ПОМИЛКА: Секрет SALESDRIVE_YML_URL не знайдено в налаштуваннях GitHub!');
    process.exit(1);
  }

  try {
    console.log('Завантаження YML даних з SalesDrive...');
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Не вдалося завантажити YML: ${response.statusText}`);
    }

    const xmlData = await response.text();

    // Налаштовуємо парсер XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const parsedData = parser.parse(xmlData);
    const offers = parsedData?.yml_catalog?.shop?.offers?.offer || [];

    // Приводимо товари до зручного масиву (на випадок, якщо товар лише один або їх багать)
    const rawProducts = Array.isArray(offers) ? offers : [offers];

    // Форматуємо дані товарів
    const cleanProducts = rawProducts
      .filter((item) => item && Object.keys(item).length > 0) // відсіюємо порожні тести
      .map((item) => {
        return {
          id: item['@_id'] || null,
          available: item['@_available'] === 'true',
          name: item.name || '',
          price: item.price ? Number(item.price) : 0,
          currency: item.currencyId || 'UAH',
          categoryId: item.categoryId || null,
          picture: item.picture || null,
          vendor: item.vendor || '',
          description: item.description || '',
          url: item.url || '',
        };
      });

    // Зберігаємо у products.json
    fs.writeFileSync('products.json', JSON.stringify(cleanProducts, null, 2), 'utf-8');
    console.log(`Успішно оновлено! Збережено товарів: ${cleanProducts.length}`);
  } catch (error) {
    console.error('Помилка під час синхронізації:', error.message);
    process.exit(1);
  }
}

syncProducts();