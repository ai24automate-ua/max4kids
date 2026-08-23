/**
 * CATALOG MERGE — з'єднує контент (Airtable) з ціною/наявністю (YML)
 * і визначає, чи товар у Stage 1 (ще нема в продажу) чи Stage 2
 * (є ціна, залишок, кольори).
 */
window.CatalogMerge = (function () {
  /**
   * @param {Array} airtableProducts — з AirtableClient.fetchProducts()
   * @param {Map}   ymlMap           — з SalesdriveYml.fetchVariantsMap()
   * @returns {Array} злиті товари з полями variants, stage, canonicalUrl
   */
  function merge(airtableProducts, ymlMap) {
    return airtableProducts.map((p) => {
      const allVariants = ymlMap.get(p.parent_crm_code) || [];
      // "Живі" варіанти — з ціною і наявністю. Якщо фід повернув
      // позиції з ціною 0 або якщо ymlMap взагалі порожня — це Stage 1.
      const liveVariants = allVariants.filter((v) => v.price > 0 && v.qty > 0);
      const stage = liveVariants.length > 0 ? 2 : 1;

      return {
        ...p,
        variants: liveVariants,
        stage,
        // Абсолютний canonical відносно поточного домену — переживе переїзд домену
        canonicalUrl: `${window.location.origin}/${p.slug}`,
      };
    });
  }

  /**
   * Товари з ціною (Stage 2) показуємо вище за товари без ціни (Stage 1).
   * Усередині кожної з двох груп порядок лишається таким, яким він був
   * в Airtable (Array.prototype.sort в сучасних рушіях стабільний —
   * елементи з однаковим пріоритетом не переставляються між собою,
   * тому додатковий "запасний" компаратор за індексом не потрібен).
   */
  function sortByAvailability(products) {
    return [...products].sort((a, b) => {
      const priority = (p) => (p.stage === 2 ? 0 : 1);
      return priority(a) - priority(b);
    });
  }

  /**
   * Розбиває каталог на "перші 4 featured" і "решту" згідно ТЗ:
   * is_featured: true, максимум 4 картки одразу, решта — у згорнутому блоці.
   * У кожній з двох груп товари з ціною сортуються вище за товари без ціни.
   */
  function splitFeatured(products) {
    const featured = products.filter((p) => p.is_featured).slice(0, 4);
    const featuredIds = new Set(featured.map((p) => p.parent_crm_code));
    const rest = products.filter((p) => !featuredIds.has(p.parent_crm_code));
    return {
      featured: sortByAvailability(featured),
      rest: sortByAvailability(rest),
    };
  }

  return { merge, splitFeatured };
})();
