// src/components/ModuleGuard.tsx
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlanAccess } from '../hooks/usePlanAccess';
import { Lock, ArrowRight, Shield } from 'lucide-react';

interface ModuleGuardProps {
  module: string;
  children: ReactNode;
  showLockIcon?: boolean; // ✅ Nouveau : permet de masquer le cadenas
}

export default function ModuleGuard({ module, children, showLockIcon = true }: ModuleGuardProps) {
  const { canAccess, isLoading, requiredPlan } = usePlanAccess();

  console.log(`🛡️ [ModuleGuard] Vérification du module: "${module}"`);
  console.log(`🛡️ [ModuleGuard] canAccess("${module}"):`, canAccess(module));

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Vérification de votre abonnement...</p>
        </div>
      </div>
    );
  }

  if (!canAccess(module)) {
    console.warn(`🚫 [ModuleGuard] ACCÈS REFUSÉ pour le module: "${module}" (Plan requis: ${requiredPlan(module)})`);
    return <LockedScreen requiredPlan={requiredPlan(module)} showLockIcon={showLockIcon} />;
  }

  console.log(`✅ [ModuleGuard] ACCÈS AUTORISÉ pour le module: "${module}"`);
  return <>{children}</>;
}

function LockedScreen({ requiredPlan, showLockIcon }: { requiredPlan: string; showLockIcon: boolean }) {
  const navigate = useNavigate();

  const planNames: Record<string, string> = {
    essentiel: 'Essentiel',
    pro: 'Pro',
    business: 'Business',
    legende: 'Légende',
  };

  const planDescriptions: Record<string, string> = {
    essentiel: 'Débloquez les statistiques avancées et les sauvegardes automatiques.',
    pro: 'Débloquez les relances automatiques, la trésorerie en temps réel et les factures fournisseurs.',
    business: 'Débloquez la comptabilité complète : Journal, Grand Livre, Balance, Export FEC/OHADA et Plan Comptable.',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-8 text-center">
        {/* ✅ Cadenas affiché uniquement si showLockIcon = true */}
        {showLockIcon && (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center mx-auto mb-6">
            <Lock className="text-purple-600 dark:text-purple-400" size={28} />
          </div>
        )}

        {/* ✅ Icône alternative pour la comptabilité (bouclier) */}
        {!showLockIcon && (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center mx-auto mb-6">
            <Shield className="text-amber-600 dark:text-amber-400" size={28} />
          </div>
        )}

        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          Fonctionnalité {showLockIcon ? 'verrouillée' : 'Premium'}
        </h2>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Ce module est disponible à partir du plan{' '}
          <strong className="text-purple-600 dark:text-purple-400">
            {planNames[requiredPlan] || requiredPlan}
          </strong>.
        </p>

        {planDescriptions[requiredPlan] && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
            {planDescriptions[requiredPlan]}
          </p>
        )}

        <button
          onClick={() => navigate('/pricing')}
          className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/25"
        >
          Voir les plans disponibles
          <ArrowRight size={16} />
        </button>

        <button
          onClick={() => navigate(-1)}
          className="mt-3 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          ← Retour
        </button>
      </div>
    </div>
  );
}