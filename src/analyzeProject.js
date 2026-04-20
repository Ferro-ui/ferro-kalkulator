// Sends project files to Claude API in batches (to avoid rate limits)
// and merges results into one high-level price estimate.

const MAX_BATCH_SIZE_MB = 4
const BATCH_PAUSE_MS = 65_000
const SINGLE_CALL_LIMIT_MB = 5

// ─── Prompts ─────────────────────────────────────────────────────────────────
const FULL_SYSTEM_PROMPT = `Du er en erfaren kalkulatør hos Ferro Stålentreprenør AS i Norge.
Du mottar dokumenter fra et prosjekt (tilbud fra leverandører, arkitekttegninger, tidligere kalkulasjoner, bilder, e-poster, etc.) og skal gi et GROVT prisestimat fordelt på arbeidsblokker.

VIKTIG — Filosofi:
- Du gir OMTRENTLIGE prisintervaller, ikke eksakte beregninger
- Intervallene skal reflektere reell usikkerhet basert på tilgjengelig informasjon
- Hvis informasjonen er mangelfull, gi VIDERE intervall og forklar hva som mangler
- Stål-konstruksjonen vurderer bruker selv — ikke ta den med
- Se på ALLE dokumenter samlet for å forstå prosjektet

ARBEIDSBLOKKER du skal vurdere (kun de som er relevante for dette prosjektet):

1. yttervegg — Ytterveggselementer inkl. materialer (sandwich-plater), montering, beslag, skruer, fugemasse
2. innervegg — Innerveggselementer inkl. materialer, montering, beslag
3. tak — Takplater/TRP/taktekning inkl. materialer, montering, takrenne, beslag, tekking
4. kran_lift — Kran og lift: all transport og maskinleie for hele prosjektet
5. dorer_vinduer — Dører og vinduer inkl. montering
6. betong — Betongarbeid og fundament (kun hvis relevant)
7. graving — Graving og grunnarbeid (kun hvis relevant)
8. andre — Andre poster du identifiserer

KRITISK: Returner KUN gyldig JSON. Ingen tekst før/etter. Ingen markdown blokker. Starter med { slutter med }.

SVARSFORMAT:
{
  "project_summary": "2-3 setninger om prosjektet",
  "building": { "type": "...", "size_m2": null, "dimensions": "...", "location": "..." },
  "blocks": [
    { "id": "yttervegg", "name": "Ytterveggselementer", "included": true,
      "price_low": 180000, "price_high": 240000, "confidence": "lav|middels|høy",
      "basis": "...", "assumptions": ["..."], "missing_info": ["..."] }
  ],
  "total_low": 0, "total_high": 0,
  "exclusions": ["..."], "warnings": ["..."],
  "recommended_rigg_pct": 8
}`

const BATCH_SUMMARY_PROMPT = `Du er en erfaren kalkulatør hos Ferro Stålentreprenør AS. Du mottar NOEN dokumenter fra et større prosjekt (ikke alle). Din oppgave er å ekstrahere RELEVANTE FAKTA for senere kalkulasjon.

Returner KUN gyldig JSON i dette formatet:
{
  "building_info": {
    "type": "bygg-type hvis nevnt",
    "dimensions": "mål hvis funnet (f.eks. 29×12×5,3m)",
    "area_m2": null,
    "location": "sted hvis nevnt"
  },
  "quantities_found": [
    "Fasadetegninger viser 3 yttervegger ca 350m²",
    "TRP-tak ca 380m²"
  ],
  "prices_found": [
    "Ruukki tilbud stål: 420 000 kr"
  ],
  "scope_notes": [
    "Kun yttervegg og tak er i scope"
  ],
  "exclusions_mentioned": ["..."],
  "uncertainty_notes": ["..."]
}

Ingen tekst utenfor JSON. Hvis informasjon mangler — bruk tomme arrays, null.`

const MERGE_SYSTEM_PROMPT = `Du er en erfaren kalkulatør hos Ferro Stålentreprenør AS.
Du mottar SAMMENDRAG fra flere dokument-batcher fra samme prosjekt. Du skal konsolidere alt til ett prisestimat.

VIKTIG — Filosofi:
- Du gir OMTRENTLIGE prisintervaller basert på ALLE sammendragene
- Stål-konstruksjonen vurderer bruker selv — ikke ta den med
- Bruk fakta fra alle batcher for å lage et helhetlig estimat

ARBEIDSBLOKKER (kun relevante for dette prosjektet):
1. yttervegg, 2. innervegg, 3. tak, 4. kran_lift, 5. dorer_vinduer, 6. betong, 7. graving, 8. andre

KRITISK: Returner KUN gyldig JSON. Ingen markdown. Starter med { slutter med }.

SVARSFORMAT:
{
  "project_summary": "2-3 setninger om prosjektet",
  "building": { "type": "...", "size_m2": null, "dimensions": "...", "location": "..." },
  "blocks": [
    { "id": "yttervegg", "name": "Ytterveggselementer", "included": true,
      "price_low": 180000, "price_high": 240000, "confidence": "lav|middels|høy",
      "basis": "...", "assumptions": ["..."], "missing_info": ["..."] }
  ],
  "total_low": 0, "total_high": 0,
  "exclusions": ["..."], "warnings": ["..."],
  "recommended_rigg_pct": 8
}`

// ─── File handling ───────────────────────────────────────────────────────────
async function fileToContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Kunne ikke lese: ${file.name}`))
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      const mime = file.type || 'application/octet-stream'

      if (mime === 'application/pdf') {
        resolve({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 }, title: file.name })
      } else if (mime.startsWith('image/')) {
        const validMime = ['image/jpeg','image/png','image/gif','image/webp'].includes(mime) ? mime : 'image/jpeg'
        resolve({ type: 'image', source: { type: 'base64', media_type: validMime, data: base64 } })
      } else {
        resolve(null)
      }
    }
    reader.readAsDataURL(file)
  })
}

async function textFileToContent(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ type: 'text', text: `[Fil: ${file.name}]\n${reader.result}` })
    reader.onerror = () => resolve({ type: 'text', text: `[Fil: ${file.name} — kunne ikke leses]` })
    reader.readAsText(file)
  })
}

// ─── JSON extraction ─────────────────────────────────────────────────────────
function extractJSON(text) {
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    cleaned = cleaned.substring(first, last + 1)
  }
  return cleaned.trim()
}

// ─── Batching logic ──────────────────────────────────────────────────────────
function splitIntoBatches(files) {
  const batches = []
  let current = []
  let currentSize = 0

  const sorted = [...files].sort((a, b) => b.size - a.size)

  for (const file of sorted) {
    const sizeMB = file.size / 1024 / 1024
    if (sizeMB > MAX_BATCH_SIZE_MB) {
      if (current.length) { batches.push(current); current = []; currentSize = 0 }
      batches.push([file])
      continue
    }
    if (currentSize + sizeMB > MAX_BATCH_SIZE_MB && current.length > 0) {
      batches.push(current)
      current = [file]
      currentSize = sizeMB
    } else {
      current.push(file)
      currentSize += sizeMB
    }
  }
  if (current.length) batches.push(current)
  return batches
}

// ─── API call with rate-limit retry ──────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function callClaude(apiKey, system, userContent, onStatus, retries = 2) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: userContent }]
    })
  })

  if (response.status === 429 && retries > 0) {
    const retryAfter = parseInt(response.headers.get('retry-after')) || 60
    for (let s = retryAfter; s > 0; s--) {
      onStatus?.(`⏳ Rate limit — venter ${s}s før retry...`)
      await sleep(1000)
    }
    return callClaude(apiKey, system, userContent, onStatus, retries - 1)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `API-feil ${response.status}`)
  }

  const data = await response.json()
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function analyzeProject(files, extraInfo, apiKey, onStatus) {
  onStatus('Forbereder filer...')

  const totalMB = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024
  const useBatching = totalMB > SINGLE_CALL_LIMIT_MB && files.length > 1

  if (!useBatching) {
    return await analyzeSingleCall(files, extraInfo, apiKey, onStatus)
  }

  // Batched analysis
  const batches = splitIntoBatches(files)
  onStatus(`📦 Stort prosjekt (${totalMB.toFixed(1)} MB) — deler opp i ${batches.length} batcher`)
  await sleep(1200)

  const summaries = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const batchMB = batch.reduce((s, f) => s + f.size, 0) / 1024 / 1024

    onStatus(`Batch ${i + 1}/${batches.length}: leser ${batch.length} fil(er) (${batchMB.toFixed(1)} MB)...`)

    const content = [{
      type: 'text',
      text: `Dette er batch ${i + 1} av ${batches.length} fra samme prosjekt. Ekstrahér fakta som kan brukes til kalkulasjon.`
    }]

    for (const file of batch) {
      const mime = file.type || ''
      let block
      if (mime === 'application/pdf' || mime.startsWith('image/')) {
        block = await fileToContent(file)
      } else {
        block = await textFileToContent(file)
      }
      if (block) {
        content.push({ type: 'text', text: `\n--- Dokument: ${file.name} ---` })
        content.push(block)
      }
    }

    onStatus(`Batch ${i + 1}/${batches.length}: sender til Claude AI...`)
    const rawText = await callClaude(apiKey, BATCH_SUMMARY_PROMPT, content, onStatus)
    summaries.push({
      batchIndex: i + 1,
      fileNames: batch.map(f => f.name),
      summary: extractJSON(rawText)
    })

    if (i < batches.length - 1) {
      const waitSec = BATCH_PAUSE_MS / 1000
      for (let s = waitSec; s > 0; s--) {
        onStatus(`⏳ Venter ${s}s før neste batch (rate limit)...`)
        await sleep(1000)
      }
    }
  }

  // Merge
  onStatus(`🔀 Konsoliderer ${summaries.length} sammendrag til endelig estimat...`)

  const mergeText = `Her er sammendrag fra ${summaries.length} batcher fra samme prosjekt:

${summaries.map(s => `=== BATCH ${s.batchIndex} (filer: ${s.fileNames.join(', ')}) ===\n${s.summary}`).join('\n\n')}
${extraInfo ? `\nTilleggsinformasjon fra bruker:\n${extraInfo}\n` : ''}
Lag et helhetlig prisestimat basert på ALL informasjonen over.`

  const finalRaw = await callClaude(apiKey, MERGE_SYSTEM_PROMPT, [{ type: 'text', text: mergeText }], onStatus)
  return parseAndValidate(finalRaw)
}

// ─── Single-call path ────────────────────────────────────────────────────────
async function analyzeSingleCall(files, extraInfo, apiKey, onStatus) {
  const content = [{
    type: 'text',
    text: `Jeg laster opp ${files.length} prosjektdokument(er) for analyse.${extraInfo ? `\n\nTilleggsinformasjon:\n${extraInfo}` : ''}\n\nAnalyser dokumentene og gi et grovt prisestimat per arbeidsblokk.`
  }]

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onStatus(`Leser fil ${i + 1}/${files.length}: ${file.name}`)
    const mime = file.type || ''
    let block
    if (mime === 'application/pdf' || mime.startsWith('image/')) {
      block = await fileToContent(file)
    } else {
      block = await textFileToContent(file)
    }
    if (block) {
      content.push({ type: 'text', text: `\n--- Dokument: ${file.name} ---` })
      content.push(block)
    }
  }

  onStatus('Sender til Claude AI...')
  const rawText = await callClaude(apiKey, FULL_SYSTEM_PROMPT, content, onStatus)
  return parseAndValidate(rawText)
}

function parseAndValidate(rawText) {
  const cleaned = extractJSON(rawText)
  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('JSON failed. Raw:', rawText)
    throw new Error('AI svarte ikke med gyldig JSON. Prøv igjen.')
  }

  if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
    throw new Error('AI-svar mangler arbeidsblokker. Prøv igjen.')
  }

  if (!parsed.total_low || !parsed.total_high) {
    const inc = (parsed.blocks || []).filter(b => b.included)
    parsed.total_low = inc.reduce((s, b) => s + (b.price_low || 0), 0)
    parsed.total_high = inc.reduce((s, b) => s + (b.price_high || 0), 0)
  }
  return parsed
}
