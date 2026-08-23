# Оновлення вже задеплоєного сайту (git-github-netlify вже налаштовано)

Не чіпаємо `main` напряму. Робимо гілку → пушимо → Netlify сама збудує
Deploy Preview → перевіряємо на реальному URL → тільки тоді мерджимо.
Якщо щось зламається — `main` і продакшн-сайт весь цей час незайманий.

## Крок 1. Клонуй або онови локальну копію репозиторію

Якщо репозиторій вже є на диску:

```bash
cd шлях/до/твого/репозиторію
git checkout main
git pull
```

Якщо працюєш з чистого місця:

```bash
git clone https://github.com/ТВІЙ_НІК/назва-репо.git
cd назва-репо
```

## Крок 2. Створи окрему гілку під це оновлення

```bash
git checkout -b feature/airtable-salesdrive-catalog
```

## Крок 3. Перевір, що вже є в репозиторії, ПЕРЕД тим як копіювати нові файли

```bash
ls
cat netlify.toml 2>/dev/null
```

Два випадки:

- **`netlify.toml` вже існує** — не перезаписуй його файлом, який я давав. Відкрий свій і **додай** туди два блоки `[[redirects]]` з мого `netlify.toml` (для `/api/products` і `/api/feed`). Якщо в тебе вже є секція `[build]` з іншими налаштуваннями — не чіпай її, лише додай `functions = "netlify/functions"`, якщо такого рядка ще нема.
- **`netlify.toml` нема** — просто копіюєш мій файл як є.

Те саме подумай про `index.html`: якщо це той самий файл, з яким ми весь час працювали в цій розмові (проєктний файл), — просто заміни його моєю версією. Якщо на проді вже лежить інша, доопрацьована версія (наприклад, хтось інший її редагував після нашої розмови) — зроби `diff` і перенеси різницю вручну, а не перезаписуй наосліп.

```bash
diff index.html /шлях/до/скачаного/max4kids-catalog/index.html
```

## Крок 4. Скопіюй нові файли в репозиторій

Розпакуй завантажений архів `max4kids-catalog` кудись окремо, тоді:

```bash
# з кореня твого репозиторію
cp -r /шлях/до/max4kids-catalog/js .
cp -r /шлях/до/max4kids-catalog/netlify .
cp /шлях/до/max4kids-catalog/index.html .        # або вручну зміни, якщо є розбіжності (крок 3)
cp /шлях/до/max4kids-catalog/README.md .
cp /шлях/до/max4kids-catalog/DEPLOY.md .
# server/api-proxy-example.js НЕ копіюй — для Netlify він не потрібен,
# роль проксі виконують netlify/functions/*.js
```

Якщо `netlify.toml` в тебе вже був — **не копіюй** файл поверх, зроби вручну (див. крок 3).

## Крок 5. Перевір локально, що нічого явно не зламано

```bash
git status
```

Подивись список змінених/нових файлів — має бути: `index.html` (modified), `js/*` (new), `netlify/functions/*` (new), `netlify.toml` (new або modified), `README.md`/`DEPLOY.md` (new).

## Крок 6. Комміт і пуш гілки

```bash
git add .
git commit -m "Каталог: Airtable + Salesdrive YML через Netlify Functions"
git push -u origin feature/airtable-salesdrive-catalog
```

## Крок 7. Додай env-змінні в Netlify (якщо ще не додані)

Це треба зробити один раз для всього сайту, незалежно від гілок:
**Netlify → твій сайт → Site settings → Environment variables → Add a variable**

| Ключ | Значення |
|---|---|
| `AIRTABLE_TOKEN` | новий (перевипущений) Airtable Personal Access Token |
| `AIRTABLE_BASE_ID` | ID твоєї Airtable бази |
| `AIRTABLE_TABLE_NAME` | `Products` (або інша назва таблиці) |
| `SALESDRIVE_YML_URL` | посилання на YML-фід |

Ці змінні доступні всім гілкам сайту одразу, окремо для preview-гілок налаштовувати не треба (якщо не хочеш різних значень для preview/production — тоді є окрема опція "Same value for all deploy contexts" / "Different value for different contexts" у тому ж вікні).

## Крок 8. Netlify сама збудує Deploy Preview

Якщо в Netlify увімкнені **Deploy Previews** (за замовчуванням увімкнено для сайтів з GitHub) — після пушу гілки Netlify:
- або одразу почне білд гілки (перевір вкладку **Deploys** в Netlify — має з'явитись запис з назвою твоєї гілки),
- або зʼявиться після того, як відкриєш Pull Request на GitHub із цієї гілки в `main`.

Якщо не з'явилось само — відкрий Pull Request на GitHub (`feature/airtable-salesdrive-catalog` → `main`), Netlify Bot підхопить його автоматично і залишить коментар з посиланням на preview-URL.

## Крок 9. Перевір preview-URL так само, як звичайний деплой

```
https://deploy-preview-N--твій-сайт.netlify.app/api/products
https://deploy-preview-N--твій-сайт.netlify.app/api/feed
```

Мають повернути JSON і XML відповідно (не помилку). Далі відкрий сам сайт на цьому preview-URL, перевір F12 → Console на попередження `[SalesdriveYml] Неоднозначний збіг...`, перевір Stage 1 і Stage 2 картки візуально.

## Крок 10. Мердж у продакшн

Коли на preview все ок:

```bash
git checkout main
git merge feature/airtable-salesdrive-catalog
git push origin main
```

Або просто натисни **Merge pull request** на GitHub, якщо відкривав PR. Netlify автоматично задеплоїть `main` як продакшн одразу після мерджу.

## Якщо після мерджу щось зламалось

Netlify зберігає історію деплоїв. **Deploys → знайди попередній робочий деплой → Publish deploy** — миттєво відкатує прод на попередню версію, поки розбираєшся, що пішло не так. Код у гілці нікуди не зникає, можна виправляти й пушити знову.
