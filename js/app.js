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
    orderSubmitting: false,
    orderError: null,
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

    // Стек назв відкритих модалок ("details", "order") — потрібен, щоб
    // апаратна/жестова кнопка "назад" на мобільному закривала модалку,
    // а не одразу виводила користувача з сайту. Кожне відкриття модалки
    // додає запис в історію браузера; закриття (хрестиком, тапом по
    // фону чи Escape) виконує history.back(), а фактичне закриття
    // модалки відбувається вже у відповідь на подію popstate — так
    // апаратна кнопка "назад" і кнопка "×" в інтерфейсі поводяться
    // однаково і не розсинхронізовують історію.
    _openModals: [],

    async init() {
      await this.loadCatalog();

      window.addEventListener('scroll', () => {
        this.showSticky = window.scrollY > 480;
      }, { passive: true });

      window.addEventListener('popstate', () => {
        const name = this._openModals.pop();
        if (name === 'details') { this.detailsOpen = false; this.resetSeo(); }
        if (name === 'order') { this.orderOpen = false; }
      });

      // SSR-сторінка товару (/product/{slug}/) веде сюди з ?openOrder=slug
      // або ?notify=slug — одразу відкриваємо потрібну форму для цього товару.
      const params = new URLSearchParams(window.location.search);
      const targetSlug = params.get('openOrder') || params.get('notify');
      if (targetSlug) {
        // Прибираємо параметр з адресного рядка ДО відкриття модалки:
        // openOrder() сам додає запис в історію для кнопки "назад", і
        // якщо чистити URL вже після цього, старий запис (з параметром)
        // лишиться на кроці нижче — при закритті модалки через "назад"
        // параметр повернувся б в адресний рядок і повторно спрацював
        // би при оновленні сторінки.
        history.replaceState({}, '', window.location.pathname);
        const all = [...this.featured, ...this.rest];
        const product = all.find((p) => p.slug === targetSlug);
        if (product) this.openOrder(product);
      }
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

    // ---- рендер опису товару ----
    /**
     * Airtable Long text підтримує markdown (**жирний**, списки через "-"),
     * але API віддає це як сирий текст із зірочками/дефісами — не готовий
     * HTML. Конвертуємо мінімальний набір markdown-конструкцій вручну,
     * без сторонніх бібліотек. Текст спершу екранується (escapeHtml),
     * тому навіть якщо в Airtable колись з'явиться випадковий "<script>"
     * у полі опису — він не виконається, а покажеться як текст.
     */
    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    },

    renderDescription(text) {
      if (!text) return '';
      const escaped = this.escapeHtml(text);
      const lines = escaped.split(/\r?\n/);

      let html = '';
      let inList = false;

      for (let rawLine of lines) {
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

      // **жирний** -> <strong>жирний</strong> (після побудови списку/абзаців,
      // щоб не заважати парсингу рядків вище)
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-ink">$1</strong>');

      return html;
    },

    // ---- допоміжні геттери для картки ----
    activeVariant(p) {
      if (!p.variants.length) return null;
      const idx = this.selectedVariantIdx[p.parent_crm_code] || 0;
      return p.variants[idx] || p.variants[0];
    },

    cardImage(p) {
      if (p.stage === 2) {
        // Товар у наявності — спершу пробуємо фото активного (обраного)
        // кольору, якщо саме в нього немає фото — шукаємо серед інших
        // "живих" варіантів цього товару.
        const active = this.activeVariant(p);
        if (active && active.photos && active.photos[0]) return active.photos[0];
        const withPhoto = p.variants.find((v) => v.photos && v.photos[0]);
        if (withPhoto) return withPhoto.photos[0];
        // Жоден "живий" варіант з YML не приніс фото (Salesdrive іноді
        // віддає offer без <picture>) — показуємо заглушку з Airtable,
        // а не порожню картку.
        return p.default_photo || null;
      }
      // Stage 1 (товар ще очікується) — фото-заглушка з Airtable.
      return p.default_photo;
    },

    /**
     * Список фото для галереї в модалці "Детальніше".
     * Stage 2: усі фото активного варіанту, якщо є; якщо в жодного
     * "живого" варіанту немає фото — падаємо назад на default_photo
     * з Airtable (той самий фолбек, що й у cardImage()).
     * Stage 1: default_photo, як заглушка очікуваного товару.
     */
    detailsGalleryPhotos(p) {
      if (p.stage === 2) {
        const active = this.activeVariant(p);
        if (active && active.photos && active.photos.length) return active.photos;
        const withPhoto = p.variants.find((v) => v.photos && v.photos.length);
        if (withPhoto) return withPhoto.photos;
        return p.default_photo ? [p.default_photo] : [];
      }
      return p.default_photo ? [p.default_photo] : [];
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
      this._openModals.push('details');
      history.pushState({ catalogModal: 'details' }, '');
    },

    closeDetails() {
      // Якщо модалка була відкрита через openDetails() — в історії є
      // наш запис, і history.back() коректно його "з'їсть", а фактичне
      // закриття виконає popstate-слухач з init(). Якщо з якоїсь
      // причини стек порожній (наприклад, модалка вже закривалась) —
      // просто закриваємо напряму, без зайвого back().
      if (this._openModals[this._openModals.length - 1] === 'details') {
        history.back();
      } else {
        this.detailsOpen = false;
        this.resetSeo();
      }
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
      this.orderError = null;
      this.orderOpen = true;
      this._openModals.push('order');
      history.pushState({ catalogModal: 'order' }, '');
    },

    closeOrder() {
      if (this._openModals[this._openModals.length - 1] === 'order') {
        history.back();
      } else {
        this.orderOpen = false;
      }
    },

    async submitOrder() {
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

      this.orderSubmitting = true;
      this.orderError = null;

      try {
        // Netlify Function /api/order форвардить заявку в SalesDrive CRM
        // через їхній офіційний API "Додавання заявок". Токен/ключ форми
        // лишається на бекенді — сюди йде звичайний POST без секретів.
        const res = await fetch('/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`order proxy responded ${res.status}`);

        this.justSubmitted = true;
        setTimeout(() => { this.closeOrder(); }, 1600);
      } catch (err) {
        console.error('submitOrder failed:', err);
        this.orderError = 'Не вдалося надіслати заявку. Спробуйте ще раз або зателефонуйте нам напряму: +380 66 922 25 19.';
      } finally {
        this.orderSubmitting = false;
      }
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
