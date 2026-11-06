// src/hooks/useSubscription.ts
import { useState, useEffect } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';
import { useTeam } from '../context/TeamContext';

export interface SubscriptionData {
  planTier: 'free' | 'starter' | 'pro' | 'enterprise';
  subscriptionStatus: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  subscriptionRenewsAt: string | null;
  isPro: boolean;
  isLoading: boolean;
}

export const useSubscription = (): SubscriptionData => {
  const { customTeamId } = useTeam();
  
  const [data, setData] = useState<SubscriptionData>({
    planTier: 'free',
    subscriptionStatus: 'none',
    subscriptionRenewsAt: null,
    isPro: false,
    isLoading: true,
  });

  useEffect(() => {
    if (!customTeamId) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const fetchSubscription = async () => {
      try {
        const response = await databases.listDocuments(
          DATABASE_ID,
          'company_settings',
          [
            Query.equal('teamId', customTeamId),
            Query.limit(1)
          ]
        );

        if (response.documents.length > 0) {
          const doc = response.documents[0] as any;
          const plan = doc.planTier || 'free';
          
          setData({
            planTier: plan,
            subscriptionStatus: doc.subscriptionStatus || 'none',
            subscriptionRenewsAt: doc.subscriptionRenewsAt || null,
            isPro: plan === 'pro' || plan === 'enterprise',
            isLoading: false,
          });
        } else {
          // Fallback si aucun document n'existe encore
          setData(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Erreur lors du chargement de l\'abonnement:', error);
        setData(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchSubscription();
  }, [customTeamId]);

  return data;
};