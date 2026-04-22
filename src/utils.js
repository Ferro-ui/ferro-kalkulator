const STORAGE_KEY = 'ferro_project_v2'
const API_KEY_STORAGE = 'ferro_anthropic_key'
const SIGNER_STORAGE = 'ferro_signer'

const DEFAULT_SIGNER = {
  name: 'Marian Mychko',
  title: 'Kalkulatør',
  tlf: '91 92 36 26',
  email: 'marian@ferrostal.no',
}

export const fmt = (n) => n == null ? '–' : Math.round(n).toLocaleString('nb-NO')
export const fmtKr = (n) => fmt(n) + ' kr'

export function saveProject(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}

export function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearProject() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

export function saveApiKey(key) {
  try { localStorage.setItem(API_KEY_STORAGE, key) } catch {}
}

export function loadApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || '' } catch { return '' }
}

export function saveSigner(signer) {
  try { localStorage.setItem(SIGNER_STORAGE, JSON.stringify(signer)) } catch {}
}

export function loadSigner() {
  try {
    const raw = localStorage.getItem(SIGNER_STORAGE)
    return raw ? { ...DEFAULT_SIGNER, ...JSON.parse(raw) } : { ...DEFAULT_SIGNER }
  } catch { return { ...DEFAULT_SIGNER } }
}

// Confidence label
export function confidenceLabel(c) {
  return { lav: 'Lav', middels: 'Middels', høy: 'Høy' }[c] || c
}

export function confidenceColor(c) {
  return { lav: 'var(--warning)', middels: 'var(--blue)', høy: 'var(--success)' }[c] || 'var(--text-dim)'
}

// Export summary as txt
export function exportSummary(result, projectName, stalPrice, riggPct) {
  const blocks = (result.blocks || []).filter(b => b.included)
  const totalLow = blocks.reduce((s,b) => s + (b.price_low||0), 0)
  const totalHigh = blocks.reduce((s,b) => s + (b.price_high||0), 0)
  const riggLow = totalLow * (riggPct/100)
  const riggHigh = totalHigh * (riggPct/100)
  const stalVal = stalPrice || 0

  const lines = [
    'FERRO STÅLENTREPRENØR AS — PROSJEKTESTIMAT',
    `Prosjekt: ${projectName || '(uten navn)'}`,
    `Dato: ${new Date().toLocaleDateString('nb-NO')}`,
    '',
    result.project_summary || '',
    result.building?.dimensions ? `Bygg: ${result.building.type || ''} · ${result.building.dimensions}` : '',
    '',
    '─'.repeat(70),
    `${'ARBEIDSBLOKK'.padEnd(35)} ${'FRA'.padStart(14)} ${'TIL'.padStart(14)}`,
    '─'.repeat(70),
  ]

  if (stalVal > 0) {
    lines.push(`${'Stålkonstruksjon'.padEnd(35)} ${fmtKr(stalVal).padStart(14)} ${fmtKr(stalVal).padStart(14)}`)
  }

  blocks.forEach(b => {
    lines.push(`${b.name.padEnd(35)} ${fmtKr(b.price_low).padStart(14)} ${fmtKr(b.price_high).padStart(14)}`)
  })

  lines.push('─'.repeat(70))
  const grandLow = totalLow + riggLow + stalVal
  const grandHigh = totalHigh + riggHigh + stalVal
  lines.push(`${'Sum eks. rigg og drift'.padEnd(35)} ${fmtKr(totalLow + stalVal).padStart(14)} ${fmtKr(totalHigh + stalVal).padStart(14)}`)
  lines.push(`${('Rigg og drift (' + riggPct + '%)').padEnd(35)} ${fmtKr(riggLow).padStart(14)} ${fmtKr(riggHigh).padStart(14)}`)
  lines.push('─'.repeat(70))
  lines.push(`${'SUM EKS. MVA'.padEnd(35)} ${fmtKr(grandLow).padStart(14)} ${fmtKr(grandHigh).padStart(14)}`)
  lines.push(`${'MVA 25%'.padEnd(35)} ${fmtKr(grandLow*0.25).padStart(14)} ${fmtKr(grandHigh*0.25).padStart(14)}`)
  lines.push(`${'SUM INK. MVA'.padEnd(35)} ${fmtKr(grandLow*1.25).padStart(14)} ${fmtKr(grandHigh*1.25).padStart(14)}`)

  if (result.exclusions?.length) {
    lines.push('', 'UTELATT FRA ESTIMATET:')
    result.exclusions.forEach(e => lines.push(`  · ${e}`))
  }
  if (result.warnings?.length) {
    lines.push('', 'FORBEHOLD:')
    result.warnings.forEach(w => lines.push(`  · ${w}`))
  }

  const blob = new Blob([lines.filter(l => l !== undefined).join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `estimat-${(projectName||'prosjekt').replace(/\s+/g,'-').toLowerCase()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
