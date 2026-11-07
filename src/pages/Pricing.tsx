// src/pages/Pricing.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePaddle } from '../context/PaddleContext';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { Check, X, Loader2, Sparkles, Shield, Zap } from 'lucide-react';
import { toast } from 'sonner';

// Récupération des IDs depuis le .env
const STARTER_PRICE_ID = import.meta.env.VITE_PADDLE_STARTER_PRICE_ID;
const PRO_PRICE_ID = import.meta.env.VITE_PADDLE_PRO_PRICE_ID;

export default function Pricing() {
  const { paddle, isReady } = usePaddle();
  const { user } = useAuth();
  const { customTeamId } = useTeam();
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  // 🔍 DEBUG : Vérifier ce qui est chargé au montage du composant
  useEffect(() => {
    console.log('🔍 [DEBUG PRICING] STARTER_PRICE_ID:', STARTER_PRICE_ID);
    console.log('🔍 [DEBUG PRICING] PRO_PRICE_ID:', PRO_PRICE_ID);
    console.log('🔍 [DEBUG PRICING] Paddle isReady:', isReady);
    console.log('🔍 [DEBUG PRICING] Paddle instance:', paddle);
    console.log('🔍 [DEBUG PRICING] customTeamId:', customTeamId);
  }, [isReady, paddle, customTeamId]);

  const handleCheckout = async (priceId: string, planName: string) => {
    console.log('🔍 [DEBUG] handleCheckout appelé avec priceId:', priceId, 'planName:', planName);
    
    if (!isReady || !paddle) {
      console.error('❌ [DEBUG] Paddle n\'est pas prêt. isReady=', isReady, 'paddle=', paddle);
      toast.error('Paddle n\'est pas encore chargé. Veuillez réessayer dans un instant.');
      return;
    }

    if (!user || !customTeamId) {
      toast.error('Vous devez être connecté pour souscrire.');
      navigate('/login');
      return;
    }

    setLoadingPlan(planName);

    // URL de retour après succès
    const successUrl = `${window.location.origin}/billing?success=true&plan=${planName}`;

    try {
      paddle.Checkout.open({
        settings: {
          displayMode: 'overlay',
          theme: 'light',
          locale: 'fr',
          successUrl: successUrl,
        },
        items: [{ priceId, quantity: 1 }],
        customer: {
          email: user.email,
        },
        customData: {
          teamId: customTeamId,
          userId: user.$id,
        },
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'ouverture du checkout Paddle:', error);
      toast.error('Erreur lors du lancement du paiement.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold mb-4 border border-indigo-100 dark:border-indigo-800">
            <Sparkles size={12} />
            Tarification simple et transparente
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            Choisissez le plan adapté à votre croissance
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Démarrez gratuitement avec 14 jours d'essai. Passez à la vitesse supérieure avec Funmi Pro pour la comptabilité complète.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          
          {/* PLAN STARTER */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8 flex flex-col hover:border-indigo-300 dark:hover:border-indigo-700 transition-all">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap size={18} className="text-blue-500" />
                Funmi Starter
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Pour les indépendants et TPE qui débutent.</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold text-slate-900 dark:text-white">14 €</span>
              <span className="text-slate-500 dark:text-slate-400"> / mois</span>
              <p className="text-xs text-slate-400 mt-1">+ 14 jours d'essai gratuit</p>
            </div>
            
            <ul className="space-y-3 mb-8 flex-1">
              {['50 Factures & Devis / mois', '100 Clients & Prospects', 'Relances automatiques basiques', 'Support par email', 'Multi-utilisateur (1 siège)'].map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <Check size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
              {['Export FEC / OHADA', 'Grand Livre & Balance'].map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-400 dark:text-slate-600 line-through">
                  <X size={16} className="flex-shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCheckout(STARTER_PRICE_ID, 'starter')}
              disabled={!isReady || loadingPlan !== null}
              className="w-full py-3 px-4 rounded-lg font-semibold text-sm bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!isReady ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Chargement du paiement...
                </>
              ) : loadingPlan === 'starter' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Redirection...
                </>
              ) : (
                'Commencer l\'essai'
              )}
            </button>
          </div>

          {/* PLAN PRO (Mis en avant) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border-2 border-indigo-500 dark:border-indigo-500 p-8 flex flex-col relative transform md:-translate-y-4">
            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-2">
              <span className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1">
                <Sparkles size={10} /> Le plus populaire
              </span>
            </div>
            
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Shield size={18} className="text-indigo-500" />
                Funmi Pro
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Pour les PME exigeantes et experts-comptables.</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold text-slate-900 dark:text-white">39 €</span>
              <span className="text-slate-500 dark:text-slate-400"> / mois</span>
              <p className="text-xs text-slate-400 mt-1">+ 14 jours d'essai gratuit</p>
            </div>
            
            <ul className="space-y-3 mb-8 flex-1">
              {[
                'Factures & Devis ILLIMITÉS', 
                'Clients & Prospects ILLIMITÉS', 
                'Export FEC (France) & SYSCOHADA (OHADA)',
                'Grand Livre & Balance Comptable',
                'Relances avancées & Scénarios',
                'Support prioritaire',
                'Jusqu\'à 3 sièges utilisateurs'
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <Check size={16} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCheckout(PRO_PRICE_ID, 'pro')}
              disabled={!isReady || loadingPlan !== null}
              className="w-full py-3 px-4 rounded-lg font-bold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!isReady ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Chargement du paiement...
                </>
              ) : loadingPlan === 'pro' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Redirection...
                </>
              ) : (
                'Passer à Funmi Pro'
              )}
            </button>
          </div>

        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-500 dark:text-slate-500 mt-12">
          Paiement sécurisé par Paddle. Nous gérons automatiquement la TVA européenne et internationale.
        </p>
      </div>
    </div>
  );
}