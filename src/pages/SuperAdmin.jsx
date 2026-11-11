import { useEffect, useState } from 'react';
import { Client, Databases, Query, Functions } from 'appwrite';
import { toast } from 'sonner';
import { 
  Shield, RefreshCw, Users, Eye, 
  Loader2, X, CreditCard, Calendar, Mail, Hash, Ban, CheckCircle
} from 'lucide-react';

// Initialisation Appwrite autonome
const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io')
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || '');

const databases = new Databases(client);
const functions = new Functions(client);
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

export default function SuperAdmin() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  // Chargement des données
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
        Query.orderDesc('$createdAt'), 
        Query.limit(100)
      ]);
      setTeams(res.documents);
    } catch (error) {
      console.error("Erreur chargement:", error);
      toast.error(`Erreur lors du chargement : ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchData(); 
  }, []);

  // ✅ Action : Bannir une équipe
  const banTeam = async (docId) => {
    if (!window.confirm("⚠️ Êtes-vous sûr de vouloir bannir cette équipe ? L'accès sera immédiatement coupé.")) return;
    
    setActionLoading(docId);
    try {
      const team = teams.find(t => t.$id === docId);
      const teamId = team?.teamId;

      // 1. Bannir dans company_settings
      await databases.updateDocument(DATABASE_ID, 'company_settings', docId, {
        subscriptionStatus: 'banned'
      });

      // 2. Synchroniser la licence pour couper l'accès immédiatement
      if (teamId) {
        const licensesRes = await databases.listDocuments(DATABASE_ID, 'licenses', [
          Query.equal('teamId', teamId),
          Query.limit(1)
        ]);

        if (licensesRes.documents.length > 0) {
          await databases.updateDocument(DATABASE_ID, 'licenses', licensesRes.documents[0].$id, {
            status: 'banned'
          });
        } else {
          // Créer une licence bannie si elle n'existe pas
          await databases.createDocument(DATABASE_ID, 'licenses', 'unique()', {
            teamId: teamId,
            plan: 'business', // Plan forcé en mode test
            status: 'banned',
            startDate: new Date().toISOString(),
            expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          });
        }
      }

      toast.success("Équipe bannie avec succès");
      fetchData();
    } catch (error) {
      toast.error(`Erreur : ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // ✅ Action : Débannir une équipe
  const unbanTeam = async (docId) => {
    if (!window.confirm("✅ Voulez-vous réactiver cette équipe ?")) return;
    
    setActionLoading(docId);
    try {
      const team = teams.find(t => t.$id === docId);
      const teamId = team?.teamId;

      // 1. Réactiver dans company_settings
      await databases.updateDocument(DATABASE_ID, 'company_settings', docId, {
        subscriptionStatus: 'active'
      });

      // 2. Synchroniser la licence
      if (teamId) {
        const licensesRes = await databases.listDocuments(DATABASE_ID, 'licenses', [
          Query.equal('teamId', teamId),
          Query.limit(1)
        ]);

        if (licensesRes.documents.length > 0) {
          await databases.updateDocument(DATABASE_ID, 'licenses', licensesRes.documents[0].$id, {
            status: 'active'
          });
        }
      }

      toast.success("Équipe réactivée avec succès");
      fetchData();
    } catch (error) {
      toast.error(`Erreur : ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Action : Forcer la synchronisation Paddle
  const forcePaddleSync = async (team) => {
    if (!team.paddleSubscriptionId) {
      toast.error("Aucun ID d'abonnement Paddle trouvé pour cette équipe.");
      return;
    }
    if (!window.confirm(`Forcer la synchronisation Paddle pour l'abonnement ${team.paddleSubscriptionId} ?`)) return;
    
    setActionLoading(`sync_${team.$id}`);
    try {
      const payload = {
        subscriptionId: String(team.paddleSubscriptionId).trim(),
        teamId: String(team.teamId).trim()
      };
      
      await functions.createExecution('paddle-sync', JSON.stringify(payload));
      toast.success("Synchronisation Paddle réussie !");
      fetchData();
    } catch (error) {
      console.error("Erreur de synchronisation:", error);
      toast.error("Échec de la synchronisation. Vérifiez les logs Appwrite.");
    } finally {
      setActionLoading(null);
    }
  };

  // Helper pour le badge de statut
  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">Actif</span>;
      case 'trialing':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">En essai</span>;
      case 'banned':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">Banni</span>;
      case 'canceled':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-200/60">Annulé</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f1e9] p-4 sm:p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Shield size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Super Admin Dashboard</h1>
              <p className="text-sm text-slate-500">Gestion des équipes et des accès</p>
            </div>
          </div>
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Actualiser
          </button>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 flex-shrink-0 mt-0.5">
            <CheckCircle size={14} />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-900">Mode Test Actif</p>
            <p className="text-xs text-blue-700 mt-1">
              Toutes les équipes ont accès à toutes les fonctionnalités (plan "business" forcé). 
              Utilisez cette page uniquement pour bannir/débannir des équipes ou synchroniser Paddle.
            </p>
          </div>
        </div>

        {loading && teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 bg-white rounded-2xl border border-slate-200/60">
            <Loader2 className="animate-spin mb-3 text-indigo-600" size={32} />
            <p>Chargement des données...</p>
          </div>
        ) : (
          <>
            {/* ================= TABLE DES ÉQUIPES ================= */}
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Entreprise</th>
                      <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Statut</th>
                      <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Inscription</th>
                      <th className="px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teams.map((team) => (
                      <tr key={team.$id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-slate-900">{team.name || 'Sans nom'}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                            <Mail size={10} /> {team.email || 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {team.subscriptionStatus && getStatusBadge(team.subscriptionStatus)}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {new Date(team.$createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => setSelectedTeam(team)} 
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" 
                              title="Voir les détails"
                            >
                              <Eye size={16} />
                            </button>
                            
                            {team.paddleSubscriptionId && (
                              <button 
                                onClick={() => forcePaddleSync(team)} 
                                disabled={actionLoading === `sync_${team.$id}`}
                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50" 
                                title="Forcer la sync Paddle"
                              >
                                {actionLoading === `sync_${team.$id}` ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                              </button>
                            )}

                            {team.subscriptionStatus === 'banned' ? (
                              <button 
                                onClick={() => unbanTeam(team.$id)}
                                disabled={actionLoading === team.$id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <CheckCircle size={14} />
                                Réactiver
                              </button>
                            ) : (
                              <button 
                                onClick={() => banTeam(team.$id)}
                                disabled={actionLoading === team.$id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <Ban size={14} />
                                Bannir
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ================= MODALE DE DÉTAILS ================= */}
        {selectedTeam && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200/60 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold tracking-tight text-slate-950 flex items-center gap-2">
                  <Eye size={18} className="text-indigo-600" />
                  Détails de l'équipe
                </h3>
                <button 
                  onClick={() => setSelectedTeam(null)} 
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Hash size={16} className="text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">ID Appwrite</p>
                    <p className="text-sm font-mono text-slate-700 bg-slate-50 px-2 py-1 rounded mt-1">{selectedTeam.$id}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Users size={16} className="text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Team ID Custom</p>
                    <p className="text-sm font-mono text-slate-700 bg-slate-50 px-2 py-1 rounded mt-1">{selectedTeam.teamId || 'N/A'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail size={16} className="text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Email</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{selectedTeam.email || 'N/A'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CreditCard size={16} className="text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Abonnement Paddle</p>
                    <p className="text-sm font-mono text-slate-700 bg-slate-50 px-2 py-1 rounded mt-1">{selectedTeam.paddleSubscriptionId || 'Aucun'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar size={16} className="text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Prochaine facturation</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">
                      {selectedTeam.subscriptionRenewsAt 
                        ? new Date(selectedTeam.subscriptionRenewsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) 
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50/60 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setSelectedTeam(null)} 
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}