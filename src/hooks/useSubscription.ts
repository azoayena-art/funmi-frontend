// src/hooks/useSubscription.ts
import { useState, useEffect } from 'react';
import { functions } from '../appwrite';
import { useTeam } from '../context/TeamContext';

export type PlanTier = 'free' | 'essentiel' | 'pro' | 'business' | 'legende';

export interface SubscriptionData {
  planTier: PlanTier;
  status: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  subscriptionRenewsAt: string | null;
  isPro: boolean;
  isBusiness: boolean;
  isLoading: boolean;
}

// ⚠️ REMPLACE CECI PAR LE VRAI ID DE TA FONCTION (ex: '65a1b2c3d4e5f6a7b8c9d0e1')
// Ce n'est PAS le nom de la fonction, mais son identifiant unique de 24 caractères.
const GET_SUBSCRIPTION_FUNCTION_ID = 'get-subscription'; 

export const useSubscription = (): SubscriptionData => {
  const { customTeamId, loading: teamLoading } = useTeam();

  const [data, setData] = useState<SubscriptionData>({
    planTier: 'free',
    status: 'none',
    subscriptionRenewsAt: null,
    isPro: false,
    isBusiness: false,
    isLoading: true,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchSecureSubscription = async () => {
      console.log('🔍 useSubscription - teamLoading:', teamLoading, 'customTeamId:', customTeamId);

      // Attendre que le TeamContext ait fini de charger ET que customTeamId existe
      if (teamLoading || !customTeamId) {
        console.log('⏳ useSubscription - En attente du TeamContext...');
        if (!teamLoading && isMounted) {
          setData(prev => ({ ...prev, isLoading: false }));
        }
        return;
      }

      if (isMounted) {
        setData(prev => ({ ...prev, isLoading: true }));
      }

      try {
        // 1. Création explicite de la chaîne JSON pour éviter les bugs de parsing côté serveur
        const payloadString = JSON.stringify({ teamId: String(customTeamId) });
        console.log('📤 Payload string exact envoyé à la fonction:', payloadString);
        
        // 2. Appel de la fonction (le 2ème argument DOIT être une string)
        const execution = await functions.createExecution(
          GET_SUBSCRIPTION_FUNCTION_ID,
          payloadString 
        );

        if (!isMounted) return;

        console.log('📥 Réponse reçue - Status:', execution.responseStatusCode);
        console.log('📥 Réponse body:', execution.responseBody);

        if (execution.responseStatusCode === 200) {
          const responseData = JSON.parse(execution.responseBody);
          
          setData({
            planTier: responseData.planTier || 'free',
            status: responseData.status || 'none',
            subscriptionRenewsAt: responseData.subscriptionRenewsAt || null,
            isPro: Boolean(responseData.isPro),
            isBusiness: Boolean(responseData.isBusiness),
            isLoading: false,
          });
        } else {
          console.warn('⚠️ Échec de la vérification (Status:', execution.responseStatusCode, ') - Accès restreint (Fail-Closed)');
          setData({
            planTier: 'free',
            status: 'none',
            subscriptionRenewsAt: null,
            isPro: false,
            isBusiness: false,
            isLoading: false,
          });
        }
      } catch (err) {
        console.error('❌ Erreur réseau useSubscription:', err);
        if (isMounted) {
          // Fail-Closed en cas d'erreur réseau
          setData({
            planTier: 'free',
            status: 'none',
            subscriptionRenewsAt: null,
            isPro: false,
            isBusiness: false,
            isLoading: false,
          });
        }
      }
    };

    fetchSecureSubscription();

    return () => {
      isMounted = false;
    };
  }, [customTeamId, teamLoading]);

  return data;
};