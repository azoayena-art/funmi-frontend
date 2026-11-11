// src/hooks/usePlanAccess.ts
import { useSubscription } from './useSubscription';
import {
  hasAccess,
  PLAN_LIMITS,
  requiredPlanFor,
  type PlanTier,
} from '../config/planRestrictions';

export function usePlanAccess() {
  const { planTier, isLoading } = useSubscription();

  // Sécurise le plan (si valeur inconnue, retombe sur free)
  const plan: PlanTier = (['free', 'essentiel', 'pro', 'business', 'legende'].includes(planTier)
    ? planTier
    : 'free') as PlanTier;

  const limits = PLAN_LIMITS[plan];

  return {
    planTier: plan,
    isLoading,
    limits,

    // Le plan a-t-il accès au module ?
    canAccess: (module: string) => hasAccess(plan, module),

    // Plan minimum requis (pour afficher "Dispo dès le plan Pro")
    requiredPlan: (module: string) => requiredPlanFor(module),

    // Aide pour les limites (-1 = illimité)
    isUnlimited: (value: number) => value === -1,
  };
}