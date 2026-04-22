// scanKalkulasjoner.js — скан тільки папки з калькуляціями для детального розбору
//
// Використання:
//   1. Створи в Drive папку "Kalkulasjoner" (або іншу назву)
//   2. Поклади туди xlsx калькуляції з усіх проектів (одну на проект)
//   3. Назви файли як назви проектів (напр. "Dobbel Vaskehall.xlsx")
//   4. Запусти: node scripts/scanKalkulasjoner.js
//
// Що робить:
//   - Читає кожен xlsx повністю (всі листи)
//   - AI витягує детальну структуру: для кожного блоку (tak, vegg, stål тощо)
//     показує які є підстатті, їх кількість і ціни
//   - Додає поле "detaljert_kalkulasjon" до кожного проекту в historiske_prosjekter.json
//
// Не змінює основну логіку сканера Drive — це окрема команда для деталізації.

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { authenticate } from '@google-cloud/local-auth'
import { google } from 'googleapis'
import XLSX from 'xlsx'
import 'dotenv/config'

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
const TOKEN_PATH = path.resolve('token.json')
const CREDENTIALS_PATH = path.resolve('credentials.json')
const HISTORY_PATH = path.resolve('src/historiske_prosjekter.json')

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_KEY) {
  console.error('❌ ANTHROPIC_API_KEY mangler i .env')
  process.exit(1)
}

// ─── Google Drive auth ────────────────────────────────────────────────────────
async function loadSavedCredentials() {
  try {
    const content = fs.readFileSync(TOKEN_PATH)
    const credentials = JSON.parse(content)
    return google.auth.fromJSON(credentials)
  } catch { return null }
}

async function saveCredentials(client) {
  const content = JSON.parse(fs.readFileSync(CREDENTIALS_PATH))
  const key = content.installed || content.web
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  }))
}

async function authorize() {
  let client = await loadSavedCredentials()
  if (client) return client
  client = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH })
  if (client.credentials) await saveCredentials(client)
  return client
}

// ─── Find Kalkulasjoner folder ────────────────────────────────────────────────
async function findFolder(drive, folderName) {
  const res = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  })
  return res.data.files[0]
}

async function listXlsxInFolder(drive, folderId) {
  const files = []
  let pageToken = null
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
      pageSize: 100,
      pageToken,
    })
    files.push(...res.data.files)
    pageToken = res.data.nextPageToken
  } while (pageToken)

  return files.filter(f =>
    f.name.endsWith('.xlsx') || f.name.endsWith('.xls') ||
    f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    f.mimeType === 'application/vnd.ms-excel' ||
    f.mimeType === 'application/vnd.google-apps.spreadsheet'
  )
}

async function downloadFile(drive, file) {
  // If Google Sheets, export as xlsx
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const res = await drive.files.export(
      { fileId: file.id, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { responseType: 'arraybuffer' }
    )
    return Buffer.from(res.data)
  }
  const res = await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(res.data)
}

// ─── Parse xlsx to rich text ──────────────────────────────────────────────────
function parseXlsxFullDetail(buffer, fileName) {
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const lines = [`[Excel: ${fileName}]`]

    // Include ALL sheets, full content
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
      if (!csv.trim()) continue
      // Include up to 15000 chars per sheet — much more generous than main scanner
      const trimmed = csv.length > 15000 ? csv.substring(0, 15000) + '\n[...kuttet...]' : csv
      lines.push(`\n\n═══ Ark: "${sheetName}" ═══\n${trimmed}`)
    }
    return lines.join('\n')
  } catch (err) {
    return `[Kunne ikke parse ${fileName}: ${err.message}]`
  }
}

// ─── Call Claude for detailed calculation analysis ────────────────────────────
const DETAIL_PROMPT = `Du får EN komplett kalkulasjon fra et Ferro-prosjekt som allerede er ferdig.

Din oppgave: ekstrahere FULLSTENDIG DETALJERT PRISSTRUKTUR — ikke bare totaler, men ALLE underposter per blokk.

For hver arbeidsblokk (stål, yttervegg, innervegg, tak, porter, dører, betong, grunnarbeid, kran/lift, rigg) lever hver sub-post:
- Hva er det (f.eks. "selvbærende takplater", "montering takplater", "festemateriell")
- Antall (m², lm, stk)
- Enhetspris (kr/m² eller kr/lm)
- Totalt beløp

Dette skal la en kalkulator forstå HVOR MYE av blokken som går til materiale vs. montering vs. beslag vs. festemateriell.

Returner KUN gyldig JSON:
{
  "prosjekt_navn": "navn fra filnavn",
  "bygg": {
    "type": "f.eks. vaskehall / butikk / lager",
    "dimensjoner": "f.eks. 15×10×5m",
    "bra_m2": null,
    "fasade_m2": null,
    "tak_m2": null
  },
  "blokker": {
    "stal": {
      "total_kr": 0,
      "poster": [
        { "navn": "Stålkonstruksjon ferdig montert", "mengde": 8500, "enhet": "kg", "enhetspris": 45, "sum": 382500 }
      ]
    },
    "tak": {
      "total_kr": 0,
      "poster": [
        { "navn": "Selvbærende takplater galvanisert", "mengde": 345, "enhet": "m2", "enhetspris": 230, "sum": 79350 },
        { "navn": "Montering takplater", "mengde": 345, "enhet": "m2", "enhetspris": 132, "sum": 45540 },
        { "navn": "Festemateriell", "mengde": 345, "enhet": "m2", "enhetspris": 115, "sum": 39675 },
        { "navn": "Overgangsbeslag", "mengde": 51, "enhet": "lm", "enhetspris": 287, "sum": 14663 },
        { "navn": "Tekkebeslag", "mengde": 64, "enhet": "lm", "enhetspris": 287, "sum": 18400 }
      ]
    },
    "yttervegg": { "total_kr": 0, "poster": [...] },
    "innervegg": { "total_kr": 0, "poster": [...] },
    "porter": { "total_kr": 0, "poster": [...] },
    "dorer_vinduer": { "total_kr": 0, "poster": [...] },
    "betong": { "total_kr": 0, "poster": [...] },
    "grunnarbeid": { "total_kr": 0, "poster": [...] },
    "kran_lift": { "total_kr": 0, "poster": [...] },
    "rigg": { "total_kr": 0, "poster": [...] }
  },
  "total_eks_mva": 0,
  "merknader": "1-2 setninger om hva som er spesielt"
}

VIKTIG:
- Hopp over blokker som ikke finnes i kalkulasjonen
- Hvis en blokk finnes men har kun en rad — fyll inn én post
- Ignorer tomrader (mengde=0)
- "Himling" hører under yttervegg eller innervegg
- "Brannisolering" under stål
- Ikke inkluder rigg og drift % i total_eks_mva (det er prosent, ikke beløp)`

async function callClaude(content, maxTokens = 8000) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: DETAIL_PROMPT,
      messages: [{ role: 'user', content }]
    })
  })

  if (response.status === 429) {
    const waitSec = parseInt(response.headers.get('retry-after')) || 65
    console.log(`  ⏳ Rate limit — venter ${waitSec}s...`)
    await new Promise(r => setTimeout(r, waitSec * 1000))
    return callClaude(content, maxTokens)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Claude feil: ${err.error?.message || response.status}`)
  }

  const data = await response.json()
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('')

  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
  return JSON.parse(cleaned)
}

// ─── Merge into existing history ──────────────────────────────────────────────
function normalizeProjectName(name) {
  return name
    .toLowerCase()
    .replace(/\.xlsx?$/i, '')
    .replace(/[0-9]{2}[._-]?[0-9]{2}[._-]?[0-9]{2,4}/g, '') // remove dates like 16.05.25
    .replace(/\b(kalkulasjon|januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|av|as)\b/gi, '') // remove common non-ID words
    .replace(/[^a-zæøå\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getKeywords(name) {
  // Extract meaningful words (3+ chars, not common)
  const stopwords = new Set(['enkel', 'dobbel', 'vaskehall', 'ny', 'hall', 'bygg'])
  return normalizeProjectName(name)
    .split(' ')
    .filter(w => w.length >= 3)
    .filter(w => !stopwords.has(w))
}

function findMatchingProject(history, fileName) {
  const fileKeywords = new Set(getKeywords(fileName))
  if (fileKeywords.size === 0) return -1

  let bestMatch = -1
  let bestScore = 0

  history.forEach((p, idx) => {
    const projKeywords = new Set(getKeywords(p.navn || ''))
    // Count overlap
    let overlap = 0
    for (const kw of fileKeywords) {
      if (projKeywords.has(kw)) overlap++
    }
    // Score = overlap / max size
    const score = overlap / Math.max(fileKeywords.size, projKeywords.size)
    if (score > bestScore && score >= 0.4) { // at least 40% keyword overlap
      bestScore = score
      bestMatch = idx
    }
  })

  return bestMatch
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔧 Ferro Kalkulasjon Deep-Scanner\n' + '─'.repeat(50))

  // Ask for folder name
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const folderName = await new Promise(r => rl.question('📁 Mappe-navn i Drive (default: Kalkulasjoner): ', ans => { rl.close(); r(ans.trim() || 'Kalkulasjoner') }))

  const auth = await authorize()
  const drive = google.drive({ version: 'v3', auth })

  const folder = await findFolder(drive, folderName)
  if (!folder) { console.error(`❌ Fant ikke mappe "${folderName}"`); process.exit(1) }
  console.log(`✓ Fant mappe: ${folder.name}`)

  const files = await listXlsxInFolder(drive, folder.id)
  console.log(`✓ Fant ${files.length} kalkulasjoner\n`)

  if (files.length === 0) {
    console.log('⚠ Ingen xlsx i mappen. Legg til filer og prøv igjen.')
    return
  }

  // Load existing history
  let history = []
  if (fs.existsSync(HISTORY_PATH)) {
    history = JSON.parse(fs.readFileSync(HISTORY_PATH))
  }

  let updated = 0
  let added = 0

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    console.log(`[${i + 1}/${files.length}] ${file.name}`)

    try {
      console.log('  📥 Laster ned...')
      const buffer = await downloadFile(drive, file)
      const xlsxText = parseXlsxFullDetail(buffer, file.name)

      console.log(`  🤖 Analyserer (${(xlsxText.length / 1024).toFixed(1)}k tegn)...`)
      const detail = await callClaude([{ type: 'text', text: xlsxText }])

      // Find matching project or add new one
      const idx = findMatchingProject(history, file.name)
      if (idx >= 0) {
        history[idx].detaljert_kalkulasjon = detail
        console.log(`  ✓ Oppdatert eksisterende prosjekt: "${history[idx].navn}"`)
        updated++
      } else {
        history.push({
          navn: detail.prosjekt_navn || file.name.replace(/\.xlsx?$/i, ''),
          bygg: detail.bygg,
          detaljert_kalkulasjon: detail,
        })
        console.log(`  ✓ Lagt til som nytt prosjekt: "${detail.prosjekt_navn || file.name}"`)
        added++
      }

      // Pause between files to respect rate limit
      if (i < files.length - 1) {
        console.log('  ⏳ Venter 30s før neste fil...\n')
        await new Promise(r => setTimeout(r, 30000))
      }
    } catch (err) {
      console.log(`  ❌ Feil: ${err.message}\n`)
    }
  }

  // Write back
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2))
  console.log(`\n✅ Ferdig! Oppdatert: ${updated}, nye: ${added}`)
  console.log(`   Fil: ${HISTORY_PATH}`)
  console.log(`\n💡 Neste steg:`)
  console.log(`   git add src/historiske_prosjekter.json`)
  console.log(`   git commit -m "Add detailed calculations"`)
  console.log(`   git push`)
}

main().catch(err => { console.error('💥', err); process.exit(1) })
