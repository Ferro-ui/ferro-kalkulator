# Ferro Prosjektestimat

AI-verktøy for Ferro Stålentreprenør AS.  
Last opp prosjektdokumenter → Claude AI analyserer → Prisintervall + branded .docx budsjettpris.

## Bruk (ingen installasjon)

Åpne direkte i nettleseren:  
**https://[din-github-bruker].github.io/ferro-kalkulator/**

1. Klikk "Sett API-nøkkel" → lim inn din Anthropic API-nøkkel
2. Dra inn prosjektfiler (PDF, bilder, tegninger, Excel)
3. Skriv tilleggsinformasjon om prosjektet
4. Klikk "Analyser prosjekt med AI"
5. Juster priser → "Last ned budsjettpris (.docx)"

API-nøkkelen lagres kun lokalt i nettleseren din (localStorage).

## Kjøre lokalt (utvikling)

```bash
git clone https://github.com/[bruker]/ferro-kalkulator
cd ferro-kalkulator
npm install
npm run dev
# → http://localhost:3000
```

## Deploy til GitHub Pages

```bash
# 1. Endre 'base' i vite.config.js til ditt repo-navn
# 2. Legg til i package.json → "homepage": "https://[bruker].github.io/ferro-kalkulator"
npm run deploy
```

Eller bruk GitHub Actions (automatisk deploy ved push til main) — se `.github/workflows/deploy.yml`

## Teknologi

- React + Vite
- Claude API (claude-sonnet-4-6) for AI-analyse
- docx.js for .docx generering i nettleseren
- Ingen backend — fungerer som ren statisk nettside

## Hva trenger du

- Anthropic API-nøkkel fra https://console.anthropic.com
- Hver bruker har sin egen nøkkel (betaler per bruk ~$0.02-0.10 per analyse)
