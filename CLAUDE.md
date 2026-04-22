# Ferro Kalkulator — Повна документація проекту

Внутрішній AI-інструмент для бюджетування будівельних проектів у Ferro Stålentreprenør AS.

---

## Що це і для кого

**Що робить:** Приймає документи проекту (PDF креслення, tilbud постачальників, xlsx калькуляції) → AI аналізує + використовує історію минулих проектів як референс → видає цінові діапазони по блоках робіт (yttervegg, tak, kran тощо) → генерує брендований `.docx` BUDSJETTPRIS для клієнта.

**Для кого:** Кalkulator (Marian Mychko) та колеги у Ferro. Колеги користуються через браузер — нічого не встановлюють.

**Де працює:** https://ferro-ui.github.io/ferro-kalkulator/

---

## Архітектура коротко

- **Чистий фронтенд** (React + Vite), без backend
- Хоститься на **GitHub Pages** (безкоштовно)
- Claude API викликається **напряму з браузера** (кожен користувач вводить свій API ключ, зберігається в localStorage)
- `.docx` генерується в браузері через бібліотеку `docx`
- Історія минулих проектів читається з Google Drive через окремий **Node.js скрипт**, запускається локально на компі

---

## Структура файлів

```
v2.2/                            ← корінь проекту
├── CLAUDE.md                    ← цей документ
├── .env                         ← ANTHROPIC_API_KEY (в .gitignore!)
├── credentials.json             ← Google OAuth (в .gitignore!)
├── token.json                   ← автогенерується (в .gitignore!)
├── package.json
├── vite.config.js               ← base: '/ferro-kalkulator/'
├── index.html
├── .gitignore
│
├── .github/workflows/
│   └── deploy.yml               ← авто-деплой на GitHub Pages при push у main
│
├── scripts/
│   ├── updateHistory.js         ← сканер Google Drive (локальний Node скрипт)
│   ├── README.md                ← інструкції для сканера
│   └── .cache.json              ← кеш проектів (в .gitignore!)
│
└── src/
    ├── main.jsx                 ← вхідна точка React
    ├── App.jsx                  ← головний UI (upload/analyze/generate)
    ├── analyzeProject.js        ← виклик Claude API з batching
    ├── generateDocx.js          ← генерація .docx у браузері
    ├── historiske_prosjekter.json  ← база проектів (створюється сканером)
    ├── ferroLogo.js             ← лого в base64 (прозорий PNG)
    ├── utils.js                 ← formatting, localStorage
    └── index.css                ← стилі (Ferro бренд: navy #1B3050)
```

---

## Як користуватись (основний workflow)

### Для кожного нового проекту клієнта:

1. Відкриваєш https://ferro-ui.github.io/ferro-kalkulator/
2. Перший раз — клацаєш **"Sett nøkkel"** (жовтим), вставляєш Anthropic API ключ, зберігається в браузері
3. Вводиш назву проекту (напр. "Vaskehall Drammen")
4. Перетягуєш файли проекту (PDF, xlsx, фото) в зону upload
5. У "Tilleggsinformasjon" пишеш суть — що в scope, що UE, ключові розміри
6. Клацаєш **"Analyser prosjekt med AI"** — чекаєш 30 сек – 20 хв (залежно від розміру)
7. Перевіряєш результат:
   - Коригуєш ціни Fra/Til якщо треба
   - Змінюєш Påslag % якщо хочеш більше/менше маржі
   - Руками вводиш ціну сталі від Ruukki/Storm
   - Налаштовуєш Rigg og drift %
8. Клацаєш **"Last ned budsjettpris (.docx)"** → вводиш дані клієнта → скачується docx

---

## Секрети і доступи

### Anthropic API (для AI аналізу)

- **Де отримати:** https://console.anthropic.com → Settings → API Keys → Create Key
- **Де використовується:**
  - У браузері (сайт) — кожен користувач вводить свій ключ, зберігається тільки в його локальному браузері
  - У `.env` локально — для скрипта `updateHistory.js`
- **Якщо скомпрометований:** console.anthropic.com → видалити старий → створити новий
- **Орієнтовна вартість:** $5-15/місяць на одну людину при нормальному використанні
- **Rate limit:** 30,000 tokens/min на free tier → тому batching у скрипті та в браузері

### Google Drive API (для сканера)

- **Проект у Google Cloud Console:** `Ferro-Kalkulator`
- **Тип OAuth:** Desktop app
- **Необхідні файли локально:**
  - `credentials.json` — завантажується з Google Cloud Console (OAuth 2.0 Client ID → Download JSON)
  - `token.json` — створюється автоматично при першому запуску `npm run update-history` (відкриває браузер, Google Login)
- **Якщо втратиш `credentials.json`:** console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client IDs → Download JSON заново
- **Якщо `token.json` зламався:** просто видали його, скрипт попросить авторизуватись знову

---

## Як оновити історію проектів

### Коли це потрібно

- Додав новий проект у `Drive/Projects/`
- Змінив файли в існуючому проекті (kalkulasjon, tilbud)
- Хочеш перечитати все з нуля (рідко)

### Команди

```bash
# Стандартний запуск (кеш використовується — швидко)
npm run update-history

# Повністю з нуля (довго, але гарантовано актуальне)
rm scripts/.cache.json
npm run update-history
```

### Як це працює

1. Скрипт OAuth-авторизується в Google
2. Сканує всі підпапки в `Drive/Projects/`
3. Для кожної:
   - **kalk.xlsx** у корені — парситься в CSV через бібліотеку `xlsx`
   - **наш tilbud.pdf** у корені — відправляється Claude як PDF
   - **креслення** (Plan, Snitt, Fasader) — відправляються Claude
   - **ВСІ tilbud постачальників** з підпапок (`Stål og HD/`, `Tak og vegg/`, `Porter/` тощо) — найбільші PDF з кожної
4. Якщо більше 4MB всіх файлів — розбиває на батчі, пауза 60 сек між ними
5. Claude витягує в JSON: розміри будівлі, ціни до клієнта, ціни закупівлі, націнку (stål ×1.30 тощо), технічні рішення
6. Результат → `src/historiske_prosjekter.json`
7. Кеш → `scripts/.cache.json` — не перечитує те що не змінилось

### Після `update-history`

```bash
git add src/historiske_prosjekter.json
git commit -m "Update history"
git push
```

GitHub Actions автоматично задеплоїть — через 1-2 хв колеги бачать оновлену базу.

---

## Як AI використовує історію

У кожному аналізі нового проекту Claude отримує в контексті:

```
FERRO HISTORISKE PROSJEKTER — din viktigste kalibrering:

──── 1. Dobbel Vaskehall ────
Bygg: Vaskehall, 15×10×5m, 347 m² BRA
Scope: Stål + yttervegg + tak + porter + oljeutskiller
Priser: stål 420000, yttervegg 280000, tak 240000, SUM 2 862 500 kr
Innkjøp: stål Ruukki T202524 | sandwich Storm SP120 PIR | Crawford foldeporter
Påslag: stål ×1.30, sandwich ×1.15
Merknader: Totalentreprise unntatt elektro og ventilasjon

──── 2. Bussgarasje Mjåvann ────
...
```

Далі йде інструкція: *"Знайди найсхожіший проект з цього списку, використай як базу, вкажи в 'basis' з чим порівнював"*.

Завдяки цьому AI не придумує ціни з голови, а калібрує по реальних Ferro-цінах.

---

## Деплой

### Автоматичний (зазвичай)

Просто `git push` у `main` — GitHub Actions запускає workflow `Deploy to GitHub Pages`, він білдить (npm run build) і деплоїть на gh-pages.

Статус: https://github.com/Ferro-ui/ferro-kalkulator/actions

### Налаштування Pages (вже зроблено)

GitHub → Settings → Pages:
- Source: **GitHub Actions** (не "Deploy from a branch")

### Якщо деплой не спрацював

Перевір Actions — клацни на провалений запуск, побачиш лог помилки. Часті причини:
- Помилка синтаксису в JS/JSX → фікси локально, push заново
- Vite build upav → `npm run build` локально щоб побачити помилку
- Permission denied → Settings → Actions → Workflow permissions → "Read and write"

---

## Типові проблеми і рішення

### "AI svarte ikke med gyldig JSON"

**Причина:** JSON обрізаний — відповідь AI перевищила `max_tokens`.
**Де:** `src/analyzeProject.js`, зараз `max_tokens: 8192`.
**Рішення:** збільшити ще або скоротити промпт.

### "Rate limit (429)"

**Причина:** 30,000 tokens/min — free tier ліміт.
**Рішення:** Скрипт автоматично чекає `retry-after` секунд (з header) і ретраїть. Нічого не роби — продовжить само.

### "Could not process PDF" у сканері

**Причина:** PDF битий або зашифрований (Claude API не може його прочитати).
**Рішення:** Скрипт з версії з try-catch на батч — просто пропустить цей батч і продовжить. Інші файли з проекту оброблять нормально.

### Перший раз `npm run update-history` відкриває браузер і не закривається

**Причина:** OAuth flow. Нормально.
**Рішення:** Ввійди в Google, підтверди доступ до Drive (readonly). Термінал продовжить після авторизації.

### "invalid x-api-key"

**Причина:** ANTHROPIC_API_KEY у `.env` неправильний.
**Перевірка:**
```bash
cat .env
```
Має бути `ANTHROPIC_API_KEY=sk-ant-api03-...` (один префікс, без лапок, без пробілів).

### Git "Updates were rejected"

**Причина:** На GitHub є комміти яких у тебе локально нема.
**Рішення:**
```bash
git pull --rebase
git push
```
Якщо конфлікт — скажи Claude у новому чаті, розберемось.

### `.DS_Store` і `.claude/` засмічують `git status`

**Рішення:** Одноразово:
```bash
echo ".DS_Store" >> .gitignore
echo ".claude/" >> .gitignore
git rm --cached -r .DS_Store .claude 2>/dev/null
git add .gitignore
git commit -m "Ignore system files"
git push
```

---

## Ключові технічні рішення

### Чому чистий фронтенд без backend

- Zero maintenance (нічого не треба хостити і платити)
- GitHub Pages = безкоштовно
- Кожен користувач має свій API ключ → ти не платиш за їх використання
- Історія проектів статична (оновлюється раз на тиждень) → підходить для git

### Чому Node.js скрипт для сканера замість браузера

- Google Drive OAuth складно робити в браузері (CORS, redirect flows)
- Великі файли зручніше обробляти на компі з файловою системою
- Не зобов'язує всіх колег мати Google credentials
- Один раз на тиждень/місяць — не потребує автоматизації

### Чому батчинг і паузи

Free tier Anthropic = 30k tokens/min. Великий проект (100 MB файлів) = мільйон токенів. Тому:
- У браузері (`analyzeProject.js`) — батчі по 4MB, 65 сек паузи
- У скрипті (`updateHistory.js`) — те ж саме
- Retry з `retry-after` header якщо впирається в ліміт

### Чому `paslag_pct` видається AI

Щоб користувач міг швидко змінити ціну на ±5-10% без перерахунку вручну. AI дивиться на історію і каже: "для цього типу yttervegg Ferro зазвичай ставить +15-20%". Користувач може прийняти або змінити.

---

## Зміни в майбутньому — можливі напрямки

Якщо колись захочеш покращувати:

- **Додати Coop Extra Lunde в історію** (якщо скрипт його пропустив) — видалити його з `.cache.json` і перезапустити
- **Підтримка .docx файлів від постачальників** — зараз тільки PDF (можна додати через `mammoth` бібліотеку)
- **Більше форматів на вивід** — .pdf, .xlsx, друкована версія
- **Мульти-користувач** — спільна історія через Firestore або Supabase (якщо колег стане багато)
- **Версіонування tilbud** — зберігати всі видані tilbud з датами
- **Інтеграція з Fiken/Tripletex** — автоматично імпортувати витрати проектів

---

## Посилання

- **Сайт:** https://ferro-ui.github.io/ferro-kalkulator/
- **Репо:** https://github.com/Ferro-ui/ferro-kalkulator
- **Actions:** https://github.com/Ferro-ui/ferro-kalkulator/actions
- **Anthropic Console:** https://console.anthropic.com
- **Google Cloud Console:** https://console.cloud.google.com

---

## Як продовжити роботу з Claude у новому чаті

1. Відкрий claude.ai → "New chat"
2. Перетягни цей файл `CLAUDE.md` у чат (або вставити текстом)
3. Напиши: **"Ось контекст проекту Ferro Kalkulator. Я хочу [опис задачі]"**
4. Claude швидко зорієнтується і продовжить допомагати

Приклади запитів:
- "Додай поле X у форму"
- "Чому у docx виглядає криво?"
- "Допоможи виправити помилку Y"
- "Як додати новий проект вручну в історію без сканера?"

---

**Останнє оновлення:** Квітень 2026
**Автор:** Marian Mychko + Claude (Anthropic)
