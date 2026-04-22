// generateDocx.js — runs entirely in the browser, no server needed
// Uses the 'docx' npm package which works in Vite/browser environments
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, BorderStyle, WidthType,
  ShadingType, VerticalAlign, LevelFormat
} from 'docx'
import { FERRO_LOGO_B64 } from './ferroLogo.js'

// ── Brand colors ──────────────────────────────────────────────────────────────
const DARK_BLUE  = '1A2F5A'
const MID_BLUE   = '2E4F8A'
const LIGHT_BLUE = '5B8FC9'
const GREY_LINE  = 'D0D8E4'

// ── Helpers ───────────────────────────────────────────────────────────────────
const gap = (pts = 6) => new Paragraph({ spacing: { before: 0, after: pts * 20 } })

const rule = () => new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BLUE, space: 4 } },
  spacing: { before: 0, after: 80 },
  children: [new TextRun('')]
})

const sectionHead = (text) => new Paragraph({
  spacing: { before: 280, after: 80 },
  children: [new TextRun({ text, bold: true, size: 22, color: DARK_BLUE, font: 'Arial' })]
})

const body = (text, opts = {}) => new Paragraph({
  spacing: { before: 0, after: 120 },
  children: [new TextRun({ text, size: 20, font: 'Arial', color: '1A1A1A', ...opts })]
})

const bullet = (text) => new Paragraph({
  numbering: { reference: 'bullets', level: 0 },
  spacing: { before: 0, after: 80 },
  children: [new TextRun({ text, size: 20, font: 'Arial', color: '1A1A1A' })]
})

// ── Price table ───────────────────────────────────────────────────────────────
function priceTable(sumExMva, mva, sumInkMva) {
  const fmtNO = (n) => Math.round(n).toLocaleString('nb-NO') + ',-'

  const makeRow = (label, value, bold, shaded) => new TableRow({
    children: [
      new TableCell({
        width: { size: 6200, type: WidthType.DXA },
        shading: shaded ? { fill: 'EBF1F8', type: ShadingType.CLEAR } : undefined,
        margins: { top: 80, bottom: 80, left: 140, right: 80 },
        borders: {
          top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.SINGLE, size: 2, color: GREY_LINE }
        },
        children: [new Paragraph({ children: [new TextRun({ text: label, size: bold ? 22 : 20, bold, font: 'Arial', color: bold ? DARK_BLUE : '333333' })] })]
      }),
      new TableCell({
        width: { size: 2800, type: WidthType.DXA },
        shading: shaded ? { fill: 'EBF1F8', type: ShadingType.CLEAR } : undefined,
        margins: { top: 80, bottom: 80, left: 80, right: 140 },
        borders: {
          top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.SINGLE, size: 2, color: GREY_LINE }
        },
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: value, size: bold ? 22 : 20, bold, font: 'Arial', color: bold ? DARK_BLUE : '333333' })] })]
      })
    ]
  })

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: [6200, 2800],
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      makeRow('Sum uten opsjoner eks. mva', fmtNO(sumExMva), false, false),
      makeRow('Mva (25 %)', fmtNO(mva), false, false),
      makeRow('Sum ink. mva', fmtNO(sumInkMva), true, true),
    ]
  })
}

// ── Header with logo ──────────────────────────────────────────────────────────
function buildHeader(logoBytes) {
  return new Header({
    children: [
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [new TableRow({
          children: [
            new TableCell({
              borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
              children: [new Paragraph({
                children: [new ImageRun({ data: logoBytes, transformation: { width: 100, height: 67 }, type: 'png' })]
              })]
            }),
            new TableCell({
              borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'Ferro Stålentreprenør AS', size: 16, font: 'Arial', color: DARK_BLUE, bold: true }),
                  new TextRun({ text: '\nRingsevja 3, 3830 Ulefoss', size: 14, font: 'Arial', color: '666666', break: 1 }),
                  new TextRun({ text: '\nferrostal.no  |  marian@ferrostal.no', size: 14, font: 'Arial', color: '666666', break: 1 }),
                ]
              })]
            })
          ]
        })]
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: LIGHT_BLUE, space: 4 } },
        spacing: { before: 80, after: 0 },
        children: [new TextRun('')]
      })
    ]
  })
}

function buildFooter() {
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BLUE, space: 4 } },
        spacing: { before: 80, after: 0 },
        children: [new TextRun('')]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60 },
        children: [new TextRun({
          text: 'Ferro Stålentreprenør AS  ·  Ringsevja 3, 3830 Ulefoss  ·  Org.nr: 926 542 680  ·  ferrostal.no',
          size: 14, font: 'Arial', color: '888888'
        })]
      })
    ]
  })
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateAndDownloadDocx(data) {
  const DEFAULT_SIGNER = { name: 'Marian Mychko', title: 'Kalkulatør', tlf: '91 92 36 26', email: 'marian@ferrostal.no' }
  const DEFAULT_FORUTSETNINGER = {
    u_verdi_tak: 0.18,
    u_verdi_vegg: 0.18,
    u_verdi_glass: 1.2,
    tiltaksklasse: '2',
    bruddgrense_kn_m2: 250,
    gyldighet_dager: 14,
  }
  const {
    projectName, result, blocks, stalPrice, riggPct, kunde,
  } = data
  const signer = { ...DEFAULT_SIGNER, ...(data.signer || {}) }
  const f = { ...DEFAULT_FORUTSETNINGER, ...(data.forutsetninger || {}) }

  // Helper for U-verdi text
  const uVerdiText = () => {
    const parts = []
    if (f.u_verdi_tak != null) parts.push(`tak ${String(f.u_verdi_tak).replace('.', ',')}`)
    if (f.u_verdi_vegg != null) parts.push(`vegg ${String(f.u_verdi_vegg).replace('.', ',')}`)
    if (f.u_verdi_glass != null) parts.push(`glass ${String(f.u_verdi_glass).replace('.', ',')}`)
    return parts.length > 0
      ? `U-verdi: ${parts.join(', ')}.`
      : 'Uisolert bygg — ingen U-verdi krav.'
  }

  // Decode logo from base64
  const logoBytes = Uint8Array.from(atob(FERRO_LOGO_B64), c => c.charCodeAt(0))

  // Filter out stål blocks AI may have added (user enters stål manually)
  const filteredBlocks = (blocks || []).filter(b =>
    !['stal', 'stål', 'stalkonstruksjon'].includes((b.id || '').toLowerCase()) &&
    !b.name?.toLowerCase().includes('stålkonstruks')
  )

  // Calculate totals
  const stal = parseInt(stalPrice) || 0
  const totalBlocks = filteredBlocks.reduce((s, b) => s + Math.round((b.price_low + b.price_high) / 2), 0)
  const rigg = totalBlocks * ((riggPct || 8) / 100)
  const sumExMvaRaw = totalBlocks + stal + rigg
  const sumExMva = Math.round(sumExMvaRaw / 1000) * 1000
  const mva = Math.round(sumExMva * 0.25)
  const sumInkMva = sumExMva + mva

  const today = new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
  const fmtNO = (n) => Math.round(n).toLocaleString('nb-NO') + ',-'

  // Build scope items
  const scopeItems = []

  if (stal > 0) {
    scopeItems.push(sectionHead('Stålkonstruksjon'))
    scopeItems.push(body('Det er medregnet stålkonstruksjon til prosjektet. Pris er innhentet fra leverandør.'))
    scopeItems.push(body(`Pris: ${stal.toLocaleString('nb-NO')},-`, { bold: true, color: DARK_BLUE }))
  }

  filteredBlocks.forEach(b => {
    const mid = Math.round((b.price_low + b.price_high) / 2)
    scopeItems.push(sectionHead(b.name))
    if (b.basis) scopeItems.push(body(b.basis))
    if (b.assumptions?.length) {
      b.assumptions.forEach(a => scopeItems.push(body(`· ${a}`, { color: '555555' })))
    }
    scopeItems.push(body(`Pris: ${mid.toLocaleString('nb-NO')},-`, { bold: true, color: DARK_BLUE }))
  })

  // Ikke medregnet
  const notIncluded = (result.exclusions || []).filter(e =>
    !e.toLowerCase().includes('stål') && !e.toLowerCase().includes('stal')
  )
  if (notIncluded.length > 0) {
    scopeItems.push(sectionHead('Ikke medregnet'))
    notIncluded.forEach(e => scopeItems.push(bullet(e)))
  }

  // Standard clauses
  scopeItems.push(sectionHead('Grunnarbeid'))
  scopeItems.push(body('Grunnarbeid er ikke medregnet, og graver må gjøre klart for isolering og støp. Forutsetter at graver legger strøm, vann og avløp inn til innsiden av bygget yttervegg. Frostisolering utvendig må ivaretas av grave firma.'))

  scopeItems.push(sectionHead('Branntetting'))
  scopeItems.push(body('Det er ikke medtatt brannisolering av bæresystem og det forutsettes R0 på stålet, men dette kan ikke fastsettes før det er utarbeidet en brannrapport.'))

  if (result.warnings?.length) {
    scopeItems.push(sectionHead('Forbehold'))
    result.warnings.forEach(w => scopeItems.push(bullet(w)))
  }

  // Build document
  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2013', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 560, hanging: 280 } }, run: { font: 'Arial', color: LIGHT_BLUE } } }]
      }]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1600, right: 1300, bottom: 1200, left: 1300 }
        }
      },
      headers: { default: buildHeader(logoBytes) },
      footers: { default: buildFooter() },
      children: [
        // Date
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 0, after: 200 },
          children: [new TextRun({ text: `Ulefoss, ${today}`, size: 20, font: 'Arial', color: '555555' })]
        }),

        // Customer
        ...(kunde?.firma ? [
          new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: kunde.firma, size: 20, bold: true, font: 'Arial' })] }),
          kunde.kontakt && new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: kunde.kontakt, size: 20, font: 'Arial' })] }),
          kunde.adresse && new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: kunde.adresse, size: 20, font: 'Arial' })] }),
        ].filter(Boolean) : []),

        // Title
        new Paragraph({
          spacing: { before: 0, after: 60 },
          children: [new TextRun({ text: 'BUDSJETTPRIS', size: 32, bold: true, font: 'Arial', color: DARK_BLUE })]
        }),
        new Paragraph({
          spacing: { before: 0, after: 320 },
          children: [new TextRun({ text: projectName || result.project_summary?.slice(0, 80) || 'Prosjekt', size: 24, font: 'Arial', color: MID_BLUE })]
        }),

        rule(),

        new Paragraph({
          spacing: { before: 200, after: 200 },
          children: [new TextRun({ text: 'Vi takker for deres forespørsel og har gleden av å tilby dere følgende:', size: 20, font: 'Arial', italics: true })]
        }),

        priceTable(sumExMva, mva, sumInkMva),
        gap(16),
        body('I vedleggene ligger vår beskrivelse av arbeidet. Vi ser frem til et godt samarbeid og håper budsjettet er konkurransedyktig.'),
        gap(20),

        // Signature — right after the closing sentence
        new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: 'Med vennlig hilsen', size: 20, font: 'Arial' })] }),
        new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: 'Ferro Stålentreprenør AS', size: 20, bold: true, font: 'Arial', color: DARK_BLUE })] }),
        gap(24),
        new Paragraph({
          spacing: { before: 0, after: 20 },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: GREY_LINE, space: 4 } },
          children: [new TextRun({ text: signer.name, size: 20, bold: true, font: 'Arial', color: DARK_BLUE })]
        }),
        new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: signer.title, size: 18, font: 'Arial', color: '666666' })] }),
        new Paragraph({ spacing: { before: 0, after: 300 }, children: [new TextRun({ text: `Tlf: ${signer.tlf}  |  ${signer.email}`, size: 18, font: 'Arial', color: '666666' })] }),

        rule(),

        // Scope follows after signature
        ...scopeItems,

        gap(16),
        rule(),

        // General conditions
        new Paragraph({ spacing: { before: 200, after: 120 }, children: [new TextRun({ text: 'GENERELLE FORUTSETNINGER', size: 20, bold: true, font: 'Arial', color: DARK_BLUE })] }),
        bullet('Ved tilleggsarbeid: 750,- pr. time for montør, 1 200,- pr. time for prosjektleder, 15 % materialpåslag.'),
        bullet('Mengder gjeldende, reguleres før kontrakt.'),
        bullet('Budsjettet skriftlig bestilles av kunde. Kontinuerlig montasje forutsettes.'),
        bullet('Tegning på stål gjelder for pris. Prisjustering iht. beregningsgrunnlag.'),
        bullet('Fundamentering dimensjonert for monteringslaster — Ferro ikke ansvar for setninger.'),
        bullet('Fremkommelig vei rundt bygget (min. 4 m bredde) for kran/transport.'),
        bullet(`Budsjettet gyldig ${f.gyldighet_dager} dager.`),
        bullet('Stålpris-forbehold: Budsjettet på stål er bygd på gårsdagens innkjøpspriser. Verkene har varslet prisoppgang og holder kun priser på dagsbasis. Vi forbeholder oss retten til gjennomgang ved kontrakt.'),
        bullet(`Tiltaksklasse ${f.tiltaksklasse}, seismikk utelates, direkte fundamentering ${f.bruddgrense_kn_m2} kN/m² bruddgrense.`),
        bullet(uVerdiText()),
        bullet('War-clause: Force majeure iht. NS 8417 pkt. 33 / NS 8415 pkt. 24.'),
        bullet('Ryddet ut etter eget arbeid, ikke vasket.'),
        bullet('Budsjettet er basert på foreliggende dokumentasjon. Endelig pris gjennomgås dersom grunnlaget endres vesentlig.'),
      ]
    }]
  })

  // Generate and download
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = (projectName || 'prosjekt').replace(/\s+/g, '_').replace(/[^\w_]/g, '')
  const date = new Date().toISOString().slice(0, 10)
  a.download = `Budsjett_${slug}_${date}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
