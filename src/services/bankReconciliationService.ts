// src/services/bankReconciliationService.ts
// 🏦 Moteur de rapprochement bancaire (fonctions pures = testables)
// Propose pour chaque ligne de relevé la facture client (encaissement)
// ou fournisseur (décaissement) correspondante, avec score de confiance.
// 🌍 Support multi-devises : refuse le match entre devises différentes.

export type MatchType = 'client_invoice' | 'supplier_invoice';

// ============================================================
// 📐 TYPES
// ============================================================
export interface BankRow {
  date: string;          // ISO YYYY-MM-DD
  label: string;
  amount: number;        // signé (+ encaissement / − décaissement)
  reference?: string;
  currency?: string;     // 🌍 devise (EUR, XOF, USD...)
}

export interface MatchCandidate {
  type: MatchType;
  id: string;
  number: string;        // numéro de facture
  counterparty: string;  // nom client ou fournisseur
  amount: number;        // reste à payer (positif)
  issueDate?: string;
  dueDate?: string;
  currency?: string;     // 🌍 devise (EUR, XOF, USD...)
}

export interface MatchSuggestion {
  candidate: MatchCandidate;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface ReconciliationOptions {
  amountTolerance?: number;  // écart accepté pour "montant exact" (défaut 0,05)
  dateWindowDays?: number;   // fenêtre autour de l'échéance (défaut 60 j)
}

// ============================================================
// 🔤 NORMALISATION
// ============================================================
export const normalize = (s: string): string =>
  s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const STOPWORDS = new Set([
  'sarl', 'sas', 'sasu', 'eurl', 'sci', 'sa', 'spa', 'gmbh', 'ltd',
  'the', 'et', 'cie', 'company', 'inc', 'france',
]);

const tokens = (name: string): string[] =>
  normalize(name).split(' ').filter(t => t.length >= 3 && !STOPWORDS.has(t));

// ============================================================
// 📅 HELPERS DATES
// ============================================================
const DAY_MS = 86400000;
const daysBetween = (from: string, to: string): number => {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (isNaN(a) || isNaN(b)) return Infinity;
  return (b - a) / DAY_MS;
};

// ============================================================
// 🎯 MOTEUR DE SUGGESTIONS
// ============================================================
export const suggestMatches = (
  row: BankRow,
  candidates: MatchCandidate[],
  options: ReconciliationOptions = {}
): MatchSuggestion[] => {
  const tol = options.amountTolerance ?? 0.05;
  const windowDays = options.dateWindowDays ?? 60;
  const absAmount = Math.abs(row.amount);
  const isInflow = row.amount > 0;
  const normLabel = normalize(row.label);
  const normRef = normalize(row.reference || '');

  const suggestions: MatchSuggestion[] = [];

  for (const c of candidates) {
    // 🧭 Règle de direction : encaissement → client, décaissement → fournisseur
    if (isInflow && c.type !== 'client_invoice') continue;
    if (!isInflow && c.type !== 'supplier_invoice') continue;

    // 💱 Garde-fou devise : jamais de match entre devises différentes (pas de conversion implicite)
    if (row.currency && c.currency && row.currency !== c.currency) continue;

    const diff = Math.abs(absAmount - c.amount);
    const closeTol = Math.max(1, c.amount * 0.02);
    const exact = diff <= tol;
    const close = diff <= closeTol;

    const normNumber = normalize(c.number);
    const refMatch = normNumber.length > 3 && (normLabel.includes(normNumber) || normRef.includes(normNumber));

    // 🚪 Gate : candidat éligible seulement si montant cohérent OU référence présente
    if (!exact && !close && !refMatch) continue;

    let score = 0;
    const reasons: string[] = [];

    // 💰 Montant
    if (exact) { score += 60; reasons.push('Montant exact'); }
    else if (close) { score += 40; reasons.push(`Montant proche (écart ${diff.toFixed(2)})`); }
    else { score += 25; reasons.push('Paiement partiel / montant différent'); }

    // 🔢 Référence facture dans le libellé
    if (refMatch) { score += 30; reasons.push(`Référence ${c.number} dans le libellé`); }

    // 👤 Nom du tiers dans le libellé
    const nameTokens = tokens(c.counterparty);
    const nameMatch = nameTokens.length > 0 && nameTokens.every(t => normLabel.includes(t));
    const partialName = !nameMatch && nameTokens.some(t => t.length >= 5 && normLabel.includes(t));
    if (nameMatch) { score += 20; reasons.push(`Nom "${c.counterparty}" dans le libellé`); }
    else if (partialName) { score += 10; reasons.push('Nom partiel dans le libellé'); }

    // 📅 Fenêtre de dates
    if (row.date && c.issueDate) {
      const sinceIssue = daysBetween(c.issueDate, row.date);
      if (c.dueDate) {
        const sinceDue = daysBetween(c.dueDate, row.date);
        if (sinceIssue >= -15 && sinceDue <= 45) {
          score += 20; reasons.push('Dans la fenêtre émission → échéance+45j');
        } else if (Math.abs(sinceDue) <= windowDays) {
          score += 10; reasons.push("Proche de l'échéance");
        }
      } else if (sinceIssue >= 0 && sinceIssue <= windowDays) {
        score += 15; reasons.push(`Payée ${Math.round(sinceIssue)}j après émission`);
      }
    }

    const confidence = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
    suggestions.push({ candidate: c, score, confidence, reasons });
  }

  // Tri : meilleur score d'abord, max 3 suggestions
  return suggestions.sort((a, b) => b.score - a.score).slice(0, 3);
};

// ============================================================
// 🏷️ LIBELLÉS POUR L'UI
// ============================================================
export const confidenceLabel = (c: 'high' | 'medium' | 'low'): string =>
  c === 'high' ? '✅ Correspondance certaine'
  : c === 'medium' ? '🟡 Correspondance probable'
  : '❓ Correspondance possible';