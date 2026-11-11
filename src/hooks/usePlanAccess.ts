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
  
  // 🔍 DEBUG : Affiche le plan détecté
  console.log('🎯 [usePlanAccess] planTier brut:', planTier);
  console.log('🎯 [usePlanAccess] isLoading:', isLoading);
  
  // Mapping strict : seules ces valeurs sont acceptées
  const planMap: Record<string, PlanTier> = {
    'free': 'free',
    'essentiel': 'essentiel',
    'pro': 'pro',
    'business': 'business',
    'legende': 'legende',
    // Les statuts d'abonnement ne sont PAS des plans
    'trialing': 'free',
    'active': 'free',
    'canceled': 'free',
    'past_due': 'free',
    'paused': 'free',
    'expired': 'free',
    'none': 'free',
  };
  
  const plan: PlanTier = planMap[String(planTier || '').toLowerCase()] || 'free';
  
  console.log('🎯 [usePlanAccess] plan final:', plan);
  
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