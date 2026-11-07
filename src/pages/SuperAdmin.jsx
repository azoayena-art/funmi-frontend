import { useEffect, useState } from 'react';
import { Client, Databases, Query, Functions } from 'appwrite';

// Initialisation Appwrite autonome
const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io')
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || '');

const databases = new Databases(client);
const functions = new Functions(client);
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';
const FUNCTION_ID_SYNC = 'paddle-sync'; // ID de la fonction que nous allons créer

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('teams'); // 'teams' ou 'plans'
  const [teams, setTeams] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null); // Pour la modale de détails

  // Chargement des données
  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'teams') {
        const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.orderDesc('$createdAt'), Query.limit(100)]);
        setTeams(res.documents);
      } else {
        const res = await databases.listDocuments(DATABASE_ID, 'plans', [Query.orderAsc('price')]);
        setPlans(res.documents);
      }
    } catch (error) {
      console.error("Erreur chargement:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  // Action : Changer le plan
  const updatePlan = async (docId, newPlan, newStatus) => {
    setActionLoading(docId);
    try {
      await databases.updateDocument(DATABASE_ID, 'company_settings', docId, {
        planTier: newPlan,
        subscriptionStatus: newStatus,
        paddleSubscriptionId: newPlan === 'free' ? null : undefined,
        subscriptionRenewsAt: newPlan === 'free' ? null : undefined
      });
      fetchData();
    } catch (error) {
      alert("Erreur : " + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Action : Bannir
  const banTeam = async (docId) => {
    if (!window.confirm("⚠️ Bannir cette équipe ? L'accès sera immédiatement coupé.")) return;
    setActionLoading(docId);
    try {
      await databases.updateDocument(DATABASE_ID, 'company_settings', docId, {
        subscriptionStatus: 'banned',
        planTier: 'free'
      });
      fetchData();
    } catch (error) {
      alert("Erreur : " + error.message);
    } finally {
      setActionLoading(null);
    }
  };

   // Action : Forcer la synchronisation Paddle
  const forcePaddleSync = async (team) => {
    console.log("🔍 OBJET TEAM COMPLET:", team); // <-- AJOUTÉ : Pour voir ce qu'on envoie dans la console du navigateur (F12)
    
    if (!team.paddleSubscriptionId) {
      alert("⚠️ Aucun ID d'abonnement Paddle trouvé pour cette équipe.");
      return;
    }
    if (!window.confirm(`Forcer la synchronisation Paddle pour l'abonnement ${team.paddleSubscriptionId} ?`)) return;
    
    setActionLoading(`sync_${team.$id}`);
    try {
      // Nettoyage agressif des données pour éviter les espaces invisibles
      const payload = {
        subscriptionId: String(team.paddleSubscriptionId).trim(),
        teamId: String(team.teamId).trim()
      };
      
      console.log("📦 PAYLOAD ENVOYÉ À LA FONCTION:", payload); // <-- AJOUTÉ

      await functions.createExecution(
        'paddle-sync', // Assure-toi que c'est bien l'ID ou le nom de ta fonction
        JSON.stringify(payload)
      );
      
      alert("✅ Synchronisation Paddle réussie ! Les données ont été mises à jour.");
      fetchData();
    } catch (error) {
      console.error("❌ Erreur de synchronisation:", error);
      alert("❌ Échec de la synchronisation. Vérifiez la console (F12) et les logs Appwrite.");
    } finally {
      setActionLoading(null);
    }
  };


  // Action : Modifier un plan tarifaire
  const updatePlanDetails = async (planDocId, updates) => {
    setActionLoading(`plan_${planDocId}`);
    try {
      await databases.updateDocument(DATABASE_ID, 'plans', planDocId, updates);
      fetchData();
      alert("✅ Plan mis à jour avec succès.");
    } catch (error) {
      alert("Erreur : " + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* En-tête */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🛡️ Super Admin Dashboard</h1>
          <button onClick={fetchData} className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-md shadow-sm text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700">
            🔄 Rafraîchir
          </button>
        </div>

        {/* Onglets */}
        <div className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-slate-700">
          <button onClick={() => setActiveTab('teams')} className={`pb-2 px-4 text-sm font-medium ${activeTab === 'teams' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-500'}`}>
            👥 Gestion des Équipes
          </button>
          <button onClick={() => setActiveTab('plans')} className={`pb-2 px-4 text-sm font-medium ${activeTab === 'plans' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-500'}`}>
            💰 Plans Tarifaires
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-500">Chargement des données...</div>
        ) : (
          <>
            {/* ================= ONGLET ÉQUIPES ================= */}
            {activeTab === 'teams' && (
              <div className="bg-white dark:bg-slate-800 shadow overflow-hidden sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                  <thead className="bg-gray-50 dark:bg-slate-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Entreprise</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Plan & Statut</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Inscription</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {teams.map((team) => (
                      <tr key={team.$id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{team.name || 'Sans nom'}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{team.email || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${team.planTier === 'pro' ? 'bg-green-100 text-green-800' : team.planTier === 'business' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                            {team.planTier?.toUpperCase() || 'FREE'}
                          </span>
                          <div className="text-xs text-gray-500 mt-1">{team.subscriptionStatus}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {new Date(team.$createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                          {/* Bouton Détails */}
                          <button onClick={() => setSelectedTeam(team)} className="text-blue-600 hover:text-blue-900" title="Voir les détails">👁️</button>
                          
                          {/* Bouton Sync Paddle */}
                          {team.paddleSubscriptionId && (
                            <button 
                              onClick={() => forcePaddleSync(team)} 
                              disabled={actionLoading === `sync_${team.$id}`}
                              className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50" 
                              title="Forcer la sync avec Paddle"
                            >
                              {actionLoading === `sync_${team.$id}` ? '⏳' : '🔄 Sync'}
                            </button>
                          )}

                          {/* Menu déroulant Actions */}
                          <select 
                            className="border rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600"
                            onChange={(e) => {
                              if (e.target.value === 'ban') banTeam(team.$id);
                              else if (e.target.value === 'pro') updatePlan(team.$id, 'pro', 'active');
                              else if (e.target.value === 'free') updatePlan(team.$id, 'free', 'none');
                              e.target.value = '';
                            }}
                            disabled={actionLoading === team.$id}
                          >
                            <option value="">⚙️ Actions...</option>
                            <option value="pro">Passer en Pro</option>
                            <option value="free">Passer en Free</option>
                            <option value="ban" className="text-red-600">🚫 Bannir</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ================= ONGLET PLANS ================= */}
            {activeTab === 'plans' && (
              <div className="bg-white dark:bg-slate-800 shadow overflow-hidden sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                  <thead className="bg-gray-50 dark:bg-slate-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Nom du Plan</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Prix (centimes)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Paddle ID (Mensuel)</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {plans.map((plan) => (
                      <tr key={plan.$id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{plan.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{plan.price} cts</td>
                        <td className="px-6 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">{plan.paddlePriceIdMonthly || 'N/A'}</td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => {
                              const newId = prompt("Nouvel ID Paddle Mensuel :", plan.paddlePriceIdMonthly);
                              if (newId !== null) updatePlanDetails(plan.$id, { paddlePriceIdMonthly: newId });
                            }}
                            className="text-purple-600 hover:text-purple-900 text-sm font-medium"
                          >
                            ✏️ Modifier ID Paddle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ================= MODALE DE DÉTAILS ================= */}
        {selectedTeam && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold mb-4 dark:text-white">Détails de l'équipe</h3>
              <div className="space-y-3 text-sm">
                <p><strong>ID Appwrite :</strong> <span className="font-mono text-xs">{selectedTeam.$id}</span></p>
                <p><strong>Team ID Custom :</strong> <span className="font-mono text-xs">{selectedTeam.teamId}</span></p>
                <p><strong>Email :</strong> {selectedTeam.email || 'N/A'}</p>
                <p><strong>ID Abonnement Paddle :</strong> <span className="font-mono text-xs">{selectedTeam.paddleSubscriptionId || 'Aucun'}</span></p>
                <p><strong>ID Client Paddle :</strong> <span className="font-mono text-xs">{selectedTeam.paddleCustomerId || 'Aucun'}</span></p>
                <p><strong>Prochaine facturation :</strong> {selectedTeam.subscriptionRenewsAt ? new Date(selectedTeam.subscriptionRenewsAt).toLocaleDateString('fr-FR') : 'N/A'}</p>
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={() => setSelectedTeam(null)} className="px-4 py-2 bg-gray-200 dark:bg-slate-700 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-slate-600">Fermer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}