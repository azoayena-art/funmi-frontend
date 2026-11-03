// src/pages/Pricing.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Zap, Loader2, Crown, Calendar, ArrowLeft } from 'lucide-react';
import { usePaddle } from '../hooks/usePaddle';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import Sidebar from '../components/Sidebar';

// ============================================================
// ⚙️ CONFIGURATION DES PLANS TARIFAIRES
// ⚠️ Les prix affichés ci-dessous correspondent EXACTEMENT 
//    aux Price IDs Sandbox de votre capture d'écran Paddle.
// ============================================================
const PRICING_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Idéal pour les indépendants qui démarrent.',
    priceMonthly: 0,
    priceYearly: 0,
    priceIdMonthly: null,
    priceIdYearly: null,
    features: [
      'Jusqu\'à 5 clients actifs',
      '10 devis & factures / mois',
      'Relances manuelles',
      'Support par email'
    ],
    cta: 'Plan actuel',
    popular: false,
    disabled: true
  },
  {
    id: 'pro',
    name: 'Professionnel',
    description: 'Pour les artisans et TPE en croissance.',
    // ✅ PRIX MIS À JOUR pour correspondre aux IDs Paddle de votre capture
    priceMonthly: 12,  
    priceYearly: 200,  
    // ✅ VOS VRAIS PRICE IDs SANDBOX
    priceIdMonthly: 'pri_01m6cc847zn2e00vy655tvtar9', 
    priceIdYearly: 'pri_01m6cc847zn2e00vy655tvtar9',  

    features: [
      'Clients & devis illimités',
      'Relances automatiques par email',
      'E-facturation B2B (Réforme 2026)',
      'Tableau de bord financier',
      'Export comptable (FEC)',
      'Support prioritaire'
    ],
    cta: 'Passer au Pro',
    popular: true,
    disabled: false
  },
  {
    id: 'business',
    name: 'Business',
    description: 'Pour les équipes et les besoins avancés.',
    priceMonthly: 79,
    priceYearly: 790,
    priceIdMonthly: null, // Désactivé pour l'instant
    priceIdYearly: null,  // Désactivé pour l'instant
    features: [
      'Tout du plan Professionnel',
      'Jusqu\'à 5 utilisateurs',
      'Signature électronique intégrée',
      'API & Webhooks',
      'Manager de compte dédié',
      'Formation à la demande'
    ],
    cta: 'Contacter les ventes',
    popular: false,
    disabled: true
  }
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { customTeamId } = useTeam();
  const { openCheckout, loading: paddleLoading } = usePaddle();

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  const handleSubscribe = async (planId: string) => {
    const plan = PRICING_PLANS.find(p => p.id === planId);
    if (!plan || plan.disabled) return;

    if (!user) {
      toast.error('Vous devez être connecté pour souscrire');
      navigate('/login');
      return;
    }

    if (!customTeamId) {
      toast.error('Équipe non trouvée. Veuillez rafraîchir la page.');
      return;
    }

    const priceId = billingCycle === 'monthly' ? plan.priceIdMonthly : plan.priceIdYearly;
    
    if (!priceId) {
      toast.error('Configuration du plan invalide. Contactez le support.');
      return;
    }

    // ✅ LOG DE DÉBOGAGE : Vérifiez cette ligne dans la console (F12)
    console.log('🚀 Envoi à Paddle - Price ID:', priceId, '| User:', user.$id, '| Team:', customTeamId);

    setProcessingPlan(planId);

    try {
      await openCheckout(priceId, user.email, {
        user_id: user.$id,
        team_id: customTeamId
      });
    } catch (error) {
      console.error('Erreur ouverture checkout:', error);
      toast.error('Impossible d\'ouvrir le paiement. Veuillez réessayer.');
    } finally {
      setProcessingPlan(null);
    }
  };

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900 p-6 lg:p-10">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* En-tête avec bouton retour */}
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => navigate('/billing')}
                className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors mb-3"
              >
                <ArrowLeft size={16} />
                Retour à la facturation
              </button>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <Crown className="text-purple-600" size={28} />
                Choisissez votre plan
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2">
                Passez au niveau supérieur et débloquez toutes les fonctionnalités de RelancePro.
              </p>
            </div>
          </div>

          {/* Toggle Mensuel / Annuel */}
          <div className="flex justify-center">
            <div className="inline-flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full p-1 shadow-sm">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                  billingCycle === 'monthly' 
                    ? 'bg-purple-600 text-white shadow-md' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Mensuel
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                  billingCycle === 'yearly' 
                    ? 'bg-purple-600 text-white shadow-md' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Annuel
                <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold">
                  -17%
                </span>
              </button>
            </div>
          </div>

          {/* Grille des plans */}
          <div className="grid lg:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan) => {
              const price = billingCycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;
              const period = billingCycle === 'monthly' ? '/mois' : '/an';
              const isProcessing = processingPlan === plan.id;
              
              return (
                <div 
                  key={plan.id}
                  className={`relative p-6 lg:p-8 rounded-2xl border transition-all duration-300 hover:-translate-y-1 ${
                    plan.popular 
                      ? 'bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border-purple-300 dark:border-purple-700 shadow-xl shadow-purple-500/10 ring-2 ring-purple-500/20' 
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1">
                      <Zap size={12} />
                      Le plus populaire
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{plan.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>
                  </div>

                  <div className="mb-6">
                    <span className="text-4xl font-bold text-slate-900 dark:text-white">{price}€</span>
                    <span className="text-slate-500 dark:text-slate-400 ml-1">{period}</span>
                    {billingCycle === 'yearly' && price > 0 && plan.priceMonthly > 0 && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                        💰 Économisez {(plan.priceMonthly * 12 - plan.priceYearly).toFixed(0)}€/an
                      </p>
                    )}
                  </div>

                  <button 
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={plan.disabled || isProcessing || paddleLoading}
                    className={`w-full py-3 rounded-xl font-semibold transition-all mb-6 flex items-center justify-center gap-2 ${
                      plan.popular
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/30 active:scale-95'
                        : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Ouverture du paiement...
                      </>
                    ) : (
                      plan.cta
                    )}
                  </button>

                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                        <Check size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Section réassurance */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mt-8">
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                  <Check size={20} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Sans engagement</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Annulez à tout moment</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <Calendar size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Essai 14 jours</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Testez sans risque</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                  <Zap size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Activation immédiate</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Toutes les fonctions débloquées</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </Sidebar>
  );
}