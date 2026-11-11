// src/config/planRestrictions.ts

export type PlanTier = 'free' | 'essentiel' | 'pro' | 'business' | 'legende';

export const PLAN_ORDER: Record<PlanTier, number> = {
  free: 0,
  essentiel: 1,
  pro: 2,
  business: 3,
  legende: 4,
};

export const MODULE_ACCESS: Record<string, PlanTier> = {
  // --- Accessibles à tous (gratuit) ---
  dashboard: 'free',
  company: 'free',
  team: 'free',
  prospects: 'free',
  clients: 'free',
  catalogue: 'free',
  quotes: 'free',
  invoices: 'free',
  receipts: 'free',
  payments: 'free',
  billing: 'free',

  // --- Niveau Essentiel requis ---
  statistics: 'essentiel',

  // --- Niveau PRO requis ---
  receivedInvoices: 'pro',
  reminders: 'pro',
  treasury: 'pro',
  cashOperations: 'pro',

  // --- Niveau Business requis (Comptabilité) ---
  journal: 'business',
  grandLivre: 'business',
  balance: 'business',
  exportComptable: 'business',
  accountMapping: 'business',
  importExport: 'business',
  audit: 'business',
};

export const PLAN_LIMITS: Record<
  PlanTier,
  { maxProspects: number; maxQuotes: number; maxInvoicesPerMonth: number; maxUsers: number }
> = {
  free:      { maxProspects: 10,  maxQuotes: 5,  maxInvoicesPerMonth: 3,  maxUsers: 1 },
  essentiel: { maxProspects: 50,  maxQuotes: 20, maxInvoicesPerMonth: -1, maxUsers: 1 },
  pro:       { maxProspects: -1,  maxQuotes: -1, maxInvoicesPerMonth: -1, maxUsers: 3 },
  business:  { maxProspects: -1,  maxQuotes: -1, maxInvoicesPerMonth: -1, maxUsers: -1 },
  legende:   { maxProspects: -1,  maxQuotes: -1, maxInvoicesPerMonth: -1, maxUsers: -1 },
};

export function hasAccess(plan: PlanTier, module: string): boolean {
  const required = MODULE_ACCESS[module];
  if (!required) return true; // Si le module n'est pas dans la liste, on autorise par sécurité
  return PLAN_ORDER[plan] >= PLAN_ORDER[required];
}

export function requiredPlanFor(module: string): PlanTier {
  return MODULE_ACCESS[module] || 'free';
}