function catalogApp() {
  return {
    // ---- стан завантаження ----
    loading: true,
    loadError: null,

    // ---- дані ----
    featured: [],
    rest: [],
    selectedVariantIdx: {}, // { [parent_crm_code]: idx }

    // ---- UI ----
    expanded: false,
    detailsOpen: false,
    detailsProduct: null,
    orderOpen: false,
    orderMode: 'buy', // 'buy' | 'notify'
    orderProduct: null,
    justSubmitted: false,
    form: { name: '', phone: '', email: '' },
    ctaPhone: '',
    faqOpen: null,
    showSticky: false,

    faq: [
      { q: 'Скільки часу займає доставка?', a: 'Зазвичай 1–3 дні по всій Україні. Відправка Новою Поштою.' },
      { q: 'Чи можна оплатити при отриманні?', a: 'Так, доступна оплата готівкою або карткою при отриманні.' },
      { q: 'Яку вагу витримують санки?', a: 'Залежно від моделі — від 50 до 120 кг, деталі в описі кожної моделі.' },
      { q: 'Чи є гарантія на санки?', a: 'Так, гарантія 24 місяці на раму та кріплення полозків.' },
      { q: 'Чи можна повернути або обміняти товар?', a: 'Так, протягом 14 днів за умови збереження товарного вигляду.' },
    ],

    async init() {
      await this.loadCatalog();

      window.addEventListener('scroll', () => {
        this.showSticky = window.scrollY > 480;
      }, { passive: true });
    },

    async loadCatalog({ force = false } = {}) {
      this.loading = true;
      this.loadError = null;
      try {
        const airtableProducts = await window.AirtableClient.fetchProducts({ force });
        const parentCodes = airtableProducts.map((p) => p.parent_crm_code);

        // YML не критичний для першого рендеру: якщо він впав,
        // каталог все одно показується як Stage 1 (контент з Airtable).
        const ymlMap = await window.SalesdriveYml.fetchVariantsMap(parentCodes, { force }).catch((err) => {
          console.error('YML fetch failed, falling back to Stage 1 for all products:', err);
          return new Map();
        });

        const merged = window.CatalogMerge.merge(airtableProducts, ymlMap);
        const { featured, rest } = window.CatalogMerge.splitFeatured(merged);

        this.featured = featured;
        this.rest = rest;

        // дефолтний обраний варіант — перший "живий" колір, якщо є
        [...featured, ...rest].forEach((p) => {
          this.selectedVariantIdx[p.parent_crm_code] = 0;
        });
      } catch (err) {
        console.error('Catalog load failed:', err);
        this.loadError = 'Не вдалося завантажити каталог. Спробуйте оновити сторінку.';
      } finally {
        this.loading = false;
      }
    },

    // ---- допоміжні геттери для картки ----
    activeVariant(p) {
      if (!p.variants.length) return null;
      const idx = this.selectedVariantIdx[p.parent_crm_code] || 0;
      return p.variants[idx] || p.variants[0];
    },

    cardImage(p) {
      const v = this.activeVariant(p);
      return (v && v.photos && v.photos[0]) || p.default_photo;
    },

    priceLabel(p) {
      if (p.stage === 1) return 'Ціну буде уточнено';
      const v = this.activeVariant(p);
      return v ? `${v.price} ₴` : 'Ціну буде уточнено';
    },

    oldPriceLabel(p) {
      const v = this.activeVariant(p);
      return v && v.oldPrice ? `${v.oldPrice} ₴` : null;
    },

    ctaLabel(p) {
      return p.stage === 1 ? 'Повідомити про надходження' : 'Купити';
    },

    minPriceLabel() {
      const all = [...this.featured, ...this.rest];
      const prices = all
        .map((p) => this.activeVariant(p))
        .filter(Boolean)
        .map((v) => v.price)
        .filter((price) => price > 0);
      if (prices.length === 0) return 'Каталог';
      return Math.min(...prices) + ' ₴';
    },

    selectColor(p, idx) {
      this.selectedVariantIdx[p.parent_crm_code] = idx;
    },

    // ---- модалка "детальніше" ----
    openDetails(p) {
      this.detailsProduct = p;
      this.detailsOpen = true;
      this.updateSeoForProduct(p);
    },

    closeDetails() {
      this.detailsOpen = false;
      this.resetSeo();
    },

    /**
     * ВАЖЛИВО: це client-side оновлення <title>/meta для UX і
     * шерингу під час взаємодії з модалкою. Це НЕ замінює
     * серверний SEO. Google виконує JS з затримкою й не завжди
     * довіряє canonical/meta, вставленим через JS — для повної
     * індексації карток товарів потрібні або окремі SSR/prerendered
     * сторінки на /{slug}, або статична генерація (SSG) під час білда.
     * Тримати SEO-логіку тільки в Alpine — недостатньо, якщо позиції
     * в пошуку критичні.
     */
    updateSeoForProduct(p) {
      document.title = p.seo_title || p.title;
      let metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', p.meta_description || '');
      let canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute('href', p.canonicalUrl);
    },

    resetSeo() {
      document.title = 'Max4Kids — Преміальні санки для дітей та родини | Доставка по Україні';
      let metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', 'Max4Kids — преміальні дитячі санки з ергономічною спинкою, гарантією 24 місяці та доставкою Новою Поштою за 1-3 дні.');
      let canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute('href', `${window.location.origin}/`);
    },

    // ---- модалка замовлення ----
    openOrder(p) {
      this.orderProduct = p || null;
      this.orderMode = p && p.stage === 1 ? 'notify' : 'buy';
      this.justSubmitted = false;
      this.orderOpen = true;
    },

    closeOrder() {
      this.orderOpen = false;
    },

    submitOrder() {
      const v = this.orderProduct ? this.activeVariant(this.orderProduct) : null;
      const payload = {
        mode: this.orderMode,
        name: this.form.name,
        phone: this.form.phone,
        email: this.form.email,
        product: this.orderProduct
          ? {
              parent_crm_code: this.orderProduct.parent_crm_code,
              title: this.orderProduct.title,
              crmId: v ? v.crmId : null,
              colorName: v ? v.colorName : null,
              price: v ? v.price : null,
            }
          : null,
      };

      // TODO: замінити на реальний виклик бекенду
      // (CRM / Telegram-бот / Google Sheet). Не постити напряму
      // в сторонні сервіси з клієнта, якщо це вимагає секретів.
      console.log('order submitted:', payload);

      this.justSubmitted = true;
      setTimeout(() => { this.orderOpen = false; }, 1600);
    },

    // ---- каталог: розгортання ----
    toggleExpand() {
      this.expanded = !this.expanded;
      if (this.expanded) {
        this.$nextTick(() => {
          const el = document.getElementById('extra-models');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    },

    formatPhone(e, key) {
      let digits = e.target.value.replace(/\D/g, '');
      if (digits.startsWith('380')) digits = digits.slice(3);
      digits = digits.slice(0, 9);
      let out = '+380';
      if (digits.length > 0) out += ' ' + digits.slice(0, 2);
      if (digits.length > 2) out += ' ' + digits.slice(2, 5);
      if (digits.length > 5) out += ' ' + digits.slice(5, 7);
      if (digits.length > 7) out += ' ' + digits.slice(7, 9);
      this[key] = out;
      if (this.form && key === 'phone') this.form.phone = out;
      if (key === 'ctaPhone') this.ctaPhone = out;
    },
  };
}
