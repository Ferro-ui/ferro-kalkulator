// translations.js — UI translations for Ferro Kalkulator
// Document output (docx, txt) is always Norwegian — only UI changes

export const translations = {
  nb: {
    // Header
    appTitle: 'Prosjektestimat',
    appSubtitle: 'Last opp dokumenter → AI analyserer → Prisintervall + .docx budsjettpris',
    nullstill: 'Nullstill',
    apiKeyOk: 'API OK',
    apiKeySet: 'Sett nøkkel',
    lang: 'Språk',

    // API key section
    apiKeyTitle: 'Anthropic API-nøkkel',
    apiKeyHint: 'Hentes fra console.anthropic.com · Lagres kun i nettleseren',
    save: 'Lagre',

    // Project name
    projectNamePlaceholder: 'Prosjektnavn...',

    // Upload zone
    uploadTitle: 'Dra prosjektfiler hit',
    uploadSubtitle: 'Tilbud, tegninger, bilder, kalkulasjoner · PDF, JPG, PNG, XLSX',

    // Extra info
    extraInfoTitle: 'Tilleggsinformasjon',
    extraInfoHint: 'Hva som er med/ikke med, type bygg, lokasjon, spesielle krav...',
    extraInfoPlaceholder: 'Eks: Vi leverer stål, yttervegg og innervegger. Betong og graving er UE. Bygget er ca 30×15m lager i Telemark...',

    // Analyze button
    analyzeBtn: 'Analyser prosjekt med AI',

    // Spinner
    analyzing: 'Analyserer...',
    analyzingSub: 'Claude leser alle dokumentene',

    // Errors
    errAddFiles: 'Legg til filer eller skriv inn prosjektinfo',
    errDocx: 'docx feil: ',

    // Results
    aiAnalysis: 'AI-analyse',
    steelWork: 'Stålkonstruksjon',
    steelWorkHint: 'Leverandørpris (Ruukki, Storm, etc.) — fyll inn manuelt',
    kr: 'kr',

    // Table headers
    colBlock: 'Arbeidsblokk',
    colFrom: 'Fra',
    colTo: 'Til',
    colPaslag: 'Påslag %',
    colConfidence: 'Sikkerhet',
    rigg: 'Rigg og drift %',

    // Block row
    lblFrom: 'Fra',
    lblTo: 'Til',
    lblPaslag: 'Påslag %',
    antagelser: 'Antagelser',
    missingInfo: 'Mangler for bedre estimat',

    // Grand total
    subtotalBlocks: 'poster',
    subtotalRigg: 'Rigg og drift',
    sumEksMva: 'Sum eks. mva',
    sumInkMva: 'Ink. mva:',
    midpoint: 'Midtpunkt:',

    // Warnings
    utelatt: 'Utelatt',
    forbehold: '⚠ Forbehold',

    // Action buttons
    downloadDocx: 'Last ned budsjettpris (.docx)',
    exportTxt: 'Estimat .txt',

    // Modal — customer
    modalTitle: 'Last ned budsjettpris (.docx)',
    modalSubtitle: 'Fyll inn kundedata og bekreft signatur',
    kunde: 'Kunde',
    firma: 'Firma / kunde',
    firmaPlaceholder: 'AS Eksempel',
    kontakt: 'Kontaktperson',
    kontaktPlaceholder: 'Ola Nordmann',
    adresse: 'Adresse',
    adressePlaceholder: 'Eksempelveien 1, 3800 Bø',

    // Modal — signer
    signatur: 'Signatur',
    navn: 'Navn',
    stilling: 'Stilling',
    tlf: 'Telefon',
    email: 'E-post',
    signerSaveHint: 'Lagres lokalt for neste gang',

    // Modal — forutsetninger
    forutsetninger: 'Tekniske forutsetninger',
    uVerdiTak: 'U-verdi tak',
    uVerdiVegg: 'U-verdi vegg',
    uVerdiGlass: 'U-verdi glass',
    tiltaksklasse: 'Tiltaksklasse',
    bruddgrense: 'Bruddgrense kN/m²',
    gyldighet: 'Gyldighet (dager)',
    uVerdiHint: 'La U-verdi stå tom for uisolerte bygg',

    // Modal — buttons
    generateDocx: '📄 Last ned .docx',
    generating: 'Genererer...',
    cancel: 'Avbryt',

    // Reset confirm
    resetConfirm: 'Slette alt og starte på nytt?',
  },

  uk: {
    // Header
    appTitle: 'Кошторис проєкту',
    appSubtitle: 'Завантаж документи → AI аналізує → Інтервал цін + .docx кошторис',
    nullstill: 'Скинути',
    apiKeyOk: 'API OK',
    apiKeySet: 'Задати ключ',
    lang: 'Мова',

    // API key section
    apiKeyTitle: 'Ключ Anthropic API',
    apiKeyHint: 'Отримати з console.anthropic.com · Зберігається лише в браузері',
    save: 'Зберегти',

    // Project name
    projectNamePlaceholder: 'Назва проєкту...',

    // Upload zone
    uploadTitle: 'Перетягніть файли проєкту сюди',
    uploadSubtitle: 'Тендери, креслення, фото, калькуляції · PDF, JPG, PNG, XLSX',

    // Extra info
    extraInfoTitle: 'Додаткова інформація',
    extraInfoHint: 'Що входить/не входить, тип будівлі, локація, особливі вимоги...',
    extraInfoPlaceholder: 'Напр.: Ми робимо сталь, зовнішні та внутрішні стіни. Бетон і викопування — через УЕ. Будівля ~30×15м склад у Телемарку...',

    // Analyze button
    analyzeBtn: 'Аналізувати проєкт через AI',

    // Spinner
    analyzing: 'Аналізую...',
    analyzingSub: 'Claude читає всі документи',

    // Errors
    errAddFiles: 'Додайте файли або опишіть проєкт',
    errDocx: 'Помилка docx: ',

    // Results
    aiAnalysis: 'AI-аналіз',
    steelWork: 'Сталева конструкція',
    steelWorkHint: 'Ціна постачальника (Ruukki, Storm тощо) — введіть вручну',
    kr: 'кр',

    // Table headers
    colBlock: 'Блок робіт',
    colFrom: 'Від',
    colTo: 'До',
    colPaslag: 'Націнка %',
    colConfidence: 'Впевненість',
    rigg: 'Організація будівництва %',

    // Block row
    lblFrom: 'Від',
    lblTo: 'До',
    lblPaslag: 'Націнка %',
    antagelser: 'Припущення',
    missingInfo: 'Бракує для точнішої оцінки',

    // Grand total
    subtotalBlocks: 'позицій',
    subtotalRigg: 'Організація будівництва',
    sumEksMva: 'Сума без ПДВ',
    sumInkMva: 'З ПДВ:',
    midpoint: 'Середнє:',

    // Warnings
    utelatt: 'Не включено',
    forbehold: '⚠ Застереження',

    // Action buttons
    downloadDocx: 'Завантажити кошторис (.docx)',
    exportTxt: 'Кошторис .txt',

    // Modal — customer
    modalTitle: 'Завантажити кошторис (.docx)',
    modalSubtitle: 'Заповніть дані клієнта та підтвердіть підпис',
    kunde: 'Клієнт',
    firma: 'Компанія / клієнт',
    firmaPlaceholder: 'ТОВ Приклад',
    kontakt: 'Контактна особа',
    kontaktPlaceholder: 'Ола Нордманн',
    adresse: 'Адреса',
    adressePlaceholder: 'вул. Приклад 1, 3800 Бьо',

    // Modal — signer
    signatur: 'Підпис',
    navn: 'Ім\'я',
    stilling: 'Посада',
    tlf: 'Телефон',
    email: 'Ел. пошта',
    signerSaveHint: 'Зберігається локально для наступного разу',

    // Modal — forutsetninger
    forutsetninger: 'Технічні параметри',
    uVerdiTak: 'U-коеф. дах',
    uVerdiVegg: 'U-коеф. стіна',
    uVerdiGlass: 'U-коеф. скло',
    tiltaksklasse: 'Клас дії',
    bruddgrense: 'Гран. навант. кН/м²',
    gyldighet: 'Дійсне (днів)',
    uVerdiHint: 'Залиш U-коеф. порожнім для неутеплених будівель',

    // Modal — buttons
    generateDocx: '📄 Завантажити .docx',
    generating: 'Генерую...',
    cancel: 'Скасувати',

    // Reset confirm
    resetConfirm: 'Видалити все та почати спочатку?',
  },
}

const LANG_STORAGE = 'ferro_lang'

export function getLang() {
  try { return localStorage.getItem(LANG_STORAGE) || 'nb' } catch { return 'nb' }
}

export function setLang(lang) {
  try { localStorage.setItem(LANG_STORAGE, lang) } catch {}
}

// Get translation with fallback to Norwegian
export function t(key, lang) {
  const currentLang = lang || getLang()
  return translations[currentLang]?.[key] ?? translations.nb[key] ?? key
}
