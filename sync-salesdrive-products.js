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
      parseNodeValue: true,
      parseAttributeValue: true,
      trimValues: true,
    });

    const parsedData = parser.parse(xmlData);
    const rawOffers = parsedData?.yml_catalog?.shop?.offers?.offer || [];

    // Приводимо товари до зручного масиву
    const rawProducts = Array.isArray(rawOffers) ? rawOffers : [rawOffers];

    // Допоміжна функція для отримання значення тегу (на випадок вкладених об'єктів #text)
    const getTextValue = (val) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object' && val['#text'] !== undefined) return String(val['#text']);
      return String(val);
    };

    // Форматуємо дані товарів
    const cleanProducts = rawProducts
      .filter((item) => item && typeof item === 'object' && Object.keys(item).length > 0)
      .map((item) => {
        const isAvailable = item['@_available'] === 'true' || item['@_available'] === true;
        const priceNum = item.price ? Number(getTextValue(item.price)) : 0;

        return {
          id: item['@_id'] ? String(item['@_id']) : null,
          available: isAvailable,
          name: getTextValue(item.name),
          price: isNaN(priceNum) ? 0 : priceNum,
          currency: getTextValue(item.currencyId) || 'UAH',
          categoryId: item.categoryId ? String(item.categoryId) : null,
          picture: item.picture ? (Array.isArray(item.picture) ? item.picture[0] : getTextValue(item.picture)) : null,
          vendor: getTextValue(item.vendor),
          description: getTextValue(item.description),
          url: getTextValue(item.url),
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