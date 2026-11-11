// src/hooks/useLivePlans.ts
import { useState, useEffect } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';
import { DEFAULT_PLANS } from '../data/plansConfig';

export function useLivePlans() {
  const [plans, setPlans] = useState(DEFAULT_PLANS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLivePrices = async () => {
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'plans', [Query.limit(100)]);
        
        // Fusionne la config par défaut avec les données en direct de la BDD
        const updatedPlans = DEFAULT_PLANS.map(defaultPlan => {
          // On cherche le plan en BDD par son nom (en minuscule pour être sûr)
          const dbPlan = res.documents.find(
            doc => doc.name.toLowerCase() === defaultPlan.id || doc.name.toLowerCase() === defaultPlan.name.toLowerCase()
          );
          
          if (dbPlan) {
            return {
              ...defaultPlan,
              // Si la BDD a un prix, on le prend, sinon on garde la config. 
              // (On divise par 100 si ton prix en BDD est en centimes)
              monthlyPrice: dbPlan.monthlyPrice !== undefined ? dbPlan.monthlyPrice : (dbPlan.price ? dbPlan.price / 100 : defaultPlan.monthlyPrice),
              yearlyPrice: dbPlan.yearlyPrice !== undefined ? dbPlan.yearlyPrice : defaultPlan.yearlyPrice,
              priceIdMonthly: dbPlan.paddlePriceIdMonthly || defaultPlan.priceIdMonthly,
              priceIdYearly: dbPlan.paddlePriceIdYearly || defaultPlan.priceIdYearly,
            };
          }
          return defaultPlan;
        });
        
        setPlans(updatedPlans);
      } catch (error) {
        console.error("Erreur chargement des plans en direct:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchLivePrices();
  }, []);

  return { plans, loading };
}