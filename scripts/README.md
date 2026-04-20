# Historiske prosjekter — oppsett

Dette scriptet skanner Google Drive, leser ferdige prosjekter, og bygger en referansebase
som AI-analysen bruker for bedre prisestimater.

## Engangs-oppsett (10 min)

### 1. Legg til filer
Plasser disse to filene i ROT av prosjektet (ikke commit — de er i `.gitignore`):

- **`credentials.json`** — OAuth-nøkler fra Google Cloud Console
- **`.env`** — fil med din Anthropic API-nøkkel:
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  ```

### 2. Installer avhengigheter
```bash
npm install
```

## Kjøring (hver gang du legger til nye prosjekter)

```bash
npm run update-history
```

Hva skjer:
1. Første gang: åpner nettleser for Google-innlogging → autoriser tilgang til Drive
2. Spør etter mappenavn (default: `Projects`)
3. Leser hver underfolder som et prosjekt
4. Plukker nøkkelfiler: kalkulasjon (.xlsx), tilbud (.pdf), tegninger
5. Sender til Claude for analyse → lagrer i `src/historiske_prosjekter.json`
6. Cache brukes for prosjekter som ikke er endret

Etter kjøring:
```bash
git add src/historiske_prosjekter.json
git commit -m "Update history"
git push
```

GitHub Pages deployer automatisk — kollegene dine får oppdatert database.

## Hvordan AI bruker dataen

Ved hver analyse av nytt prosjekt, sender appen hele historikken som kontekst til Claude.
Claude sammenligner nytt prosjekt med tidligere og gir mer treffsikre prisintervaller.

## Filer som IKKE skal commites

Disse er i `.gitignore`:
- `credentials.json` — Google OAuth-nøkler
- `token.json` — genereres automatisk etter første login
- `.env` — Anthropic API-nøkkel
- `scripts/.cache.json` — cache for uendrede prosjekter

## Feilsøking

**"Fant ikke mappen Projects"** — sjekk at mappen heter nøyaktig `Projects` i Drive (eller skriv riktig navn når scriptet spør).

**"ANTHROPIC_API_KEY mangler"** — lag `.env`-fil i prosjektets rot med `ANTHROPIC_API_KEY=sk-...`.

**"Error: invalid_grant"** — slett `token.json` og kjør på nytt for å logge inn på nytt.

**"Rate limit"** — scriptet har 2s pause mellom prosjekter, men ved mange prosjekter kan det treffes. Kjør på nytt etter 1 min.
