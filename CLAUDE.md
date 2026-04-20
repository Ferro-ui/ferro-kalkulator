# Ferro Kalkulator — Project Context

Це проєкт для Ferro Stålentreprenør AS. Внутрішній AI-інструмент для бюджетування проєктів.

## Що це робить

1. Користувач завантажує документи нового проєкту (PDF креслення, tilbud постачальників, фото)
2. Claude AI аналізує їх + використовує історію попередніх проєктів як референс
3. Повертає прибл. цінові діапазони по блоках роботи (Yttervegg, Tak, Kran, тощо)
4. Генерує `.docx` budsjettpris з брендингом Ferro (лого, підпис Marian Mychko, всі forbehold)

## Архітектура

- **Чистий фронтенд** на React + Vite — без backend
- Хоститься на **GitHub Pages**: https://ferro-ui.github.io/ferro-kalkulator/
- `.docx` генерується в браузері через бібліотеку `docx`
- Anthropic API викликається напряму з браузера (кожен користувач вводить свій ключ, зберігається в localStorage)

## Структура файлів

```
src/
  App.jsx                     — головний UI (upload, analyze, генерація docx)
  analyzeProject.js           — виклик Claude API з batching для rate limits
  generateDocx.js             — будує брендований .docx в браузері
  ferroLogo.js                — лого в base64 (прозорий фон)
  historiske_prosjekter.json  — база попередніх проєктів (оновлюється скриптом)
  utils.js                    — форматування, збереження в localStorage
  index.css                   — глобальні стилі

scripts/
  updateHistory.js            — Node скрипт який сканує Google Drive,
                                витягує дані проєктів через Claude API,
                                зберігає в historiske_prosjekter.json
  README.md                   — інструкції для сканера

.github/workflows/deploy.yml  — GitHub Actions для авто-деплою на Pages
```

## Як працює сканер історії

Запуск: `npm run update-history`

1. OAuth до Google Drive (перший раз відкриває браузер)
2. Знаходить папку `Projects/` (налаштовується)
3. Для кожної підпапки проєкту:
   - **Kalkulasjon.xlsx** в корені — парситься через бібліотеку `xlsx` → CSV текст
   - **Наш tilbud.pdf** в корені — відправляється Claude як PDF
   - **Креслення** (Plan/Snitt/Fasader) — відправляються Claude як PDF
   - **Tilbud від постачальників** з підпапок (`Stål og HD/`, `Tak og vegg/` тощо) — найбільший PDF з кожної
4. Claude повертає JSON з:
   - Розміри будівлі
   - Ціни до клієнта (яку ми виставили)
   - Ціни закупівлі від постачальників (що ми заплатили Ruukki/Storm)
   - Розрахована націнка (stål ×1.30 і т.д.)
   - Технічні рішення
5. Зберігає в `src/historiske_prosjekter.json`
6. Пауза 30 сек між проєктами (rate limit 30k tokens/min)
7. Кеш у `scripts/.cache.json` — не перечитує проєкти які не змінились

## Історія в аналізі нового проєкту

`analyzeProject.js` → функція `buildHistoricalContext()` формує текстовий блок з усіма попередніми проєктами і додає його в user message до Claude. Claude отримує інструкцію:
1. Знайти найсхожіший історичний проєкт
2. Використати його ціни як базу
3. Обов'язково вказати в `basis` з чим порівнював

## Секрети (локальні, в .gitignore)

- `.env` — `ANTHROPIC_API_KEY=sk-ant-...`
- `credentials.json` — OAuth Google Cloud
- `token.json` — OAuth токен (автогенерується при першому вході)
- `scripts/.cache.json` — кеш сканера

## Деплой

```bash
git add .
git commit -m "..."
git push
```

GitHub Actions автоматично білдить і заливає на Pages.

## Важливі деталі

- **Model:** `claude-sonnet-4-6`
- **Rate limit:** 30,000 tokens/min (free tier) — тому batching
- **`vite.config.js` base:** `/ferro-kalkulator/` — для правильних URL на Pages
- **Підпис:** Marian Mychko, Kalkulatør, 91 92 36 26, marian@ferrostal.no
- **Заголовок .docx:** BUDSJETTPRIS (не PRISTILBUD)
- **Валідність:** 14 дні
- **Лого:** чорний фон уже прибраний, зберігається прозорий PNG в base64

## Робочий процес для користувача

1. Відкриває сайт
2. Вводить API ключ (один раз)
3. Назва проєкту + перетягує файли (PDF, фото, xlsx)
4. Додає текстову підказку (що в scope, що UE)
5. "Analyser med AI" → чекає ~30 сек
6. Коригує числа якщо треба, вводить ціну сталі вручну
7. "Generer budsjettpris" → модалка з даними клієнта → .docx скачується

## Що може просити шеф/колеги

- Налаштувати свій API ключ (на console.anthropic.com)
- Використати як є — все працює в браузері
- Підказки на нормальному українському якщо щось не зрозуміло
