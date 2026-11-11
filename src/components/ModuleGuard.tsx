// src/components/ModuleGuard.tsx
import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePlanAccess } from '../hooks/usePlanAccess';
import { Lock } from 'lucide-react';

interface ModuleGuardProps {
  module: string;
  children: ReactNode;
}

export default function ModuleGuard({ module, children }: ModuleGuardProps) {
  const { canAccess, isLoading, requiredPlan } = usePlanAccess();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!canAccess(module)) {
    // Redirige vers une page "upgrade" ou affiche un écran verrouillé
    return <LockedScreen requiredPlan={requiredPlan(module)} />;
  }

  return <>{children}</>;
}

function LockedScreen({ requiredPlan }: { requiredPlan: string }) {
  const planNames: Record<string, string> = {
    essentiel: 'Essentiel',
    pro: 'Pro',
    business: 'Business',
  };

  return (
    <div className="flex flex-col items-center justify-center h-[70vh] text-center px-6">
      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
        <Lock className="text-slate-400" size={28} />
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
        Fonctionnalité verrouillée
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
        Ce module est disponible à partir du plan{' '}
        <strong className="text-purple-600 dark:text-purple-400">
          {planNames[requiredPlan] || requiredPlan}
        </strong>.
        Passez à la vitesse supérieure pour le débloquer.
      </p>
      <a
        href="/pricing"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-all"
      >
        Voir les plans disponibles
      </a>
    </div>
  );
}