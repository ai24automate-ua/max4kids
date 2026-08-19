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
        mainImage:
          stage === 2 && liveVariants[0]?.photos?.[0]
            ? liveVariants[0].photos[0]
            : p.default_photo,
      };
    });
  }

  /**
   * Розбиває каталог на "перші 4 featured" і "решту" згідно ТЗ:
   * is_featured: true, максимум 4 картки одразу, решта — у згорнутому блоці.
   */
  function splitFeatured(products) {
    const featured = products.filter((p) => p.is_featured).slice(0, 4);
    const featuredIds = new Set(featured.map((p) => p.parent_crm_code));
    const rest = products.filter((p) => !featuredIds.has(p.parent_crm_code));
    return { featured, rest };
  }

  return { merge, splitFeatured };
})();
