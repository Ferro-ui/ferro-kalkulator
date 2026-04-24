// Sends project files to Claude API in batches (to avoid rate limits)
// and merges results into one high-level price estimate.
// Uses historiske_prosjekter.json as reference context.

import historiskeProsjekter from './historiske_prosjekter.json'

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

FILTYPER — hver fil har en etikett i format [TYPE] filnavn:
- [TEGNING] — arkitekttegning, bruk for å finne mål og scope (ikke pris)
- [TILBUD FRA LEVERANDØR] — innkjøpspris fra leverandør (Ruukki, Storm, Crawford osv.).
  VIKTIG: Dette er det VI betaler. Legg til påslag 15-35% for prisen TIL kunde.
- [VÅRT TILBUD] — det vi allerede har tilbudt en kunde. Bruk som referanse for påslagslogikk.
- [KALKULASJON] — vår interne kalkulasjon (xlsx). Inneholder ofte sluttpriser.
- [REFERANSE] — generell dokumentasjon, tidligere prosjekter, etc.
- [DOKUMENT] — standard dokument uten spesifikk rolle.

Hvis du ser [TILBUD FRA LEVERANDØR], bruk denne prisen som basis for innkjøp, og legg til påslag per blokk når du setter price_low/price_high for kunden.

SVARSFORMAT (hold deg KORT — maks 2 setninger per tekstfelt):
{
  "project_summary": "MAKS 2 setninger om prosjektet",
  "building": { "type": "kort", "size_m2": null, "dimensions": "kort", "location": "kort" },
  "blocks": [
    { "id": "yttervegg", "name": "Ytterveggselementer", "included": true,
      "price_low": 180000, "price_high": 240000, "confidence": "lav|middels|høy",
      "paslag_pct": 15,
      "basis": "MAKS 1-2 setninger — hvilket historisk prosjekt brukt som ref + beregning",
      "assumptions": ["maks 3 punkter, hver maks 10 ord"],
      "missing_info": ["maks 2 punkter, hver maks 10 ord"] }
  ],
  "total_low": 0, "total_high": 0,
  "exclusions": ["kort"], "warnings": ["kort"],
  "recommended_rigg_pct": 8,
  "forutsetninger": {
    "u_verdi_tak": 0.18,
    "u_verdi_vegg": 0.18,
    "u_verdi_glass": 1.2,
    "tiltaksklasse": "2",
    "bruddgrense_kn_m2": 250,
    "gyldighet_dager": 14
  }
}

KRITISK: Vær KONSIS. Ingen lange forklaringer. Detaljene kan brukeren spørre om senere.

PÅSLAG — sett paslag_pct per blokk basert på Ferro-historikk:
- yttervegg/innervegg/tak/dorer_vinduer: 15-20%
- stål: 25-35% (hvis tatt med)
- kran_lift: 10-15% (UE-tungt)
- betong: 10-15% (UE)
- graving: 10% (UE)
- andre: 15% default
Prisene (price_low/price_high) SKAL allerede inkludere påslag. paslag_pct er informativ.

FORUTSETNINGER — vurder per prosjekt basert på byggtype:
- Oppvarmet bygg (butikk, verksted, kontor, vaskehall): U-verdi tak/vegg 0.18, glass 1.2
- Uoppvarmet (kaldtlager, båtopplag, sandlager): U-verdi null (uisolert) eller 0.22-0.30
- Tiltaksklasse: "1" for små enkle bygg, "2" for vanlige, "3" for komplekse
- Bruddgrense vanligvis 250 kN/m², men kan være 200-400 avhengig av grunnforhold
- Gyldighet: 14 dager default, 30 for større/komplekse prosjekter`

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

SVARSFORMAT (hold deg KORT — maks 2 setninger per tekstfelt):
{
  "project_summary": "MAKS 2 setninger om prosjektet",
  "building": { "type": "kort", "size_m2": null, "dimensions": "kort", "location": "kort" },
  "blocks": [
    { "id": "yttervegg", "name": "Ytterveggselementer", "included": true,
      "price_low": 180000, "price_high": 240000, "confidence": "lav|middels|høy",
      "paslag_pct": 15,
      "basis": "MAKS 1-2 setninger — hvilket historisk prosjekt brukt som ref + beregning",
      "assumptions": ["maks 3 punkter, hver maks 10 ord"],
      "missing_info": ["maks 2 punkter, hver maks 10 ord"] }
  ],
  "total_low": 0, "total_high": 0,
  "exclusions": ["kort"], "warnings": ["kort"],
  "recommended_rigg_pct": 8,
  "forutsetninger": {
    "u_verdi_tak": 0.18,
    "u_verdi_vegg": 0.18,
    "u_verdi_glass": 1.2,
    "tiltaksklasse": "2",
    "bruddgrense_kn_m2": 250,
    "gyldighet_dager": 14
  }
}

KRITISK: Vær KONSIS. Ingen lange forklaringer. Detaljene kan brukeren spørre om senere.

PÅSLAG — sett paslag_pct per blokk basert på Ferro-historikk:
- yttervegg/innervegg/tak/dorer_vinduer: 15-20%
- stål: 25-35% (hvis tatt med)
- kran_lift: 10-15% (UE-tungt)
- betong: 10-15% (UE)
- graving: 10% (UE)
- andre: 15% default
Prisene (price_low/price_high) SKAL allerede inkludere påslag. paslag_pct er informativ.

FORUTSETNINGER — vurder per prosjekt basert på byggtype:
- Oppvarmet bygg (butikk, verksted, kontor, vaskehall): U-verdi tak/vegg 0.18, glass 1.2
- Uoppvarmet (kaldtlager, båtopplag, sandlager): U-verdi null (uisolert) eller 0.22-0.30
- Tiltaksklasse: "1" for små enkle bygg, "2" for vanlige, "3" for komplekse
- Bruddgrense vanligvis 250 kN/m², men kan være 200-400 avhengig av grunnforhold
- Gyldighet: 14 dager default, 30 for større/komplekse prosjekter`

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
function splitIntoBatches(wrappedFiles) {
  const batches = []
  let current = []
  let currentSize = 0

  const sorted = [...wrappedFiles].sort((a, b) => b.file.size - a.file.size)

  for (const wrapped of sorted) {
    const sizeMB = wrapped.file.size / 1024 / 1024
    if (sizeMB > MAX_BATCH_SIZE_MB) {
      if (current.length) { batches.push(current); current = []; currentSize = 0 }
      batches.push([wrapped])
      continue
    }
    if (currentSize + sizeMB > MAX_BATCH_SIZE_MB && current.length > 0) {
      batches.push(current)
      current = [wrapped]
      currentSize = sizeMB
    } else {
      current.push(wrapped)
      currentSize += sizeMB
    }
  }
  if (current.length) batches.push(current)
  return batches
}

// File type label for AI — tells it how to interpret the file
function fileTypeLabel(type) {
  return {
    drawing: 'TEGNING',
    supplier_tilbud: 'TILBUD FRA LEVERANDØR (innkjøpspris — må ha påslag for kunde)',
    our_tilbud: 'VÅRT TILBUD',
    kalk: 'KALKULASJON',
    reference: 'REFERANSE',
    other: 'DOKUMENT',
  }[type] || 'DOKUMENT'
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
      max_tokens: 8192,
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


// ─── Build feedback context (past estimate vs actual) ───────────────────────
function buildFeedbackContext() {
  let feedback = []
  try {
    const raw = localStorage.getItem('ferro_feedback_v1')
    feedback = raw ? JSON.parse(raw) : []
  } catch {}
  if (!feedback.length) return ''

  const lines = [
    '',
    '═══════════════════════════════════════════════════════════',
    'FEEDBACK FRA TIDLIGERE ESTIMATER — KALIBRERING',
    '═══════════════════════════════════════════════════════════',
    'Reelle avvik mellom AI-estimat og faktisk tilbud hos Ferro:',
    '',
  ]

  let avvikSum = 0, count = 0
  for (const e of feedback) {
    const aiMid = e.ai_low && e.ai_high ? Math.round((e.ai_low + e.ai_high) / 2) : null
    const faktisk = e.faktisk_tilbud
    let avvikStr = ''
    if (aiMid && faktisk) {
      const pct = Math.round(((faktisk - aiMid) / aiMid) * 100)
      avvikStr = `(${pct > 0 ? '+' : ''}${pct}% fra AI midtpunkt)`
      avvikSum += pct
      count++
    }
    lines.push(`  ${e.name || '(ukjent)'}:`)
    if (e.ai_low && e.ai_high) lines.push(`    AI estimat: ${e.ai_low.toLocaleString('nb-NO')} – ${e.ai_high.toLocaleString('nb-NO')} kr`)
    lines.push(`    Faktisk tilbud: ${faktisk?.toLocaleString('nb-NO')} kr ${avvikStr}`)
    if (e.solgt_for) lines.push(`    Solgt for: ${e.solgt_for.toLocaleString('nb-NO')} kr`)
    if (e.kommentar) lines.push(`    Kommentar: ${e.kommentar}`)
    lines.push('')
  }

  if (count > 0) {
    const avg = Math.round(avvikSum / count)
    lines.push(`Systematisk avvik over ${count} prosjekter: gjennomsnittlig ${avg > 0 ? '+' : ''}${avg}% fra AI midtpunkt.`)
    if (avg > 3) lines.push(`→ JUSTER ESTIMATENE OPP ca. ${avg}% for å kompensere for undervurdering.`)
    else if (avg < -3) lines.push(`→ AI har overvurdert — vær litt forsiktigere med høy-tallene.`)
  }
  lines.push('═══════════════════════════════════════════════════════════')
  return lines.join('\n')
}

// ─── Build historical context ────────────────────────────────────────────────
function buildHistoricalContext() {
  if (!historiskeProsjekter || historiskeProsjekter.length === 0) return ''

  const lines = [
    '\n\n═══════════════════════════════════════════════════════════',
    'FERRO HISTORISKE PROSJEKTER — DIN VIKTIGSTE KALIBRERING',
    '═══════════════════════════════════════════════════════════',
    '',
    'REGEL: Finn det MEST LIGNENDE prosjektet i listen nedenfor basert på:',
    '  - Byggtype (vaskehall, lager, verksted, industribygg)',
    '  - Størrelse (m² og dimensjoner)',
    '  - Scope (hva Ferro leverte)',
    'Bruk det som hovedreferanse for pris. Juster for forskjeller.',
    ''
  ]

  historiskeProsjekter.forEach((p, i) => {
    const bygg = p.bygg || {}
    const priser = p.priser_til_kunde || p.priser || {}
    const innkjop = p.innkjop_fra_leverandorer || {}
    const paaslag = p.paaslag_beregnet || {}

    lines.push(`──── ${i + 1}. ${p.navn} ────`)

    // Building specs
    const parts = []
    if (bygg.type) parts.push(bygg.type)
    if (bygg.dimensjoner) parts.push(bygg.dimensjoner)
    if (bygg.bra_m2) parts.push(`${bygg.bra_m2} m² BRA`)
    if (bygg.fasade_m2) parts.push(`${bygg.fasade_m2} m² fasade`)
    if (bygg.tak_m2) parts.push(`${bygg.tak_m2} m² tak`)
    if (bygg.lokasjon) parts.push(bygg.lokasjon)
    if (parts.length) lines.push(`  Bygg: ${parts.join(', ')}`)

    if (p.scope) lines.push(`  Scope: ${p.scope}`)
    if (p.tekniske_losninger) lines.push(`  Tekniske løsninger: ${p.tekniske_losninger}`)

    // Customer prices
    const custPrices = []
    if (priser.stal) custPrices.push(`stål ${priser.stal.toLocaleString('nb-NO')}`)
    if (priser.yttervegg) custPrices.push(`yttervegg ${priser.yttervegg.toLocaleString('nb-NO')}`)
    if (priser.innervegg) custPrices.push(`innervegg ${priser.innervegg.toLocaleString('nb-NO')}`)
    if (priser.tak) custPrices.push(`tak ${priser.tak.toLocaleString('nb-NO')}`)
    if (priser.kran_lift) custPrices.push(`kran/lift ${priser.kran_lift.toLocaleString('nb-NO')}`)
    if (priser.dorer_vinduer) custPrices.push(`dører/vinduer ${priser.dorer_vinduer.toLocaleString('nb-NO')}`)
    if (priser.betong) custPrices.push(`betong ${priser.betong.toLocaleString('nb-NO')}`)
    if (priser.graving) custPrices.push(`graving ${priser.graving.toLocaleString('nb-NO')}`)
    if (custPrices.length) lines.push(`  Priser til kunde (kr): ${custPrices.join(', ')}`)
    if (priser.sum_eks_mva) lines.push(`  SUM EKS MVA: ${priser.sum_eks_mva.toLocaleString('nb-NO')} kr`)
    if (priser.rigg_drift_pct) lines.push(`  Rigg og drift: ${priser.rigg_drift_pct}%`)

    // Supplier / purchase data — shows pricing logic
    const innkjopParts = []
    if (innkjop.stal_leverandor) innkjopParts.push(`stål: ${innkjop.stal_leverandor}`)
    if (innkjop.stal_innkjop_kr) innkjopParts.push(`stål innkjøp ${innkjop.stal_innkjop_kr.toLocaleString('nb-NO')}`)
    if (innkjop.sandwich_leverandor) innkjopParts.push(`sandwich: ${innkjop.sandwich_leverandor}`)
    if (innkjop.sandwich_type) innkjopParts.push(`type ${innkjop.sandwich_type}`)
    if (innkjop.sandwich_innkjop_kr) innkjopParts.push(`sandwich innkjøp ${innkjop.sandwich_innkjop_kr.toLocaleString('nb-NO')}`)
    if (innkjop.tak_leverandor) innkjopParts.push(`tak: ${innkjop.tak_leverandor}`)
    if (innkjop.andre_ue) innkjopParts.push(`UE: ${innkjop.andre_ue}`)
    if (innkjopParts.length) lines.push(`  Innkjøp: ${innkjopParts.join(' | ')}`)

    // Calculated markups — learning material
    if (paaslag.stal_paslag || paaslag.sandwich_paslag) {
      const p1 = []
      if (paaslag.stal_paslag) p1.push(`stål ×${paaslag.stal_paslag}`)
      if (paaslag.sandwich_paslag) p1.push(`sandwich ×${paaslag.sandwich_paslag}`)
      lines.push(`  Påslag brukt: ${p1.join(', ')}`)
    }
    if (paaslag.kommentar) lines.push(`  Påslag-logikk: ${paaslag.kommentar}`)

    if (p.merknader) lines.push(`  Merknader: ${p.merknader}`)

    // Detailed calculation breakdown (NEW — from deep xlsx scan)
    if (p.detaljert_kalkulasjon?.blokker) {
      lines.push(`  📊 DETALJERT KALKULASJON:`)
      const blokker = p.detaljert_kalkulasjon.blokker
      for (const [blokk, data] of Object.entries(blokker)) {
        if (!data?.poster || data.poster.length === 0) continue
        lines.push(`     ${blokk.toUpperCase()} (total ${data.total_kr?.toLocaleString('nb-NO') || '?'} kr):`)
        for (const post of data.poster) {
          const mengde = post.mengde ? `${post.mengde} ${post.enhet || ''}` : ''
          const pris = post.enhetspris ? `à ${post.enhetspris} kr` : ''
          const sum = post.sum ? `= ${post.sum.toLocaleString('nb-NO')} kr` : ''
          lines.push(`       · ${post.navn}: ${mengde} ${pris} ${sum}`.trim())
        }
      }
    }

    lines.push('')
  })

  lines.push('═══════════════════════════════════════════════════════════')
  lines.push('INSTRUKSJON FOR PRISSETTING:')
  lines.push('1. Identifiser hvilket historisk prosjekt som ligner MEST på det nye')
  lines.push('2. Bruk dets priser som utgangspunkt')
  lines.push('3. Juster opp/ned basert på m², kompleksitet, scope-forskjeller')
  lines.push('4. Påslag-logikken viser hvordan Ferro pricer materialer')
  lines.push('5. Oppgi i "basis" HVILKET historisk prosjekt du sammenlignet med')
  lines.push('')
  lines.push('KRITISK — BRUK DETALJERT KALKULASJON:')
  lines.push('Når du ser "📊 DETALJERT KALKULASJON" — det er FULLSTENDIG prisstruktur.')
  lines.push('Eks: "tak" består av takplater + montering + festemateriell + overgangsbeslag + tekkebeslag.')
  lines.push('Når du priser "tak"-blokken, sum ALLE disse underpostene — ikke bare materialet.')
  lines.push('Hvis leverandørtilbud dekker kun materiale (f.eks. takplater), LEGG TIL:')
  lines.push('  - Montering (~130 kr/m²)')
  lines.push('  - Festemateriell (~115 kr/m²)')
  lines.push('  - Beslag (~290 kr/lm)')
  lines.push('Ellers blir prisen 40-50% for lav.')
  lines.push('═══════════════════════════════════════════════════════════\n')

  return lines.join('\n')
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function analyzeProject(wrappedFiles, extraInfo, apiKey, onStatus) {
  onStatus('Forbereder filer...')

  // Support both old format (File[]) and new ({file, fileType}[])
  const normalized = wrappedFiles.map(f => f.file ? f : { file: f, fileType: 'other' })

  const totalMB = normalized.reduce((s, w) => s + w.file.size, 0) / 1024 / 1024
  const useBatching = totalMB > SINGLE_CALL_LIMIT_MB && normalized.length > 1

  if (!useBatching) {
    return await analyzeSingleCall(normalized, extraInfo, apiKey, onStatus)
  }

  // Batched analysis
  const batches = splitIntoBatches(normalized)
  onStatus(`📦 Stort prosjekt (${totalMB.toFixed(1)} MB) — deler opp i ${batches.length} batcher`)
  await sleep(1200)

  const summaries = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const batchMB = batch.reduce((s, w) => s + w.file.size, 0) / 1024 / 1024

    onStatus(`Batch ${i + 1}/${batches.length}: leser ${batch.length} fil(er) (${batchMB.toFixed(1)} MB)...`)

    const content = [{
      type: 'text',
      text: `Dette er batch ${i + 1} av ${batches.length} fra samme prosjekt. Ekstrahér fakta som kan brukes til kalkulasjon.`
    }]

    for (const wrapped of batch) {
      const file = wrapped.file
      const mime = file.type || ''
      let block
      if (mime === 'application/pdf' || mime.startsWith('image/')) {
        block = await fileToContent(file)
      } else {
        block = await textFileToContent(file)
      }
      if (block) {
        content.push({ type: 'text', text: `\n--- [${fileTypeLabel(wrapped.fileType)}] ${file.name} ---` })
        content.push(block)
      }
    }

    onStatus(`Batch ${i + 1}/${batches.length}: sender til Claude AI...`)
    const rawText = await callClaude(apiKey, BATCH_SUMMARY_PROMPT, content, onStatus)
    summaries.push({
      batchIndex: i + 1,
      fileNames: batch.map(w => w.file.name),
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

  const historicalContext = buildHistoricalContext()
  const feedbackContext = buildFeedbackContext()
  const mergeText = `Her er sammendrag fra ${summaries.length} batcher fra samme prosjekt:

${summaries.map(s => `=== BATCH ${s.batchIndex} (filer: ${s.fileNames.join(', ')}) ===\n${s.summary}`).join('\n\n')}
${extraInfo ? `\nTilleggsinformasjon fra bruker:\n${extraInfo}\n` : ''}${feedbackContext}${historicalContext}
Lag et helhetlig prisestimat basert på ALL informasjonen over.`

  const finalRaw = await callClaude(apiKey, MERGE_SYSTEM_PROMPT, [{ type: 'text', text: mergeText }], onStatus)
  return parseAndValidate(finalRaw)
}

// ─── Single-call path ────────────────────────────────────────────────────────
async function analyzeSingleCall(wrappedFiles, extraInfo, apiKey, onStatus) {
  const historicalContext = buildHistoricalContext()
  const feedbackContext = buildFeedbackContext()
  const content = [{
    type: 'text',
    text: `Jeg laster opp ${wrappedFiles.length} prosjektdokument(er) for analyse.${extraInfo ? `\n\nTilleggsinformasjon:\n${extraInfo}` : ''}${feedbackContext}${historicalContext}\n\nAnalyser dokumentene og gi et grovt prisestimat per arbeidsblokk.`
  }]

  for (let i = 0; i < wrappedFiles.length; i++) {
    const wrapped = wrappedFiles[i]
    const file = wrapped.file
    onStatus(`Leser fil ${i + 1}/${wrappedFiles.length}: ${file.name}`)
    const mime = file.type || ''
    let block
    if (mime === 'application/pdf' || mime.startsWith('image/')) {
      block = await fileToContent(file)
    } else {
      block = await textFileToContent(file)
    }
    if (block) {
      content.push({ type: 'text', text: `\n--- [${fileTypeLabel(wrapped.fileType)}] ${file.name} ---` })
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
