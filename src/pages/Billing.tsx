import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useSubscription } from '../hooks/useSubscription';
import { DEFAULT_PLANS } from '../data/plansConfig';
import { 
  CreditCard, CheckCircle, AlertCircle, Calendar, 
  ArrowRight, Shield, Loader2, Receipt, Sparkles, Zap
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { toast } from 'sonner';

export default function Billing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { customTeamId } = useTeam();
  
  // Utilise le hook sécurisé qui appelle la fonction Appwrite
  const { planTier, status, subscriptionRenewsAt, isLoading } = useSubscription();
  
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Détection du paramètre ?success=true après paiement
  useEffect(() => {
    const successParam = searchParams.get('success');
    if (successParam === 'true') {
      setShowSuccessMessage(true);
      toast.success('🎉 Paiement réussi ! Votre abonnement a été activé.');
      
      // Nettoie l'URL après 5 secondes
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
        navigate('/billing', { replace: true });
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [searchParams, navigate]);

  // Récupère les détails du plan depuis la config locale
  const currentPlan = DEFAULT_PLANS.find(p => p.id === planTier);
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle size={14} /> Actif
          </span>
        );
      case 'trialing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            <Sparkles size={14} /> Essai gratuit
          </span>
        );
      case 'canceled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <AlertCircle size={14} /> Annulé
          </span>
        );
      case 'past_due':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <AlertCircle size={14} /> Paiement en attente
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
            <Calendar size={14} /> En pause
          </span>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Sidebar>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="animate-spin text-purple-600" size={32} />
            <p className="text-sm text-slate-500">Chargement de votre facturation...</p>
          </div>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="w-full bg-slate-50 dark:bg-slate-900 p-6 lg:p-10">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Message de succès après paiement */}
          {showSuccessMessage && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 flex items-start gap-4 animate-fade-in">
              <div className="flex-shrink-0 w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center">
                <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                  Paiement réussi ! 🎉
                </h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                  Votre abonnement <strong>{currentPlan?.name || planTier}</strong> est maintenant actif. 
                  Toutes les fonctionnalités de ce plan sont débloquées.
                </p>
              </div>
            </div>
          )}

          {/* En-tête */}
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <CreditCard className="text-purple-600" size={28} />
              Facturation & Abonnement
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              Gérez votre plan, consultez vos dates de renouvellement et vos méthodes de paiement.
            </p>
          </div>

          {/* Carte du plan actuel */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                
                {/* Infos du plan */}
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                      Plan actuel
                    </p>
                    <div className="flex items-center gap-3">
                      <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
                        {currentPlan?.name || (planTier === 'free' ? 'Gratuit' : planTier)}
                      </h2>
                      {status && getStatusBadge(status)}
                    </div>
                  </div>

                  {currentPlan ? (
                    <div className="flex flex-wrap gap-6 text-sm text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <Receipt size={16} className="text-slate-400" />
                        <span>{currentPlan.monthlyPrice}€ / mois</span>
                      </div>
                      {subscriptionRenewsAt && (
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-slate-400" />
                          <span>
                            Prochain renouvellement : {new Date(subscriptionRenewsAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Shield size={16} />
                      Vous bénéficiez des fonctionnalités de base gratuitement.
                    </p>
                  )}

                  {/* Fonctionnalités incluses */}
                  {currentPlan && (
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                        Fonctionnalités incluses
                      </p>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {currentPlan.features.slice(0, 4).map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <CheckCircle size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 lg:pl-6 lg:border-l border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => navigate('/pricing')}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
                  >
                    {currentPlan ? 'Changer de plan' : 'Passer au Pro'}
                    <ArrowRight size={16} />
                  </button>
                  
                  {currentPlan && planTier !== 'free' && (
                    <button
                      onClick={() => {
                        toast.info('Le portail de gestion sera bientôt disponible.');
                      }}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl transition-all"
                    >
                      Gérer le paiement
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Bandeau d'info bas de carte */}
            <div className="bg-slate-50 dark:bg-slate-800/50 px-6 lg:px-8 py-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                {currentPlan && planTier !== 'free'
                  ? "Votre abonnement sera renouvelé automatiquement à la date indiquée. Vous pouvez l'annuler à tout moment sans frais supplémentaires."
                  : "Aucune carte bancaire n'est requise pour le plan gratuit."}
              </p>
            </div>
          </div>

          {/* Comparaison rapide avec les autres plans */}
          {planTier === 'free' && (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/10 dark:to-indigo-900/10 rounded-2xl border border-purple-200 dark:border-purple-800 p-6 lg:p-8">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/40 rounded-full flex items-center justify-center">
                  <Zap className="text-purple-600 dark:text-purple-400" size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-purple-900 dark:text-purple-100 mb-2">
                    Passez à la vitesse supérieure
                  </h3>
                  <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
                    Débloquez les relances automatiques, la trésorerie en temps réel et bien plus avec le plan Pro.
                  </p>
                  <button
                    onClick={() => navigate('/pricing')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-all"
                  >
                    Voir les plans
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Section Historique */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 lg:p-8">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Historique des factures</h3>
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <Receipt size={40} className="mx-auto mb-3 opacity-30" />
              <p>Aucune facture disponible pour le moment.</p>
              <p className="text-sm mt-1">Vos futures factures apparaîtront ici après chaque cycle de facturation.</p>
            </div>
          </div>

        </div>
      </div>
    </Sidebar>
  );
}