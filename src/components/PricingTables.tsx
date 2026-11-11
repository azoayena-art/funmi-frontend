import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Shield, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePaddle } from '../context/PaddleContext';
import { useTeam } from '../context/TeamContext';
import { useLivePlans } from '../hooks/useLivePlans';
import { toast } from 'sonner';

// ============================================================
// DONNÉES : FORMULES (Pour l'affichage du tableau)
// ============================================================
export interface PricingPlan {
  id: string;
  name: string;
  monthlyPrice?: number;
  yearlyPrice?: number;
  lifetimePrice?: number;
  badge?: string;
}

export const PRICING_PLANS: PricingPlan[] = [
  { id: 'essentiel', name: 'Essentiel', monthlyPrice: 9, yearlyPrice: 90 },
  { id: 'pro', name: 'Pro', badge: 'Plus populaire', monthlyPrice: 29, yearlyPrice: 290 },
  { id: 'business', name: 'Business', monthlyPrice: 59, yearlyPrice: 590 },
  { id: 'legende', name: 'Légende', lifetimePrice: 1490 },
];

// ============================================================
// DONNÉES : FONCTIONNALITÉS PAR PLAN
// ============================================================
export interface FeatureRow {
  name: string;
  essentiel: boolean | string;
  pro: boolean | string;
  business: boolean | string;
  legende: boolean | string;
}

export const FEATURE_COMPARISON: FeatureRow[] = [
  { name: 'Tableau de bord', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Statistiques', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Prospects', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Clients', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Catalogue', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Devis', essentiel: true, pro: true, business: true, legende: true },
  { name: 'Factures clients', essentiel: '20/mois', pro: 'Illimité', business: 'Illimité', legende: 'Illimité' },
  { name: 'Factures fournisseurs', essentiel: false, pro: true, business: true, legende: true },
  { name: 'Relances automatiques', essentiel: false, pro: true, business: true, legende: true },
  { name: 'Reçus', essentiel: false, pro: true, business: true, legende: true },
  { name: 'Trésorerie', essentiel: false, pro: true, business: true, legende: true },
  { name: 'Entrées & Sorties', essentiel: false, pro: true, business: true, legende: true },
  { name: 'Journal', essentiel: false, pro: false, business: true, legende: true },
  { name: 'Grand Livre', essentiel: false, pro: false, business: true, legende: true },
  { name: 'Balance', essentiel: false, pro: false, business: true, legende: true },
  { name: 'Export Comptable', essentiel: false, pro: false, business: true, legende: true },
  { name: 'Plan Comptable', essentiel: false, pro: false, business: true, legende: true },
  { name: 'Sauvegardes', essentiel: 'Hebdomadaires', pro: 'Quotidiennes', business: 'Quotidiennes', legende: 'Quotidiennes' },
  { name: 'Historique & Audit', essentiel: false, pro: false, business: true, legende: true },
];

// ============================================================
// DONNÉES : RESTRICTIONS / RESSOURCES
// ============================================================
export const PLAN_RESOURCES = [
  { resource: 'Utilisateurs', essentiel: '1', pro: '3', business: 'Illimités', legende: 'Illimités' },
  { resource: 'Prospects', essentiel: '50*', pro: 'Illimités', business: 'Illimités', legende: 'Illimités' },
  { resource: 'Devis', essentiel: 'Illimités', pro: 'Illimités', business: 'Illimités', legende: 'Illimités' },
  { resource: 'Factures clients', essentiel: '20/mois', pro: 'Illimitées', business: 'Illimitées', legende: 'Illimitées' },
  { resource: 'Factures fournisseurs', essentiel: 'Bloquées', pro: 'Illimitées', business: 'Illimitées', legende: 'Illimitées' },
  { resource: 'Entreprises', essentiel: '1', pro: '1', business: '1', legende: '1' },
  { resource: 'Entités juridiques', essentiel: '1', pro: '1', business: '1', legende: '1' },
];

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function PricingTables() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { customTeamId } = useTeam();
  const { paddle, isReady } = usePaddle();
  
  // On récupère les vrais plans avec les priceId pour le checkout
  const { plans: livePlans, loading: plansLoading } = useLivePlans();
  
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  // ✅ LOGIQUE DE PAIEMENT SÉCURISÉE
  const handleChoosePlan = async (planId: string) => {
    // 1. Si non connecté -> redirection vers l'inscription avec le plan en paramètre
    if (!user) {
      navigate(`/register?plan=${planId}`);
      return;
    }

    // 2. Si connecté -> ouverture directe du checkout Paddle
    if (!isReady || !paddle) {
      toast.error('Le système de paiement est en cours de chargement.');
      return;
    }

    // Trouver le plan réel dans les données live pour obtenir les priceId corrects
    const livePlan = livePlans.find(p => p.id === planId);
    if (!livePlan) {
      toast.error('Plan introuvable.');
      return;
    }

    setProcessingPlan(planId);
    
    const isLifetime = livePlan.id === 'legende';
    const priceId = isLifetime 
      ? livePlan.priceIdMonthly 
      : (billingCycle === 'monthly' ? livePlan.priceIdMonthly : livePlan.priceIdYearly);

    if (!priceId || String(priceId).includes('A_REMPLIR')) {
      toast.error('Ce plan n\'est pas encore configuré pour le paiement.');
      setProcessingPlan(null);
      return;
    }

    try {
      paddle.Checkout.open({
        settings: { 
          displayMode: 'overlay', 
          theme: 'light', 
          locale: 'fr', 
          successUrl: `${window.location.origin}/billing?success=true&plan=${planId}` 
        },
        items: [{ priceId, quantity: 1 }],
        customer: { email: user.email },
        customData: { 
          teamId: customTeamId, 
          userId: user.$id 
        },
      });
    } catch (error) {
      console.error('❌ Erreur Paddle Checkout:', error);
      toast.error('Erreur lors du lancement du paiement.');
    } finally {
      setProcessingPlan(null);
    }
  };

  const renderCellValue = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check size={18} className="mx-auto text-emerald-600" />
      ) : (
        <X size={18} className="mx-auto text-slate-300" />
      );
    }
    return <span className="text-xs font-medium text-slate-600">{value}</span>;
  };

  const renderPlanHeader = (plan: PricingPlan) => {
    const isLifetime = plan.id === 'legende';
    const isPopular = plan.id === 'pro';

    const price = isLifetime
      ? plan.lifetimePrice!
      : billingCycle === 'monthly'
        ? plan.monthlyPrice!
        : plan.yearlyPrice!;

    const period = isLifetime
      ? 'paiement unique'
      : billingCycle === 'monthly'
        ? '/ mois'
        : '/ an';

    return (
      <th
        key={plan.id}
        className={`px-4 py-6 text-center align-top ${
          isLifetime ? 'bg-slate-950' : isPopular ? 'bg-indigo-50/70' : 'bg-slate-50'
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          {plan.badge && (
            <span className="rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-bold text-white shadow-sm">
              {plan.badge}
            </span>
          )}

          <span className={`text-base font-bold tracking-tight ${isLifetime ? 'text-white' : 'text-slate-950'}`}>
            {plan.name}
          </span>

          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-extrabold tracking-tight ${isLifetime ? 'text-white' : 'text-slate-950'}`}>
              {price.toLocaleString('fr-FR')}
            </span>
            <span className={`text-[11px] font-semibold ${isLifetime ? 'text-slate-300' : 'text-slate-500'}`}>
              € {period}
            </span>
          </div>

          <p className={`text-[11px] font-semibold ${isLifetime ? 'text-amber-300' : 'text-emerald-600'}`}>
            {isLifetime ? 'Accès à vie' : "14 jours d'essai gratuit"}
          </p>

          <button
            type="button"
            onClick={() => handleChoosePlan(plan.id)}
            disabled={processingPlan === plan.id}
            className={`mt-2 w-full max-w-[150px] rounded-full px-4 py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              isLifetime
                ? 'bg-white text-slate-950 hover:bg-indigo-50'
                : isPopular
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 hover:bg-indigo-700'
                  : 'bg-slate-950 text-white hover:bg-indigo-700'
            } disabled:opacity-70 disabled:cursor-not-allowed`}
          >
            {processingPlan === plan.id ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              user ? 'Souscrire' : 'Créer mon compte'
            )}
          </button>
        </div>
      </th>
    );
  };

  if (plansLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* En-tête + sélecteur de cycle */}
      <div className="mx-auto mb-12 max-w-3xl text-center">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Nos formules
        </p>
        <h2 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Choisissez la formule adaptée à votre activité.
        </h2>

        <div className="mt-9 inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1.5">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            aria-pressed={billingCycle === 'monthly'}
            className={`rounded-full px-6 py-3 text-sm font-semibold transition-all ${
              billingCycle === 'monthly'
                ? 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            Mensuel
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            aria-pressed={billingCycle === 'yearly'}
            className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all ${
              billingCycle === 'yearly'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-indigo-600'
            }`}
          >
            Annuel
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                billingCycle === 'yearly'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              2 mois offerts
            </span>
          </button>
        </div>
      </div>

      {/* TABLEAU 1 : TARIFS + FONCTIONNALITÉS */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] table-fixed">
            <thead>
              <tr>
                <th className="w-[220px] bg-slate-50 px-5 py-6 text-left align-bottom">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Fonctionnalités
                  </span>
                </th>
                {PRICING_PLANS.map(renderPlanHeader)}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {FEATURE_COMPARISON.map((feature) => (
                <tr key={feature.name} className="transition-colors hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 text-sm font-medium text-slate-900">{feature.name}</td>
                  <td className="px-4 py-3.5 text-center">{renderCellValue(feature.essentiel)}</td>
                  <td className="bg-indigo-50/30 px-4 py-3.5 text-center">{renderCellValue(feature.pro)}</td>
                  <td className="px-4 py-3.5 text-center">{renderCellValue(feature.business)}</td>
                  <td className="bg-slate-50/60 px-4 py-3.5 text-center">{renderCellValue(feature.legende)}</td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t border-slate-200">
                <td className="px-5 py-5" />
                {PRICING_PLANS.map((plan) => {
                  const isLifetime = plan.id === 'legende';
                  const isPopular = plan.id === 'pro';
                  return (
                    <td
                      key={plan.id}
                      className={`px-4 py-5 text-center ${
                        isLifetime ? 'bg-slate-950' : isPopular ? 'bg-indigo-50/70' : 'bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleChoosePlan(plan.id)}
                        disabled={processingPlan === plan.id}
                        className={`w-full max-w-[150px] rounded-full px-4 py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                          isLifetime
                            ? 'bg-white text-slate-950 hover:bg-indigo-50'
                            : isPopular
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                              : 'bg-slate-950 text-white hover:bg-indigo-700'
                        } disabled:opacity-70 disabled:cursor-not-allowed`}
                      >
                        {processingPlan === plan.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          user ? 'Souscrire depuis mon espace' : 'Créer mon compte'
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* TABLEAU 2 : RESTRICTIONS / RESSOURCES */}
      <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] table-fixed">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-[220px] px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Restrictions / Ressources
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Essentiel</th>
                <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Pro</th>
                <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Business</th>
                <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Légende</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PLAN_RESOURCES.map((row) => (
                <tr key={row.resource} className="transition-colors hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 text-sm font-medium text-slate-900">{row.resource}</td>
                  <td className="px-4 py-3.5 text-center text-sm text-slate-600">{row.essentiel}</td>
                  <td className="bg-indigo-50/30 px-4 py-3.5 text-center text-sm text-slate-600">{row.pro}</td>
                  <td className="px-4 py-3.5 text-center text-sm text-slate-600">{row.business}</td>
                  <td className="bg-slate-50/60 px-4 py-3.5 text-center text-sm text-slate-600">{row.legende}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ✅ BANDEAU SÉCURITÉ / FLUX DE PAIEMENT */}
      <div className="mt-10 flex justify-center">
        <div className="flex max-w-2xl items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4">
          <Shield size={16} className="mt-0.5 shrink-0 text-indigo-600" />
          <p className="text-xs leading-6 text-slate-600">
            <strong className="font-semibold text-slate-900">Paiement sécurisé :</strong>{' '}
            {user ? (
              <>le paiement s'effectue directement via Paddle. Vos données de facturation sont chiffrées et protégées.</>
            ) : (
              <>créez votre compte gratuitement. Le paiement sécurisé via Paddle ne sera demandé qu'après votre inscription, depuis votre espace de gestion.</>
            )}
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-xs leading-6 text-slate-400">
        Les prix et fonctionnalités sont susceptibles d'évoluer. La souscription s'effectue en toute transparence depuis votre espace FUNMI.
      </p>
    </div>
  );
}