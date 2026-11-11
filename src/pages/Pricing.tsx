// src/pages/Pricing.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { functions } from '../appwrite'; // Assure-toi que le chemin est correct
import { DEFAULT_PLANS } from '../data/plansConfig';
import { Check, X, Loader2, Sparkles, Shield, Zap, Crown, Building2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const getPlanIcon = (id: string) => {
  switch (id) {
    case 'essentiel': return Zap;
    case 'pro': return Shield;
    case 'business': return Building2;
    case 'legende': return Crown;
    default: return Sparkles;
  }
};

const getPlanColor = (id: string) => {
  switch (id) {
    case 'essentiel': return 'blue';
    case 'pro': return 'indigo';
    case 'business': return 'purple';
    case 'legende': return 'amber';
    default: return 'slate';
  }
};

export default function Pricing() {
  const { user } = useAuth();
  const { customTeamId } = useTeam();
  const navigate = useNavigate();
  
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [isYearly, setIsYearly] = useState(false);

  const handleCheckout = async (
    planId: string,
    priceId: string | null | undefined,
    planName: string
  ) => {
    if (!priceId) {
      toast.error('Ce plan n\'est pas disponible au paiement.');
      return;
    }

    if (!user || !customTeamId) {
      toast.error('Vous devez être connecté pour souscrire.');
      navigate('/login');
      return;
    }

    if (loadingPlan) return;
    setLoadingPlan(planId);

    try {
      console.log('🚀 [PRICING] Demande de lien de checkout au serveur...');
      
      // ⚠️ TRÈS IMPORTANT : Remplace cette chaîne par le VRAI ID de ta fonction 'create-checkout'
      // Tu le trouves dans Appwrite > Functions > create-checkout > Settings (ex: '65a1b2c3...')
      const CHECKOUT_FUNCTION_ID = 'create-checkout'; 

      const execution = await functions.createExecution(
        CHECKOUT_FUNCTION_ID,
        JSON.stringify({
          priceId: priceId,
          teamId: customTeamId,
          userId: user.$id,
          userEmail: user.email || ''
        })
      );

      console.log('📥 Réponse fonction:', execution.responseStatusCode, execution.responseBody);

      if (execution.responseStatusCode === 200) {
        const responseData = JSON.parse(execution.responseBody);
        
        if (responseData.success && responseData.checkoutUrl) {
          toast.success('Redirection vers le paiement sécurisé...');
          window.open(responseData.checkoutUrl, '_blank', 'noopener,noreferrer');
        } else {
          throw new Error(responseData.error || 'Erreur inconnue du serveur');
        }
      } else {
        throw new Error(`Erreur serveur: ${execution.responseStatusCode}`);
      }

    } catch (error: any) {
      console.error('❌ [PRICING] Erreur:', error);
      toast.error(error.message || 'Impossible de lancer le paiement. Veuillez réessayer.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        
        <button 
          type="button"
          onClick={() => navigate('/billing')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Retour à mon abonnement
        </button>

        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold mb-4 border border-indigo-100 dark:border-indigo-800">
            <Sparkles size={12} />
            Tarification simple et transparente
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            Choisissez le plan adapté à votre croissance
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
            Démarrez gratuitement. Passez à la vitesse supérieure avec Funmi.
          </p>

          <div className="flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!isYearly ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Mensuel</span>
            <button
              type="button"
              onClick={() => setIsYearly(!isYearly)}
              className="relative w-14 h-7 bg-slate-200 dark:bg-slate-700 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${isYearly ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
            <span className={`text-sm font-medium ${isYearly ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Annuel</span>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full">
              -2 mois offerts
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4">
          {DEFAULT_PLANS.map((plan) => {
            const Icon = getPlanIcon(plan.id);
            const color = getPlanColor(plan.id);
            const price = isYearly && !plan.isLifetime ? plan.yearlyPrice : plan.monthlyPrice;
            const priceId = isYearly && !plan.isLifetime ? plan.priceIdYearly : plan.priceIdMonthly;
            const isCurrentLoading = loadingPlan === plan.id;

            return (
              <div 
                key={plan.id}
                className={`relative flex flex-col bg-white dark:bg-slate-900 rounded-2xl border p-6 transition-all duration-300 ${
                  plan.isPopular 
                    ? 'border-indigo-500 dark:border-indigo-500 shadow-xl shadow-indigo-500/10 scale-105 z-10' 
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <span className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1 uppercase tracking-wider">
                      <Sparkles size={10} /> Populaire
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <div className={`w-10 h-10 rounded-lg bg-${color}-50 dark:bg-${color}-900/20 flex items-center justify-center mb-4`}>
                    <Icon size={20} className={`text-${color}-600 dark:text-${color}-400`} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 min-h-[40px]">{plan.description}</p>
                </div>

                <div className="mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-slate-900 dark:text-white">{price} €</span>
                    {!plan.isLifetime && <span className="text-sm text-slate-500 dark:text-slate-400">/ {isYearly ? 'an' : 'mois'}</span>}
                  </div>
                  {plan.isLifetime && <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">Paiement unique à vie</p>}
                  {!plan.isLifetime && isYearly && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">Équivalent à {Math.round(price / 12)} € / mois</p>}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                      <Check size={16} className={`text-${color}-500 flex-shrink-0 mt-0.5`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {plan.limitations.map((limitation, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-400 dark:text-slate-600">
                      <X size={16} className="flex-shrink-0 mt-0.5" />
                      <span className="line-through decoration-slate-400/50">{limitation}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handleCheckout(plan.id, priceId, plan.name)}
                  disabled={isCurrentLoading}
                  className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    plan.isPopular
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/25'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {isCurrentLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Génération du lien...
                    </>
                  ) : (
                    'Choisir ce plan'
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center space-y-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">Tous les plans incluent un essai gratuit de 14 jours.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-2">
            <Shield size={12} /> Paiement 100% sécurisé par Paddle.
          </p>
        </div>
      </div>
    </div>
  );
}