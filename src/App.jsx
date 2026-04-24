import { useState, useCallback, useEffect, useRef } from 'react'
import { FERRO_LOGO_B64 } from './ferroLogo'
import { analyzeProject } from './analyzeProject'
import {
  fmt, fmtKr, saveProject, loadProject, clearProject,
  saveApiKey, loadApiKey, confidenceColor, exportSummary,
  saveSigner, loadSigner, saveFeedback, loadFeedback
} from './utils'
import { t, getLang, setLang } from './translations'

// Detect file type by name — helpful default when user uploads many files
function detectFileType(name) {
  const n = name.toLowerCase()
  if (n.includes('tilbud') || n.includes('pristilbud') || n.includes('tilbudsbrev')) {
    return 'supplier_tilbud'
  }
  if (n.match(/\b(ark|a20|a30|a40|a41|plan|snitt|fasad|tegning|drawing)\b/)) {
    return 'drawing'
  }
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) {
    return 'kalk'
  }
  return 'other'
}

const FILE_TYPE_LABELS = {
  nb: {
    drawing: 'Tegning',
    supplier_tilbud: 'Leverandør-tilbud',
    our_tilbud: 'Vårt tilbud',
    kalk: 'Kalkulasjon',
    reference: 'Referanse',
    other: 'Annet',
  },
  uk: {
    drawing: 'Креслення',
    supplier_tilbud: 'Тендер постачальника',
    our_tilbud: 'Наш тендер',
    kalk: 'Калькуляція',
    reference: 'Референс',
    other: 'Інше',
  },
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const Card = ({ children, style }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 1px 4px rgba(27,48,80,0.06)', ...style }}>
    {children}
  </div>
)
const Tag = ({ color, children }) => (
  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: color + '18', color, border: `1px solid ${color}33` }}>{children}</span>
)
const Spinner = ({ size = 28 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.7s linear infinite' }} />
)

// ─── Block row ────────────────────────────────────────────────────────────────
function BlockRow({ block, onChange }) {
  const color = confidenceColor(block.confidence)
  const [open, setOpen] = useState(false)

  // When user changes paslag — recalc prices from base
  const handlePaslagChange = (newPct) => {
    const pct = parseFloat(newPct) || 0
    const base_low = block.base_low ?? block.price_low
    const base_high = block.base_high ?? block.price_high
    onChange({
      ...block,
      paslag_pct: pct,
      price_low: Math.round(base_low * (1 + pct / 100) / 1000) * 1000,
      price_high: Math.round(base_high * (1 + pct / 100) / 1000) * 1000,
    })
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border-light)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 80px 80px 32px', gap: 8, alignItems: 'center', padding: '12px 20px' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{block.name}</div>
          {block.basis && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.3 }}>{block.basis}</div>}
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>{t('lblFrom')}</div>
          <input type="number" value={block.price_low || ''} onChange={e => onChange({ ...block, price_low: parseInt(e.target.value) || 0 })}
            style={{ width: '100%', padding: '7px 10px', fontSize: 13, fontFamily: "'DM Mono',monospace", background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', textAlign: 'right' }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>{t('lblTo')}</div>
          <input type="number" value={block.price_high || ''} onChange={e => onChange({ ...block, price_high: parseInt(e.target.value) || 0 })}
            style={{ width: '100%', padding: '7px 10px', fontSize: 13, fontFamily: "'DM Mono',monospace", background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', textAlign: 'right' }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>{t('lblPaslag')}</div>
          <input type="number" value={block.paslag_pct ?? ''} onChange={e => handlePaslagChange(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', fontSize: 13, fontFamily: "'DM Mono',monospace", background: 'var(--accent-glow)', border: '1px solid var(--accent)55', borderRadius: 8, color: 'var(--accent)', textAlign: 'right', fontWeight: 600 }} />
        </div>
        <Tag color={color}>{block.confidence || '?'}</Tag>
        <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-dim)', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none' }}>›</button>
      </div>
      {open && (
        <div style={{ padding: '0 20px 14px', animation: 'fadeUp 0.2s ease' }}>
          {block.assumptions?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('antagelser')}</div>
              {block.assumptions.map((a, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)', padding: '2px 0' }}>· {a}</div>)}
            </div>
          )}
          {block.missing_info?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('missingInfo')}</div>
              {block.missing_info.map((m, i) => <div key={i} style={{ fontSize: 12, color: 'var(--warning)', padding: '2px 0' }}>· {m}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Feedback modal ───────────────────────────────────────────────────────────
function FeedbackModal({ onClose, currentProject, currentGrandLow, currentGrandHigh }) {
  const [entries, setEntries] = useState(loadFeedback)
  const [form, setForm] = useState({
    name: currentProject || '',
    ai_low: currentGrandLow ? Math.round(currentGrandLow) : '',
    ai_high: currentGrandHigh ? Math.round(currentGrandHigh) : '',
    faktisk_tilbud: '',
    solgt_for: '',
    kommentar: '',
  })
  const [saved, setSaved] = useState(false)

  const upd = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const handleSave = () => {
    if (!form.faktisk_tilbud) return
    const entry = {
      name: form.name,
      dato: new Date().toISOString().split('T')[0],
      ai_low: parseInt(form.ai_low) || null,
      ai_high: parseInt(form.ai_high) || null,
      faktisk_tilbud: parseInt(form.faktisk_tilbud),
      solgt_for: form.solgt_for ? parseInt(form.solgt_for) : null,
      kommentar: form.kommentar || null,
    }
    const updated = [...entries, entry]
    saveFeedback(updated)
    setEntries(updated)
    setSaved(true)
    setForm({ name: '', ai_low: '', ai_high: '', faktisk_tilbud: '', solgt_for: '', kommentar: '' })
    setTimeout(() => setSaved(false), 2500)
  }

  const handleDelete = (idx) => {
    const updated = entries.filter((_, i) => i !== idx)
    saveFeedback(updated)
    setEntries(updated)
  }

  const inputStyle = { width: '100%', padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box' }
  const monoStyle = { ...inputStyle, fontFamily: "'DM Mono',monospace", textAlign: 'right' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16, overflowY: 'auto' }}>
      <Card style={{ width: '100%', maxWidth: 540, padding: '28px', animation: 'fadeUp 0.3s ease', margin: 'auto' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Faktisk pris — feedback</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20 }}>Registrer hva prosjektet faktisk ble tilbudt. AI bruker dette til å kalibrere fremtidige estimater.</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Prosjektnavn</label>
          <input value={form.name} onChange={e => upd('name', e.target.value)} placeholder="Lagerbygg Steinsholt..." style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'AI estimat Fra (kr)', key: 'ai_low', ph: '2 200 000' },
            { label: 'AI estimat Til (kr)', key: 'ai_high', ph: '2 700 000' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>{f.label}</label>
              <input type="number" value={form[f.key]} onChange={e => upd(f.key, e.target.value)} placeholder={f.ph} style={monoStyle} />
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Faktisk tilbud sendt (kr) *</label>
            <input type="number" value={form.faktisk_tilbud} onChange={e => upd('faktisk_tilbud', e.target.value)} placeholder="2 950 000" style={monoStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Solgt for (kr)</label>
            <input type="number" value={form.solgt_for} onChange={e => upd('solgt_for', e.target.value)} placeholder="Hvis annet" style={monoStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Kommentar (valgfritt)</label>
          <input value={form.kommentar} onChange={e => upd('kommentar', e.target.value)} placeholder="f.eks. ukjent grunnforhold krevde ekstra" style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: entries.length ? 24 : 0 }}>
          <button onClick={handleSave} disabled={!form.faktisk_tilbud} style={{
            flex: 1, padding: '12px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none',
            cursor: !form.faktisk_tilbud ? 'not-allowed' : 'pointer',
            background: saved ? 'var(--success)' : 'var(--accent)', color: '#fff',
            fontFamily: "'Inter',sans-serif", opacity: !form.faktisk_tilbud ? 0.5 : 1, transition: 'background 0.3s',
          }}>{saved ? '✓ Lagret' : 'Registrer'}</button>
          <button onClick={onClose} style={{ padding: '12px 18px', fontSize: 14, fontWeight: 600, borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>Lukk</button>
        </div>

        {entries.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Registrerte ({entries.length})
            </div>
            {entries.map((e, i) => {
              const aiMid = e.ai_low && e.ai_high ? Math.round((e.ai_low + e.ai_high) / 2) : null
              const pct = aiMid && e.faktisk_tilbud ? Math.round(((e.faktisk_tilbud - aiMid) / aiMid) * 100) : null
              const pctColor = pct > 0 ? 'var(--success)' : pct < 0 ? 'var(--danger)' : 'var(--text-dim)'
              return (
                <div key={i} style={{ padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, marginBottom: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{e.name || '(uten navn)'} <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>{e.dato}</span></div>
                    <div style={{ color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace" }}>
                      {e.ai_low && e.ai_high && <span>{e.ai_low.toLocaleString('nb-NO')}–{e.ai_high.toLocaleString('nb-NO')} → </span>}
                      <span style={{ color: 'var(--text)' }}>{e.faktisk_tilbud?.toLocaleString('nb-NO')} kr</span>
                      {pct !== null && <span style={{ color: pctColor, marginLeft: 8, fontWeight: 700 }}>{pct > 0 ? '+' : ''}{pct}%</span>}
                    </div>
                    {e.kommentar && <div style={{ color: 'var(--text-dim)', marginTop: 2, fontStyle: 'italic' }}>{e.kommentar}</div>}
                  </div>
                  <button onClick={() => handleDelete(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</button>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Tilbudsbrev modal ────────────────────────────────────────────────────────
function TilbudModal({ onClose, onGenerate, generating, generatingStatus, aiForutsetninger }) {
  const [kunde, setKunde] = useState({ firma: '', kontakt: '', adresse: '' })
  const [signer, setSigner] = useState(loadSigner)

  // Forutsetninger: start with AI's values if available, else defaults
  const [forutsetninger, setForutsetninger] = useState(() => ({
    u_verdi_tak: aiForutsetninger?.u_verdi_tak ?? 0.18,
    u_verdi_vegg: aiForutsetninger?.u_verdi_vegg ?? 0.18,
    u_verdi_glass: aiForutsetninger?.u_verdi_glass ?? 1.2,
    tiltaksklasse: aiForutsetninger?.tiltaksklasse ?? '2',
    bruddgrense_kn_m2: aiForutsetninger?.bruddgrense_kn_m2 ?? 250,
    gyldighet_dager: aiForutsetninger?.gyldighet_dager ?? 14,
  }))

  const handleGenerate = () => {
    saveSigner(signer)
    onGenerate(kunde, signer, forutsetninger)
  }

  const updF = (key, val) => setForutsetninger(p => ({ ...p, [key]: val }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16, overflowY: 'auto' }}>
      <Card style={{ width: '100%', maxWidth: 500, padding: '28px 28px', animation: 'fadeUp 0.3s ease', margin: 'auto' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{t('modalTitle')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20 }}>{t('modalSubtitle')}</div>

        {/* ── Kunde section ── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, marginTop: 4 }}>{t('kunde')}</div>
        {[
          { label: t('firma'), key: 'firma', placeholder: t('firmaPlaceholder') },
          { label: t('kontakt'), key: 'kontakt', placeholder: t('kontaktPlaceholder') },
          { label: t('adresse'), key: 'adresse', placeholder: t('adressePlaceholder') },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>{f.label}</label>
            <input value={kunde[f.key]} onChange={e => setKunde(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              style={{ width: '100%', padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Inter',sans-serif" }} />
          </div>
        ))}

        {/* ── Signatur section ── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 18, marginBottom: 10 }}>{t('signatur')}</div>
        {[
          { label: t('navn'), key: 'name', placeholder: 'Marian Mychko' },
          { label: t('stilling'), key: 'title', placeholder: 'Kalkulatør' },
          { label: t('tlf'), key: 'tlf', placeholder: '91 92 36 26' },
          { label: t('email'), key: 'email', placeholder: 'marian@ferrostal.no' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>{f.label}</label>
            <input value={signer[f.key] || ''} onChange={e => setSigner(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              style={{ width: '100%', padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Inter',sans-serif" }} />
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, marginBottom: 8, fontStyle: 'italic' }}>{t('signerSaveHint')}</div>

        {/* ── Tekniske forutsetninger section ── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 18, marginBottom: 10 }}>{t('forutsetninger')}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { label: t('uVerdiTak'), key: 'u_verdi_tak', step: 0.01 },
            { label: t('uVerdiVegg'), key: 'u_verdi_vegg', step: 0.01 },
            { label: t('uVerdiGlass'), key: 'u_verdi_glass', step: 0.1 },
          ].map(fld => (
            <div key={fld.key}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{fld.label}</label>
              <input type="number" step={fld.step} value={forutsetninger[fld.key] ?? ''}
                onChange={e => updF(fld.key, e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="–"
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'DM Mono',monospace", textAlign: 'right' }} />
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 4 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{t('tiltaksklasse')}</label>
            <input type="text" value={forutsetninger.tiltaksklasse} onChange={e => updF('tiltaksklasse', e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'DM Mono',monospace", textAlign: 'right' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{t('bruddgrense')}</label>
            <input type="number" value={forutsetninger.bruddgrense_kn_m2} onChange={e => updF('bruddgrense_kn_m2', parseInt(e.target.value) || 0)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'DM Mono',monospace", textAlign: 'right' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{t('gyldighet')}</label>
            <input type="number" value={forutsetninger.gyldighet_dager} onChange={e => updF('gyldighet_dager', parseInt(e.target.value) || 14)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'DM Mono',monospace", textAlign: 'right' }} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, fontStyle: 'italic' }}>
          {t('uVerdiHint')}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={handleGenerate} disabled={generating} style={{
            flex: 1, padding: '13px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: generating ? 'wait' : 'pointer',
            background: generating ? 'var(--bg-input)' : 'var(--accent)', color: generating ? 'var(--text-dim)' : '#fff',
            fontFamily: "'Inter',sans-serif",
          }}>
            {generating ? (generatingStatus || t('generating')) : t('generateDocx')}
          </button>
          <button onClick={onClose} style={{ padding: '13px 18px', fontSize: 14, fontWeight: 600, borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>{t('cancel')}</button>
        </div>
      </Card>
    </div>
  )
}



// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [apiKey, setApiKey] = useState(loadApiKey)
  const [showKey, setShowKey] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [files, setFiles] = useState([])
  const [extraInfo, setExtraInfo] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [status, setStatus] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [stalPrice, setStalPrice] = useState('')
  const [riggPct, setRiggPct] = useState(8)
  const [showTilbudModal, setShowTilbudModal] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [generatingBrev, setGeneratingBrev] = useState(false)
  const [brevStatus, setBrevStatus] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    const saved = loadProject()
    if (saved) {
      setProjectName(saved.projectName || '')
      setResult(saved.result || null)
      setBlocks(saved.blocks || [])
      setStalPrice(saved.stalPrice || '')
      setRiggPct(saved.riggPct || 8)
      setExtraInfo(saved.extraInfo || '')
    }
  }, [])

  useEffect(() => {
    if (result) saveProject({ projectName, result, blocks, stalPrice, riggPct, extraInfo })
  }, [result, blocks, projectName, stalPrice, riggPct, extraInfo])

  const handleKeyChange = (k) => { setApiKey(k); saveApiKey(k) }

  const addFiles = useCallback((newFiles) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.file.name + f.file.size))
      return [...prev, ...Array.from(newFiles)
        .filter(f => !existing.has(f.name + f.size))
        .map(f => ({ file: f, fileType: detectFileType(f.name) }))
      ]
    })
  }, [])

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }

  const setFileType = (idx, fileType) => {
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, fileType } : f))
  }

  const handleAnalyze = async () => {
    if (!apiKey) { setShowKey(true); return }
    if (files.length === 0 && !extraInfo.trim()) { setError(t('errAddFiles')); return }
    setAnalyzing(true); setError(''); setResult(null); setBlocks([])
    try {
      const res = await analyzeProject(files, extraInfo, apiKey, setStatus)
      setResult(res)
      // Store base prices (before paslag) so user can adjust paslag and we recalc
      const enrichedBlocks = (res.blocks || [])
        .filter(b => b.included)
        .map(b => {
          const pct = b.paslag_pct ?? 15
          return {
            ...b,
            paslag_pct: pct,
            base_low: Math.round((b.price_low || 0) / (1 + pct / 100)),
            base_high: Math.round((b.price_high || 0) / (1 + pct / 100)),
          }
        })
      setBlocks(enrichedBlocks)
      setRiggPct(res.recommended_rigg_pct || 8)
    } catch (e) { setError(e.message) }
    finally { setAnalyzing(false); setStatus('') }
  }

  const handleBlockChange = (idx, upd) => setBlocks(prev => prev.map((b, i) => i === idx ? upd : b))
  const handleReset = () => {
    if (confirm(t('resetConfirm'))) {
      clearProject(); setFiles([]); setResult(null); setBlocks([])
      setProjectName(''); setExtraInfo(''); setStalPrice(''); setRiggPct(8); setError('')
    }
  }

  const handleGenerateBrev = async (kunde, signer, forutsetninger) => {
    setGeneratingBrev(true); setBrevStatus('Genererer .docx...')
    try {
      const { generateAndDownloadDocx } = await import('./generateDocx.js')
      await generateAndDownloadDocx({ projectName, result, blocks, stalPrice, riggPct, kunde, signer, forutsetninger })
      setShowTilbudModal(false)
    } catch (e) {
      setError(t('errDocx') + e.message)
    }
    finally { setGeneratingBrev(false); setBrevStatus('') }
  }

  const totalLow = blocks.reduce((s, b) => s + (b.price_low || 0), 0)
  const totalHigh = blocks.reduce((s, b) => s + (b.price_high || 0), 0)
  const stal = parseInt(stalPrice) || 0
  const riggLow = totalLow * (riggPct / 100)
  const riggHigh = totalHigh * (riggPct / 100)
  const grandLow = totalLow + riggLow + stal
  const grandHigh = totalHigh + riggHigh + stal
  const midTotal = Math.round((grandLow + grandHigh) / 2)
  const fileIcons = { 'application/pdf': '📄', 'image/jpeg': '🖼', 'image/png': '🖼', 'image/webp': '🖼' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Modals */}
      {showTilbudModal && (
        <TilbudModal
          onClose={() => setShowTilbudModal(false)}
          onGenerate={handleGenerateBrev}
          generating={generatingBrev}
          generatingStatus={brevStatus}
          aiForutsetninger={result?.forutsetninger}
        />
      )}
      {showFeedbackModal && (
        <FeedbackModal
          onClose={() => setShowFeedbackModal(false)}
          currentProject={projectName}
          currentGrandLow={result ? grandLow : null}
          currentGrandHigh={result ? grandHigh : null}
        />
      )}

      {/* Top nav bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '0 32px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 6px rgba(27,48,80,0.07)' }}>
        <img src={`data:image/png;base64,${FERRO_LOGO_B64}`} alt="Ferro Stålentreprenør AS" style={{ height: 44, objectFit: 'contain' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {result && <button onClick={handleReset} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: 'none', color: 'var(--text-dim)', border: '1px solid var(--border)', fontFamily: "'Inter',sans-serif" }}>{t('nullstill')}</button>}
          <button onClick={() => setShowFeedbackModal(true)} title="Registrer faktisk pris for AI-kalibrering" style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: 'none', color: 'var(--text-dim)', border: '1px solid var(--border)', fontFamily: "'Inter',sans-serif" }}>📊</button>
          <button onClick={() => { setLang(getLang() === 'nb' ? 'uk' : 'nb'); window.location.reload() }}
            style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: 'none', color: 'var(--text-dim)', border: '1px solid var(--border)', fontFamily: "'Inter',sans-serif" }}>
            {getLang() === 'nb' ? '🇺🇦 UA' : '🇳🇴 NO'}
          </button>
          <button onClick={() => setShowKey(!showKey)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: apiKey ? 'var(--success-dim)' : 'var(--warning-dim)', color: apiKey ? 'var(--success)' : 'var(--warning)', border: `1px solid ${apiKey ? 'var(--success)' : 'var(--warning)'}55`, fontFamily: "'Inter',sans-serif" }}>🔑 {apiKey ? t('apiKeyOk') : t('apiKeySet')}</button>
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 16px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.02em', marginBottom: 4 }}>{t('appTitle')}</h1>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{t('appSubtitle')}</div>
      </div>

      {/* API key */}
      {showKey && (
        <Card style={{ padding: '16px 20px', marginBottom: 20, animation: 'fadeUp 0.25s ease' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t('apiKeyTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>{t('apiKeyHint')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="password" placeholder="sk-ant-..." value={apiKey} onChange={e => handleKeyChange(e.target.value)}
              style={{ flex: 1, padding: '10px 14px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'DM Mono', monospace" }} />
            <button onClick={() => setShowKey(false)} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>{t('save')}</button>
          </div>
        </Card>
      )}

      {/* Project name */}
      <input type="text" placeholder={t("projectNamePlaceholder")} value={projectName} onChange={e => setProjectName(e.target.value)}
        style={{ width: '100%', padding: '12px 16px', fontSize: 16, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, background: 'var(--bg-card)', color: 'var(--text)', fontFamily: "'Inter',sans-serif" }} />

      {/* Upload */}
      {!analyzing && (
        <Card style={{ marginBottom: 16 }}>
          <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: '36px 24px', textAlign: 'center', cursor: 'pointer', borderRadius: 12, border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, background: dragOver ? 'var(--accent-glow)' : 'transparent', transition: 'all 0.2s', margin: 12 }}>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.txt,.csv" style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
            <div style={{ fontSize: 40, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{t('uploadTitle')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('uploadSubtitle')}</div>
          </div>
          {files.length > 0 && (
            <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {files.map((f, i) => {
                const typeLabels = FILE_TYPE_LABELS[getLang()] || FILE_TYPE_LABELS.nb
                const typeColor = {
                  supplier_tilbud: 'var(--success)',
                  drawing: 'var(--accent)',
                  kalk: 'var(--warning)',
                  our_tilbud: 'var(--accent)',
                  reference: 'var(--text-dim)',
                  other: 'var(--text-dim)',
                }[f.fileType] || 'var(--text-dim)'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 8, fontSize: 12, border: '1px solid var(--border)' }}>
                    <span>{fileIcons[f.file.type] || '📎'}</span>
                    <span style={{ flex: 1, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.file.name}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{(f.file.size/1024/1024).toFixed(1)}M</span>
                    <select value={f.fileType} onChange={e => setFileType(i, e.target.value)}
                      style={{ padding: '3px 6px', fontSize: 11, fontWeight: 600, border: `1px solid ${typeColor}55`, borderRadius: 6, background: typeColor + '15', color: typeColor, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
                      {Object.entries(typeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <button onClick={() => setFiles(p => p.filter((_,j) => j!==i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 16, padding: '0 4px' }}>×</button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Extra info */}
      {!analyzing && (
        <Card style={{ marginBottom: 20, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('extraInfoTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>{t('extraInfoHint')}</div>
          <textarea placeholder={t("extraInfoPlaceholder")}
            value={extraInfo} onChange={e => setExtraInfo(e.target.value)} rows={4}
            style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Inter',sans-serif", resize: 'vertical', lineHeight: 1.5 }} />
        </Card>
      )}

      {/* Analyze button */}
      {!analyzing && (
        <button onClick={handleAnalyze} style={{ width: '100%', padding: '16px', fontSize: 16, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: "'Inter',sans-serif", marginBottom: 24, letterSpacing: '-0.01em' }}>
          {t('analyzeBtn')}
        </button>
      )}

      {/* Spinner */}
      {analyzing && (
        <Card style={{ padding: '48px 24px', textAlign: 'center', marginBottom: 24, animation: 'fadeUp 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Spinner size={44} /></div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{status || t('analyzing')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{t('analyzingSub')}</div>
        </Card>
      )}

      {/* Error */}
      {error && <Card style={{ padding: '14px 18px', marginBottom: 20, borderColor: 'var(--danger)' }}><span style={{ color: 'var(--danger)', fontSize: 13 }}>⚠ {error}</span></Card>}

      {/* Results */}
      {result && !analyzing && (
        <div style={{ animation: 'fadeUp 0.4s ease' }}>
          {/* Summary */}
          <Card style={{ padding: '18px 20px', marginBottom: 16, borderColor: 'rgba(27,48,80,0.25)', borderLeftWidth: 4, borderLeftColor: 'var(--accent)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('aiAnalysis')}</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: result.building?.dimensions ? 10 : 0 }}>{result.project_summary}</div>
            {result.building?.dimensions && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {result.building.type && <span>{result.building.type} · </span>}
                {result.building.dimensions}
                {result.building.location && <span> · {result.building.location}</span>}
              </div>
            )}
          </Card>

          {/* Stål manual */}
          <Card style={{ padding: '16px 20px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('steelWork')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{t('steelWorkHint')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" placeholder="0" value={stalPrice} onChange={e => setStalPrice(e.target.value)}
                style={{ width: 140, padding: '8px 12px', fontSize: 14, fontFamily: "'DM Mono',monospace", background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', textAlign: 'right' }} />
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>kr</span>
            </div>
          </Card>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 80px 80px 32px', gap: 8, padding: '8px 20px', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>{t('colBlock')}</span><span style={{ textAlign: 'right' }}>{t('colFrom')}</span><span style={{ textAlign: 'right' }}>{t('colTo')}</span><span style={{ textAlign: 'right' }}>{t('colPaslag')}</span><span>{t('colConfidence')}</span><span />
          </div>

          {/* Blocks */}
          <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
            {blocks.map((b, i) => <BlockRow key={b.id || i} block={b} onChange={upd => handleBlockChange(i, upd)} />)}
          </Card>

          {/* Rigg */}
          <Card style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-dim)', flex: 1 }}>{t('rigg')}</span>
            <input type="number" min="0" max="30" step="0.5" value={riggPct} onChange={e => setRiggPct(parseFloat(e.target.value) || 0)}
              style={{ width: 80, padding: '8px 12px', fontSize: 14, textAlign: 'right', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: "'DM Mono',monospace" }} />
          </Card>

          {/* Grand total */}
          <Card style={{ padding: '20px 24px', marginBottom: 20, background: 'var(--accent)', borderColor: 'transparent' }}>
            <div style={{ marginBottom: 16 }}>
              {[
                stal > 0 && { label: t('steelWork'), lo: stal, hi: stal },
                { label: `${blocks.length} ${t('subtotalBlocks')}`, lo: totalLow, hi: totalHigh },
                { label: `${t('subtotalRigg')} (${riggPct}%)`, lo: riggLow, hi: riggHigh },
              ].filter(Boolean).map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>
                  <span>{r.label}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace" }}>{r.lo === r.hi ? fmtKr(r.lo) : `${fmt(Math.round(r.lo))} – ${fmtKr(Math.round(r.hi))}`}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 16 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{t('sumEksMva')}</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: '#fff', marginBottom: 2 }}>
                {fmt(Math.round(grandLow))} – {fmtKr(Math.round(grandHigh))}
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: "'DM Mono',monospace" }}>
                {t('sumInkMva')} {fmt(Math.round(grandLow*1.25))} – {fmtKr(Math.round(grandHigh*1.25))}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>
                {t('midpoint')} <strong style={{ color: '#fff', fontFamily: "'DM Mono',monospace" }}>{fmtKr(midTotal)}</strong>
              </div>
            </div>
          </Card>

          {/* Warnings */}
          {(result.warnings?.length > 0 || result.exclusions?.length > 0) && (
            <Card style={{ padding: '16px 20px', marginBottom: 20 }}>
              {result.exclusions?.length > 0 && (
                <div style={{ marginBottom: result.warnings?.length ? 12 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('utelatt')}</div>
                  {result.exclusions.map((e, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)', padding: '2px 0' }}>· {e}</div>)}
                </div>
              )}
              {result.warnings?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('forbehold')}</div>
                  {result.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: 'var(--warning)', padding: '2px 0' }}>· {w}</div>)}
                </div>
              )}
            </Card>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 40 }}>
            <button onClick={() => setShowTilbudModal(true)} style={{
              flex: 2, padding: '15px', fontSize: 15, fontWeight: 700, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', fontFamily: "'Inter',sans-serif",
            }}>
              {t('downloadDocx')}
            </button>
            <button onClick={() => exportSummary(result, projectName, stalPrice, riggPct)} style={{
              flex: 1, padding: '15px', fontSize: 14, fontWeight: 600, borderRadius: 12,
              border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-dim)',
              cursor: 'pointer', fontFamily: "'Inter',sans-serif",
            }}>
              {t('exportTxt')}
            </button>
            <button onClick={handleAnalyze} style={{
              padding: '15px 18px', fontSize: 14, fontWeight: 600, borderRadius: 12,
              border: '1px solid var(--accent)', background: 'none', color: 'var(--accent)',
              cursor: 'pointer', fontFamily: "'Inter',sans-serif",
            }}>&#x21BA;</button>
          </div>
        </div>
      )}

      </div>{/* end page content */}
    </div>
  )
}
