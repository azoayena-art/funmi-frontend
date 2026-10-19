// src/services/bankImportService.ts
// 🏦 Parsing de relevés bancaires CSV multi-banques (fonctions pures = testables)
// Détection auto : séparateur, en-têtes, colonnes date/libellé/montant, format montants FR
// 🌍 Support multi-pays : France, Afrique (XOF/XAF), Maghreb, Europe, US, Suisse

import Papa from 'papaparse';

// ============================================================
// 📐 TYPES
// ============================================================
export interface BankTransactionRow {
  date: string;            // ISO YYYY-MM-DD
  valueDate?: string;      // ISO (date de valeur)
  label: string;           // libellé banque
  amount: number;          // signé (+ encaissement / − décaissement)
  currency: string;        // devise (EUR, XOF, USD...)
  reference?: string;      // référence opération
  rowHash: string;         // SHA-256(date|label|amount) → anti-doublon
  raw: Record<string, string>; // ligne brute (pour debug)
}

export interface BankParseError {
  line: number;
  message: string;
}

export interface BankParseResult {
  rows: BankTransactionRow[];
  skipped: number;
  errors: BankParseError[];
  delimiter: string;
  hasHeader: boolean;
  detectedBank?: string;
}

// ============================================================
// 🔤 NORMALISATION
// ============================================================
const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// ============================================================
// 💰 PARSING MONTANTS (formats FR + internationaux + Suisse)
// ============================================================
export const parseFrenchAmount = (raw: string): number | null => {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Signe : parenthèses, moins suffixe/préfixe
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);

  // Retirer devise et espaces (y compris insécables)
  s = s.replace(/€|EUR|euros?/gi, '');
  s = s.replace(/[\s\u00A0\u202F\u2009]/g, '');
  // 🇨🇭 Format suisse : apostrophe comme séparateur de milliers (1'234.56)
  s = s.replace(/[''']/g, '');
  if (!s) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  // ✅ Un séparateur de milliers exige des groupes de 3 chiffres
  const groupsOk = (parts: string[]) => parts.slice(1).every(p => /^\d{3}$/.test(p));

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // "1.234,56" (FR) : points = milliers, virgule = décimal
      if (!groupsOk(s.split(',')[0].split('.'))) return null;
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // "1,234.56" (US) : virgules = milliers, point = décimal
      if (!groupsOk(s.split('.')[0].split(','))) return null;
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2) {
      // "1,234,567" = milliers UNIQUEMENT si groupes de 3
      if (!groupsOk(parts)) return null;
      s = parts.join('');
    } else {
      s = s.replace(',', '.'); // "1234,56" = décimal
    }
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) {
      if (!groupsOk(parts)) return null;
      s = parts.join('');
    } else if (parts[1].length === 3) {
      s = parts.join(''); // "1.234" = milliers
    }
    // sinon décimal tel quel ("1234.56")
  }

  if (!/^\d*\.?\d*$/.test(s)) return null;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return negative ? -n : n;
};

// ============================================================
// 📅 PARSING DATES (FR + ISO + 🌍 multi-pays DMY/MDY)
// ============================================================
export type DateOrder = 'DMY' | 'MDY' | 'auto';

export const parseFrenchDate = (raw: string, order: DateOrder = 'auto'): string | null => {
  if (!raw) return null;
  const s = String(raw).trim();

  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (m[3].length === 2) year += year < 80 ? 2000 : 1900;

    // 🌍 Ordre résolu : explicite > non ambigu > DMY par défaut (FR/EU/Afrique)
    const resolved: 'DMY' | 'MDY' =
      order === 'DMY' || order === 'MDY' ? order
      : a > 12 && b <= 12 ? 'DMY'      // 25/04 → jour=25
      : b > 12 && a <= 12 ? 'MDY'      // 04/25 → mois=25 impossible → MDY (US)
      : 'DMY';                          // ambigu → convention FR/Afrique

    const day = resolved === 'DMY' ? a : b;
    const month = resolved === 'DMY' ? b : a;

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
    return dt.toISOString().slice(0, 10);
  }

  // AAAA-MM-JJ (ISO)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const dt = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  return null;
};

// ============================================================
// 🔍 DÉTECTION SÉPARATEUR
// ============================================================
export const detectDelimiter = (text: string): string => {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const candidates = [';', ',', '\t', '|'];
  let best = ';';
  let bestCount = 0;
  for (const c of candidates) {
    const count = sample.split(c).length - 1;
    if (count > bestCount) { bestCount = count; best = c; }
  }
  return best;
};

// ============================================================
// 🏦 DÉTECTION BANQUE (🌍 FR + Afrique + Maghreb + International)
// ============================================================
// ✅ APRÈS : les underscores deviennent des espaces → \b fonctionne partout
export const detectBank = (fileName?: string): string | undefined => {
  if (!fileName) return undefined;
  const f = normalize(fileName).replace(/_/g, ' ');

  const map: Array<[RegExp, string]> = [
    // 🇫🇷 France
    [/credit agricole|agricole/, 'Crédit Agricole'],
    [/bnp/, 'BNP Paribas'],
    [/societe generale/, 'Société Générale'],
    [/banque populaire|caisse d.?epargne|bpce/, 'BPCE'],
    [/banque postale/, 'La Banque Postale'],
    [/credit mutuel|mutuel/, 'Crédit Mutuel'],
    [/boursorama/, 'Boursorama'],
    [/fortuneo/, 'Fortuneo'],
    [/qonto/, 'Qonto'],
    [/shine/, 'Shine'],
    [/hellobank/, 'HelloBank'],
    [/\blcl\b/, 'LCL'],
    [/\bcic\b/, 'CIC'],
    // 🌍 Afrique de l'Ouest / CEMAC (banques + mobile money)
    [/sgbs/, 'SGBS'],
    [/bicis/, 'BICIS'],
    [/cbao/, 'CBAO'],
    [/ecobank/, 'Ecobank'],
    [/\buba\b/, 'UBA'],
    [/bank of africa|\bboa\b/, 'BOA'],
    [/nsia/, 'NSIA'],
    [/coris/, 'Coris Bank'],
    [/orabank/, 'Orabank'],
    [/sgbc|bicec|afriland/, 'SGBC'],
    [/orange money/, 'Orange Money'],
    [/\bwave\b/, 'Wave'],
    [/mtn momo|\bmomo\b/, 'MTN MoMo'],
    [/m-?pesa/, 'M-Pesa'],
    // 🌍 Maghreb
    [/attijari/, 'Attijariwafa'],
    [/bmce/, 'BMCE'],
    [/\bbna\b/, 'BNA'],
    // 🌍 International
    [/n26/, 'N26'],
    [/revolut/, 'Revolut'],
    [/hsbc/, 'HSBC'],
    [/barclays/, 'Barclays'],
    [/chase/, 'Chase'],
    [/deutsche bank/, 'Deutsche Bank'],
    [/commerzbank/, 'Commerzbank'],
    [/\bing\b/, 'ING'],
    [/santander/, 'Santander'],
  ];
  for (const [re, name] of map) if (re.test(f)) return name;
  return undefined;
};

// 🌍 Profil par banque : pays + devise par défaut
export const BANK_PROFILES: Record<string, { country: string; currency: string }> = {
  'Crédit Agricole': { country: 'FR', currency: 'EUR' },
  'BNP Paribas': { country: 'FR', currency: 'EUR' },
  'Société Générale': { country: 'FR', currency: 'EUR' },
  'BPCE': { country: 'FR', currency: 'EUR' },
  'La Banque Postale': { country: 'FR', currency: 'EUR' },
  'Crédit Mutuel': { country: 'FR', currency: 'EUR' },
  'Boursorama': { country: 'FR', currency: 'EUR' },
  'Fortuneo': { country: 'FR', currency: 'EUR' },
  'Qonto': { country: 'FR', currency: 'EUR' },
  'Shine': { country: 'FR', currency: 'EUR' },
  'HelloBank': { country: 'FR', currency: 'EUR' },
  'LCL': { country: 'FR', currency: 'EUR' },
  'CIC': { country: 'FR', currency: 'EUR' },
  'SGBS': { country: 'SN', currency: 'XOF' },
  'BICIS': { country: 'SN', currency: 'XOF' },
  'CBAO': { country: 'SN', currency: 'XOF' },
  'Ecobank': { country: 'TG', currency: 'XOF' },
  'UBA': { country: 'SN', currency: 'XOF' },
  'BOA': { country: 'ML', currency: 'XOF' },
  'NSIA': { country: 'CI', currency: 'XOF' },
  'Coris Bank': { country: 'BF', currency: 'XOF' },
  'Orabank': { country: 'TG', currency: 'XOF' },
  'SGBC': { country: 'CM', currency: 'XAF' },
  'Orange Money': { country: 'SN', currency: 'XOF' },
  'Wave': { country: 'SN', currency: 'XOF' },
  'MTN MoMo': { country: 'CI', currency: 'XOF' },
  'M-Pesa': { country: 'KE', currency: 'KES' },
  'Attijariwafa': { country: 'MA', currency: 'MAD' },
  'BMCE': { country: 'MA', currency: 'MAD' },
  'BNA': { country: 'TN', currency: 'TND' },
  'N26': { country: 'DE', currency: 'EUR' },
  'Revolut': { country: 'GB', currency: 'EUR' },
  'HSBC': { country: 'GB', currency: 'GBP' },
  'Barclays': { country: 'GB', currency: 'GBP' },
  'Chase': { country: 'US', currency: 'USD' },
  'Deutsche Bank': { country: 'DE', currency: 'EUR' },
  'Commerzbank': { country: 'DE', currency: 'EUR' },
  'ING': { country: 'NL', currency: 'EUR' },
  'Santander': { country: 'ES', currency: 'EUR' },
};

export const getBankProfile = (bankName?: string): { country: string; currency: string } | undefined =>
  bankName ? BANK_PROFILES[bankName] : undefined;

// ============================================================
// 🔐 HASH ANTI-DOUBLON
// ============================================================
export const computeRowHash = async (date: string, label: string, amount: number): Promise<string> => {
  const payload = `${date}|${normalize(label)}|${amount.toFixed(2)}`;
  const data = new TextEncoder().encode(payload);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf).slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

// ============================================================
// 📖 LECTURE FICHIER (UTF-8 avec fallback Windows-1252)
// ============================================================
export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf); // exports banques FR souvent en latin-1
  }
}

// ============================================================
// 🧠 PARSER PRINCIPAL (🌍 avec devise auto + ordre de dates)
// ============================================================
export async function parseBankStatement(
  csvText: string,
  options: { fileName?: string; currency?: string; dateOrder?: DateOrder } = {}
): Promise<BankParseResult> {
  const detectedBank = detectBank(options.fileName);
  const profile = getBankProfile(detectedBank);
  const currency = options.currency || profile?.currency || 'EUR'; // 🌍 devise auto
  const dateOrder = options.dateOrder || 'auto';
  const pDate = (v: string) => parseFrenchDate(v, dateOrder);      // helper local
  const delimiter = detectDelimiter(csvText);

  const parsed = Papa.parse<string[]>(csvText.trim(), { delimiter, skipEmptyLines: 'greedy' });
  const matrix = (parsed.data as unknown as string[][]).map(r => r.map(c => (c ?? '').trim()));

  if (matrix.length === 0) {
    return { rows: [], skipped: 0, errors: [{ line: 1, message: 'Fichier vide' }], delimiter, hasHeader: false, detectedBank };
  }

  // --- Détection en-tête ---
  const first = matrix[0];
  const normFirst = first.map(normalize);
  const headerKeywords = ['date', 'libelle', 'montant', 'debit', 'credit', 'valeur', 'reference', 'intitule', 'operation'];
  const hasHeader =
    normFirst.some(h => headerKeywords.some(k => h.includes(k))) &&
    normFirst.every(h => parseFrenchAmount(h) === null && pDate(h) === null);

  const header = hasHeader ? normFirst : [];
  const body = hasHeader ? matrix.slice(1) : matrix;

  // --- Index des colonnes ---
  let iDate = -1, iValue = -1, iLabel = -1, iAmount = -1, iDebit = -1, iCredit = -1, iRef = -1;

  if (hasHeader) {
    iDate = header.findIndex(h => h.includes('date') && !h.includes('valeur'));
    iValue = header.findIndex(h => h.includes('valeur'));
    iDebit = header.findIndex(h => h.includes('debit'));
    iCredit = header.findIndex(h => h.includes('credit'));
    iAmount = header.findIndex(h => h.includes('montant'));
    iLabel = header.findIndex(h => /libelle|intitule|description|detail/.test(h));
    if (iLabel === -1) iLabel = header.findIndex(h => h.includes('operation') && !h.includes('date'));
    iRef = header.findIndex(h => /reference|numero/.test(h));
  } else {
    // Détection statistique sur les 10 premières lignes
    const width = first.length;
    const sample = body.slice(0, 10);
    const n = Math.max(1, sample.length);
    const dateScore: number[] = [], amountScore: number[] = [], avgLen: number[] = [];

    for (let c = 0; c < width; c++) {
      let d = 0, a = 0, len = 0;
      for (const row of sample) {
        const v = row[c] ?? '';
        if (pDate(v)) d++;
        if (v && parseFrenchAmount(v) !== null && !pDate(v)) a++;
        len += v.length;
      }
      dateScore[c] = d; amountScore[c] = a; avgLen[c] = len / n;
    }

    iDate = dateScore.findIndex(s => s >= n * 0.8);
    let bestA = -1;
    for (let c = 0; c < width; c++) {
      if (c === iDate) continue;
      if (amountScore[c] > bestA) { bestA = amountScore[c]; iAmount = c; }
    }
    if (bestA < n * 0.8) iAmount = -1;
    let bestL = 0;
    for (let c = 0; c < width; c++) {
      if (c === iDate || c === iAmount) continue;
      if (avgLen[c] > bestL) { bestL = avgLen[c]; iLabel = c; }
    }
    if (bestL < 3) iLabel = -1;
  }

  // --- Erreurs de structure ---
  const errors: BankParseError[] = [];
  if (iDate === -1) errors.push({ line: 1, message: 'Colonne date introuvable' });
  if (iAmount === -1 && iDebit === -1) errors.push({ line: 1, message: 'Colonne montant (ou débit/crédit) introuvable' });
  if (iLabel === -1) errors.push({ line: 1, message: 'Colonne libellé introuvable' });
  if (errors.length > 0) {
    return { rows: [], skipped: body.length, errors, delimiter, hasHeader, detectedBank };
  }

  // --- Parsing des lignes ---
  const rows: BankTransactionRow[] = [];
  let skipped = 0;

  for (let idx = 0; idx < body.length; idx++) {
    const row = body[idx];
    const line = idx + (hasHeader ? 2 : 1);

    const date = pDate(row[iDate] ?? '');
    const label = iLabel >= 0 ? (row[iLabel] ?? '') : '';

    let amount: number | null;
    if (iDebit !== -1 || iCredit !== -1) {
      const debit = iDebit !== -1 ? (parseFrenchAmount(row[iDebit] ?? '') ?? 0) : 0;
      const credit = iCredit !== -1 ? (parseFrenchAmount(row[iCredit] ?? '') ?? 0) : 0;
      amount = debit === 0 && credit === 0 ? null : credit - debit;
    } else {
      amount = parseFrenchAmount(row[iAmount] ?? '');
    }

    if (!date || amount === null || !label) { skipped++; continue; }
    if (/^solde/i.test(label) && amount === 0) { skipped++; continue; }

    const raw: Record<string, string> = {};
    row.forEach((cell, c) => { raw[`col${c}`] = cell; });

    rows.push({
      date,
      valueDate: iValue !== -1 ? pDate(row[iValue] ?? '') || undefined : undefined,
      label,
      amount,
      currency,
      reference: iRef !== -1 ? (row[iRef] ?? '') || undefined : undefined,
      rowHash: await computeRowHash(date, label, amount),
      raw,
    });

    void line; // réservé pour messages d'erreur futurs
  }

  return { rows, skipped, errors: [], delimiter, hasHeader, detectedBank };
}