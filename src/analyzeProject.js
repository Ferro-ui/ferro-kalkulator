// The core AI analysis logic.
// Sends all uploaded project files to Claude API and gets back
// high-level price range estimates per work block.

const SYSTEM_PROMPT = `Du er en erfaren kalkulatør hos Ferro Stålentreprenør AS i Norge.
Du mottar dokumenter fra et prosjekt (tilbud fra leverandører, arkitekttegninger, tidligere kalkulasjoner, bilder, e-poster, etc.) og skal gi et GROVT prisestimat fordelt på arbeidsblokker.

VIKTIG — Filosofi:
- Du gir OMTRENTLIGE prisintervaller, ikke eksakte beregninger
- Intervallene skal reflektere reell usikkerhet basert på tilgjengelig informasjon
- Hvis informasjonen er mangelfull, gi VIDERE intervall og forklar hva som mangler
- Stål-konstruksjonen vurderer bruker selv — ikke ta den med
- Se på ALLE dokumenter samlet for å forstå prosjektet

ARBEIDSBLOKKER du skal vurdere (kun de som er relevante for dette prosjektet):

1. yttervegg — Ytterveggselementer inkl. materialer (sandwich-plater), montering, beslag, skruer, fugemasse. Alt i ett
2. innervegg — Innerveggselementer inkl. materialer, montering, beslag
3. tak — Takplater/TRP/taktekning inkl. materialer, montering, takrenne, beslag, tekking
4. kran_lift — Kran og lift: all transport og maskinleie for hele prosjektet, vurdert ut fra byggets størrelse og arbeidsmengde
5. dorer_vinduer — Dører og vinduer: omtrentlig totalkostnad inkl. montering
6. betong — Betongarbeid og fundament (kun hvis relevant for prosjektet)
7. graving — Graving og grunnarbeid (kun hvis relevant)
8. andre — Andre poster du identifiserer som relevante (beskriv hva)

KRITISK: Du MÅ returnere KUN gyldig JSON. Ingen tekst før eller etter. Ingen \`\`\`json blokker. Ingen forklaring. KUN JSON som starter med { og slutter med }.

SVARSFORMAT:
{
  "project_summary": "2-3 setninger om prosjektet basert på dokumentene",
  "building": {
    "type": "type bygg (lager, vaskehall, industribygg, etc.)",
    "size_m2": null_eller_tall,
    "dimensions": "f.eks. 30×15×6m hvis funnet",
    "location": "sted hvis funnet"
  },
  "blocks": [
    {
      "id": "yttervegg",
      "name": "Ytterveggselementer",
      "included": true,
      "price_low": 180000,
      "price_high": 240000,
      "confidence": "lav|middels|høy",
      "basis": "Hva prisvurderingen er basert på (hvilke dokumenter, hvilke antagelser)",
      "assumptions": ["Antagelse 1", "Antagelse 2"],
      "missing_info": ["Hva som mangler for bedre estimat"]
    }
  ],
  "total_low": 0,
  "total_high": 0,
  "exclusions": ["Stålkonstruksjon — vurderes separat", "Andre poster som er UTELATT"],
  "warnings": ["Viktige forbehold eller usikkerheter"],
  "recommended_rigg_pct": 8
}`

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
        // Text files — read as text instead
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

// Improved JSON extraction
function extractJSON(text) {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  
  // Try to find JSON object boundaries
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }
  
  return cleaned.trim()
}

export async function analyzeProject(files, extraInfo, apiKey, onStatus) {
  onStatus('Forbereder filer...')

  const contentBlocks = []

  // Add intro text
  contentBlocks.push({
    type: 'text',
    text: `Jeg laster opp ${files.length} prosjektdokument(er) for analyse. ${extraInfo ? `\n\nTilleggsinformasjon fra meg:\n${extraInfo}` : ''}\n\nAnalyser alle dokumentene og gi et grovt prisestimat per arbeidsblokk.`
  })

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onStatus(`Leser fil ${i + 1}/${files.length}: ${file.name}`)

    const mime = file.type || ''
    let block

    if (mime === 'application/pdf' || mime.startsWith('image/')) {
      block = await fileToContent(file)
    } else {
      // Treat as text (xlsx info, txt, etc.)
      block = await textFileToContent(file)
    }

    if (block) {
      // Add filename label before each file
      contentBlocks.push({ type: 'text', text: `\n--- Dokument: ${file.name} ---` })
      contentBlocks.push(block)
    }
  }

  onStatus('Sender til Claude AI...')

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
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contentBlocks }]
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `API-feil ${response.status}`)
  }

  onStatus('Tolker svar...')

  const data = await response.json()
  const rawText = data.content.filter(b => b.type === 'text').map(b => b.text).join('')
  
  // Enhanced JSON extraction
  const cleaned = extractJSON(rawText)

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch (parseError) {
    // Log for debugging
    console.error('=== JSON PARSE ERROR ===')
    console.error('Raw response:', rawText)
    console.error('Cleaned:', cleaned)
    console.error('Error:', parseError.message)
    console.error('========================')
    
    // More helpful error message
    throw new Error('AI svarte ikke med gyldig JSON. Prøv igjen eller kontakt support. (Se console for detaljer)')
  }

  // Validate required fields
  if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
    throw new Error('AI-svar mangler arbeidsblokker. Prøv igjen.')
  }

  // Calculate totals if not provided
  if (!parsed.total_low || !parsed.total_high) {
    const included = (parsed.blocks || []).filter(b => b.included)
    parsed.total_low = included.reduce((s, b) => s + (b.price_low || 0), 0)
    parsed.total_high = included.reduce((s, b) => s + (b.price_high || 0), 0)
  }

  return parsed
}