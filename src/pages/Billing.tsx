// src/pages/Billing.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { Query, Models } from 'appwrite';
import { 
  CreditCard, CheckCircle, AlertCircle, Calendar, 
  ArrowRight, Shield, Loader2, Receipt 
} from 'lucide-react';
import Sidebar from '../components/Sidebar';

interface LicenceDoc extends Models.Document {
  status: 'active' | 'canceled' | 'paused' | 'expired';
  startDate: string;
  expirationDate: string;
  plan: string; // ID du plan
  teamId: string;
}

interface PlanDoc extends Models.Document {
  name: string;
  price: number;
}

export default function Billing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { customTeamId } = useTeam();

  const [licence, setLicence] = useState<LicenceDoc | null>(null);
  const [planDetails, setPlanDetails] = useState<PlanDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBillingData = async () => {
      if (!customTeamId) {
        setLoading(false);
        return;
      }

      try {
        // 1. Récupérer la licence active de l'équipe (✅ ID corrigé : 'licenses')
        const licenceRes = await databases.listDocuments<LicenceDoc>(
          DATABASE_ID,
          'licenses', 
          [
            Query.equal('teamId', customTeamId),
            Query.equal('status', 'active'),
            Query.limit(1)
          ]
        );

        if (licenceRes.documents.length > 0) {
          const activeLicence = licenceRes.documents[0];
          setLicence(activeLicence);

          // 2. Récupérer les détails du plan associé (✅ ID corrigé : 'plans')
          if (activeLicence.plan) {
            const planRes = await databases.getDocument<PlanDoc>(
              DATABASE_ID,
              'plans',
              activeLicence.plan
            );
            setPlanDetails(planRes);
          }
        }
      } catch (error) {
        console.error('Erreur lors du chargement des données de facturation:', error);
        // En cas d'erreur de permission ou autre, on considère qu'il n'y a pas de licence active
      } finally {
        setLoading(false);
      }
    };

    fetchBillingData();
  }, [customTeamId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle size={14} /> Actif
          </span>
        );
      case 'canceled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <AlertCircle size={14} /> Annulé
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Calendar size={14} /> En pause
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
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
                        {planDetails ? planDetails.name : 'Starter (Gratuit)'}
                      </h2>
                      {licence && getStatusBadge(licence.status)}
                    </div>
                  </div>

                  {planDetails ? (
                    <div className="flex flex-wrap gap-6 text-sm text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <Receipt size={16} className="text-slate-400" />
                        <span>{planDetails.price}€ / mois</span>
                      </div>
                      {licence?.expirationDate && (
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-slate-400" />
                          <span>
                            Prochain renouvellement : {new Date(licence.expirationDate).toLocaleDateString('fr-FR')}
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
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 lg:pl-6 lg:border-l border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => navigate('/pricing')}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
                  >
                    {planDetails ? 'Changer de plan' : 'Passer au Pro'}
                    <ArrowRight size={16} />
                  </button>
                  
                  {planDetails && (
                    <button
                      onClick={() => {
                        // TODO: Intégrer l'URL du Portail Client Paddle ici quand disponible
                        alert('Le portail de gestion Paddle sera bientôt disponible. Vous pouvez changer de plan via le bouton ci-dessus.');
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
                {planDetails 
                  ? "Votre abonnement sera renouvelé automatiquement à la date indiquée. Vous pouvez l'annuler à tout moment sans frais supplémentaires."
                  : "Aucune carte bancaire n'est requise pour le plan gratuit."}
              </p>
            </div>
          </div>

          {/* Section Historique (Placeholder pour le futur) */}
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