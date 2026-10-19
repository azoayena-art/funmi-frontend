import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setupAccountMappingsCollection } from '../utils/setupAccountMappings';
import { CheckCircle2, Loader2, AlertCircle, Database, Shield, BookOpen } from 'lucide-react';

interface SetupResult {
  name: string;
  message: string;
  success: boolean;
}

export default function SetupAttributes() {
  const navigate = useNavigate();
  const [results, setResults] = useState<SetupResult[]>([]);
  const [running, setRunning] = useState(false);

  const runSetup = async () => {
    setRunning(true);
    setResults([]);

    try {
      // Setup account_mappings
      const accountMappingsResult = await setupAccountMappingsCollection();
      setResults(prev => [...prev, {
        name: 'Collection account_mappings',
        message: accountMappingsResult.message,
        success: accountMappingsResult.success
      }]);

    } catch (error: any) {
      setResults(prev => [...prev, {
        name: 'Erreur générale',
        message: error.message,
        success: false
      }]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Database size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Setup de l'application</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Initialisation des collections et configurations</p>
            </div>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Shield size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 dark:text-blue-200">
            <strong>Sécurité :</strong> Cette page ne doit être accessible qu'aux administrateurs. 
            Les collections créées respectent le modèle multi-tenant avec permissions par équipe.
          </div>
        </div>

        {/* Collections à créer */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <BookOpen size={20} className="text-purple-600 dark:text-purple-400" />
            Collections à initialiser
          </h2>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <span className="text-purple-600 dark:text-purple-400">•</span>
              <span><strong>account_mappings</strong> — Plan Comptable Général personnalisé par équipe</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400">•</span>
              <span className="text-slate-400 italic">Autres collections (à venir)</span>
            </li>
          </ul>
        </div>

        {/* Bouton action */}
        <button
          onClick={runSetup}
          disabled={running}
          className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base font-semibold shadow-lg shadow-purple-500/20 mb-6"
        >
          {running ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Setup en cours...
            </>
          ) : (
            <>
              <Database size={20} />
              Lancer le setup
            </>
          )}
        </button>

        {/* Résultats */}
        {results.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
              Résultats
            </h3>
            {results.map((result, i) => (
              <div
                key={i}
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  result.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900'
                    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                }`}
              >
                {result.success ? (
                  <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={20} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">
                    {result.name}
                  </div>
                  <div className={`text-xs ${result.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                    {result.message}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions finales */}
        {results.length > 0 && results.every(r => r.success) && (
          <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                Setup terminé avec succès !
              </h3>
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-3">
              Toutes les collections ont été créées. Vous pouvez maintenant utiliser l'application normalement.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all text-sm font-medium"
            >
              Aller au tableau de bord →
            </button>
          </div>
        )}

        {/* Note sécurité */}
        <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl">
          <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <strong>⚠️ Important :</strong> Supprimez cette page de votre application après le premier setup, 
              ou restreignez son accès aux administrateurs uniquement.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}