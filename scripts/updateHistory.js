// scripts/updateHistory.js
// Sканує Google Drive папку Projects/, витягує дані з кожного проєкту,
// відправляє на Claude для аналізу, зберігає в src/historiske_prosjekter.json
//
// Запуск:  node scripts/updateHistory.js
// Потрібно: credentials.json (Google OAuth), .env з ANTHROPIC_API_KEY

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { google } from 'googleapis'
import { authenticate } from '@google-cloud/local-auth'
import * as XLSX from 'xlsx'

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(SCRIPT_DIR, '..')
const TOKEN_PATH = path.join(ROOT, 'token.json')
const CREDENTIALS_PATH = path.join(ROOT, 'credentials.json')
const OUTPUT_PATH = path.join(ROOT, 'src', 'historiske_prosjekter.json')
const CACHE_PATH = path.join(ROOT, 'scripts', '.cache.json')

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

// ─── Load Anthropic key ──────────────────────────────────────────────────────
function loadApiKey() {
  // Try .env file first
  const envPath = path.join(ROOT, '.env')
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8')
    const match = env.match(/ANTHROPIC_API_KEY\s*=\s*(.+)/)
    if (match) return match[1].trim().replace(/^["']|["']$/g, '')
  }
  // Fall back to env var
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  throw new Error('ANTHROPIC_API_KEY mangler. Lag en .env-fil med: ANTHROPIC_API_KEY=sk-ant-...')
}

const ANTHROPIC_KEY = loadApiKey()

// ─── Google Drive auth ───────────────────────────────────────────────────────
async function authorize() {
  // Load saved token if exists
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH))
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH))
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
    oAuth2Client.setCredentials(token)
    return oAuth2Client
  }

  // First-time auth — opens browser
  console.log('🔑 Første gangs autentisering — åpner nettleser...')
  const auth = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  })
  if (auth.credentials) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(auth.credentials))
    console.log('✓ Token lagret:', TOKEN_PATH)
  }
  return auth
}

// ─── Find root "Projects" folder ─────────────────────────────────────────────
async function findProjectsFolder(drive) {
  // Ask user for the folder name
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const folderName = await new Promise(resolve => {
    rl.question('📁 Navn på hoved-mappen i Drive (default: Projects): ', ans => {
      rl.close()
      resolve(ans.trim() || 'Projects')
    })
  })

  const res = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 10,
  })

  if (res.data.files.length === 0) {
    throw new Error(`Fant ikke mappen "${folderName}" i Drive.`)
  }
  if (res.data.files.length > 1) {
    console.log(`⚠ Fant ${res.data.files.length} mapper med navnet "${folderName}". Bruker den første.`)
  }
  const folder = res.data.files[0]
  console.log(`✓ Fant mappe: ${folder.name} (${folder.id})`)
  return folder
}

// ─── List project subfolders ─────────────────────────────────────────────────
async function listProjectFolders(drive, parentId) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, modifiedTime)',
    pageSize: 100,
    orderBy: 'modifiedTime desc',
  })
  return res.data.files
}

// ─── List files in a project (recursively, max 2 levels) ─────────────────────
async function listProjectFiles(drive, folderId, depth = 0, maxDepth = 2) {
  const files = []
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, size, modifiedTime)',
    pageSize: 200,
  })

  for (const file of res.data.files) {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      if (depth < maxDepth) {
        const sub = await listProjectFiles(drive, file.id, depth + 1, maxDepth)
        files.push(...sub.map(f => ({ ...f, subfolder: file.name })))
      }
    } else {
      files.push(file)
    }
  }
  return files
}

// ─── Pick relevant files for analysis ────────────────────────────────────────
function pickRelevantFiles(files) {
  const picks = {
    kalk: null,
    tilbud: null,
    drawings: [],
    supplier_tilbuds: [], // tilbud fra leverandører — for læringsmateriale
  }

  // Group files by subfolder to find the biggest PDF in each
  const bySubfolder = {}
  for (const f of files) {
    const key = f.subfolder || '_root'
    if (!bySubfolder[key]) bySubfolder[key] = []
    bySubfolder[key].push(f)
  }

  // Root files
  for (const f of bySubfolder._root || []) {
    const name = f.name.toLowerCase()
    const size = parseInt(f.size || 0)

    if (name.endsWith('.xlsx') && size < 5_000_000) {
      if (!picks.kalk || new Date(f.modifiedTime) > new Date(picks.kalk.modifiedTime)) {
        picks.kalk = f
      }
    }

    if (name.endsWith('.pdf') && size < 10_000_000) {
      const isOurTilbud = name.includes('tilbud') || name.includes('vaskehall') ||
                         name.includes('bygg') || !name.includes('24164')
      if (isOurTilbud && (!picks.tilbud || size > (picks.tilbud.size || 0))) {
        picks.tilbud = f
      }
    }

    if (name.endsWith('.pdf') && size < 15_000_000) {
      if (name.includes('plan') || name.includes('snitt') || name.includes('fasad')) {
        if (picks.drawings.length < 2) picks.drawings.push(f)
      }
    }
  }

  // From each subfolder — pick the biggest PDF (typically the final supplier tilbud)
  for (const [subfolder, folderFiles] of Object.entries(bySubfolder)) {
    if (subfolder === '_root') continue

    const pdfs = folderFiles
      .filter(f => f.name.toLowerCase().endsWith('.pdf') && parseInt(f.size || 0) < 8_000_000)
      .sort((a, b) => parseInt(b.size || 0) - parseInt(a.size || 0))

    if (pdfs.length > 0) {
      picks.supplier_tilbuds.push({ ...pdfs[0], category: subfolder })
    }
  }

  return picks
}

// ─── Download file content ───────────────────────────────────────────────────
async function downloadFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(res.data)
}

// ─── Call Claude to extract project data ─────────────────────────────────────
const CLAUDE_PROMPT = `Du får dokumenter fra et FERDIG prosjekt hos Ferro Stålentreprenør AS:
- Vår kalkulasjon (xlsx) — hva vi kalkulerte internt
- Vårt tilbud (pdf) — hva vi tilbød kunden
- Leverandør-tilbud (pdf i underfolders) — priser VI fikk fra Ruukki, Storm, Areco osv.
- Tegninger

Din oppgave: ekstrahere NØKKELDATA som læringsmateriale for fremtidige kalkulasjoner.
VIKTIG: inkluder leverandørdata og påslagslogikk — det viser HVORDAN Ferro prissetter, ikke bare sluttpris.

Returner KUN gyldig JSON (ingen markdown):
{
  "bygg": {
    "type": "f.eks. vaskehall, lager, industribygg, bilskadeverksted",
    "dimensjoner": "f.eks. 30×15×5.3m",
    "bra_m2": null_eller_tall,
    "fasade_m2": null_eller_tall,
    "tak_m2": null_eller_tall,
    "lokasjon": "by/sted"
  },
  "priser_til_kunde": {
    "stal": null_eller_tall,
    "yttervegg": null_eller_tall,
    "innervegg": null_eller_tall,
    "tak": null_eller_tall,
    "kran_lift": null_eller_tall,
    "dorer_vinduer": null_eller_tall,
    "betong": null_eller_tall,
    "graving": null_eller_tall,
    "rigg_drift_pct": null_eller_tall,
    "sum_eks_mva": null_eller_tall
  },
  "innkjop_fra_leverandorer": {
    "stal_leverandor": "navn på leverandør (Ruukki/Storm/etc) og pris hvis kjent",
    "stal_innkjop_kr": null_eller_tall,
    "sandwich_leverandor": "navn og pris",
    "sandwich_innkjop_kr": null_eller_tall,
    "sandwich_type": "f.eks. 120mm PIR, 200mm RW",
    "tak_leverandor": "navn og pris",
    "tak_innkjop_kr": null_eller_tall,
    "andre_ue": "liste over andre UE og deres priser"
  },
  "paaslag_beregnet": {
    "stal_paslag": "f.eks. 1.30 (30 % påslag) — beregnet fra innkjøp vs utpris",
    "sandwich_paslag": "f.eks. 1.15",
    "kommentar": "kort forklaring av påslagslogikk"
  },
  "scope": "kort beskrivelse av hva Ferro leverte",
  "tekniske_losninger": "nøkkelbeslutninger — f.eks. 'TRP selvbærende + EPS C80 + papp/membran tekking', 'stripefundament 600×600mm', 'stålkonstruksjon HEA140 søyler'",
  "merknader": "1-2 setninger om prosjektets særtrekk, utfordringer, læring"
}

Bruk null for data som ikke finnes. Ikke gjett — men BEREGN påslag hvis både innkjøp og utpris finnes.`

// ─── Parse xlsx into readable text ───────────────────────────────────────────
function parseXlsxToText(buffer, fileName) {
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const lines = [`[Excel-fil: ${fileName}]`]

    // Prioritize Ferro-relevant sheets first
    const priority = ['Tilbud', 'Resultat', 'Prisoppsett']
    const sortedSheets = [
      ...priority.filter(n => wb.SheetNames.includes(n)),
      ...wb.SheetNames.filter(n => !priority.includes(n))
    ]

    for (const sheetName of sortedSheets) {
      const sheet = wb.Sheets[sheetName]
      // Convert to CSV — preserves structure and numbers better than JSON
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })

      // Skip completely empty sheets
      if (!csv.trim()) continue

      // Limit each sheet to ~8000 chars to keep token count reasonable
      const trimmed = csv.length > 4000 ? csv.substring(0, 4000) + '\n[...resten av arket kuttet...]' : csv
      lines.push(`\n--- Ark: ${sheetName} ---\n${trimmed}`)
    }
    return lines.join('\n')
  } catch (err) {
    return `[Excel-fil: ${fileName} — kunne ikke parse: ${err.message}]`
  }
}

async function analyzeWithClaude(projectName, files) {
  const content = [
    { type: 'text', text: `Analyser dette Ferro-prosjektet: "${projectName}"\nEkstrahér nøkkeldata for fremtidig referanse.` }
  ]

  for (const { file, buffer } of files) {
    const base64 = buffer.toString('base64')
    const mime = file.mimeType

    if (mime === 'application/pdf') {
      content.push({ type: 'text', text: `\n--- ${file.name} ---` })
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        title: file.name,
      })
    } else if (mime.startsWith('image/')) {
      content.push({ type: 'text', text: `\n--- ${file.name} ---` })
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mime, data: base64 },
      })
    } else if (mime.includes('spreadsheet') || mime.includes('excel') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // Parse xlsx to readable text (CSV) and send as text block
      const xlsxText = parseXlsxToText(buffer, file.name)
      content.push({ type: 'text', text: `\n--- ${file.name} ---\n${xlsxText}` })
    }
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3500,
      system: CLAUDE_PROMPT,
      messages: [{ role: 'user', content }]
    })
  })

  if (response.status === 429) {
    // Rate limit — wait 65s and retry once
    const waitSec = parseInt(response.headers.get('retry-after')) || 65
    console.log(`  ⏳ Rate limit — venter ${waitSec}s og prøver igjen...`)
    await new Promise(r => setTimeout(r, waitSec * 1000))
    return analyzeWithClaude(projectName, files)  // retry
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Claude API feil: ${err.error?.message || response.status}`)
  }

  const data = await response.json()
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('')

  // Extract JSON
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)

  return JSON.parse(cleaned)
}

// ─── Cache handling (avoid re-analyzing unchanged projects) ──────────────────
function loadCache() {
  if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH))
  return {}
}
function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔧 Ferro History Updater')
  console.log('─'.repeat(50))

  const auth = await authorize()
  const drive = google.drive({ version: 'v3', auth })

  const rootFolder = await findProjectsFolder(drive)
  console.log('\n📋 Søker etter prosjekter...')
  const projects = await listProjectFolders(drive, rootFolder.id)
  console.log(`✓ Fant ${projects.length} prosjekter\n`)

  if (projects.length === 0) {
    console.log('Ingen prosjekter funnet. Avslutter.')
    return
  }

  const cache = loadCache()
  const results = []

  for (const project of projects) {
    console.log(`\n[${results.length + 1}/${projects.length}] ${project.name}`)

    // Check cache
    const cached = cache[project.id]
    if (cached && cached.modifiedTime === project.modifiedTime) {
      console.log(`  ⚡ Bruker cache (ikke endret)`)
      results.push(cached.data)
      continue
    }

    try {
      const files = await listProjectFiles(drive, project.id)
      console.log(`  📄 ${files.length} filer i prosjektet`)

      const picks = pickRelevantFiles(files)
      const toAnalyze = [picks.kalk, picks.tilbud, ...picks.drawings, ...picks.supplier_tilbuds].filter(Boolean)

      if (toAnalyze.length === 0) {
        console.log(`  ⚠ Ingen relevante filer funnet — hopper over`)
        continue
      }

      console.log(`  📥 Laster ned ${toAnalyze.length} nøkkelfiler (${picks.supplier_tilbuds.length} fra leverandører)...`)
      const downloaded = []
      for (const file of toAnalyze) {
        const buf = await downloadFile(drive, file.id)
        downloaded.push({ file, buffer: buf })
        const label = file.category ? ` [fra ${file.category}]` : ''
        console.log(`     · ${file.name} (${(buf.length / 1024).toFixed(0)} KB)${label}`)
      }

      console.log(`  🤖 Analyserer med Claude...`)
      const analysis = await analyzeWithClaude(project.name, downloaded)

      const entry = {
        navn: project.name,
        driveId: project.id,
        sist_oppdatert: project.modifiedTime,
        ...analysis,
      }
      results.push(entry)
      cache[project.id] = { modifiedTime: project.modifiedTime, data: entry }
      saveCache(cache)
      console.log(`  ✓ Ferdig — ${analysis.scope || 'ingen scope angitt'}`)

      // Pause between projects to avoid rate limits (30k tokens/min)
      console.log(`  ⏳ Venter 30s før neste prosjekt (rate limit)...`)
      await new Promise(r => setTimeout(r, 30000))
    } catch (err) {
      console.log(`  ❌ Feil: ${err.message}`)
    }
  }

  // Write output
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2))
  console.log(`\n✅ Ferdig! Skrev ${results.length} prosjekter til:\n   ${OUTPUT_PATH}`)
  console.log(`\n💡 Neste steg:\n   git add src/historiske_prosjekter.json\n   git commit -m "Update history"\n   git push`)
}

main().catch(err => {
  console.error('\n❌ Feil:', err.message)
  console.error(err.stack)
  process.exit(1)
})
