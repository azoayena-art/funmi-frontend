// src/components/TreasuryDebug.tsx
import { useTreasury } from '../hooks/useTreasury';
import { useCompanySettings } from '../hooks/useCompanySettings';

export default function TreasuryDebug() {
  const { kpis, loading, error, totalLoaded } = useTreasury();
  const { fm } = useCompanySettings();

  if (loading) return <div className="p-4 text-slate-500"> Chargement trésorerie...</div>;
  if (error) return <div className="p-4 text-red-600">❌ Erreur : {error.message}</div>;

  return (
    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🧪</span>
        <h3 className="text-sm font-bold text-purple-900 dark:text-purple-200 uppercase tracking-wider">
          DEBUG TRÉSORERIE — {totalLoaded} paiement(s) chargé(s)
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Solde actuel</p>
          <p className={`text-xl font-bold tabular-nums ${kpis.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {fm(kpis.balance)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Flux du mois</p>
          <p className={`text-xl font-bold tabular-nums ${kpis.currentMonthNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {fm(kpis.currentMonthNet)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Total entrées</p>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{fm(kpis.balanceInflows)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Total sorties</p>
          <p className="text-xl font-bold tabular-nums text-red-600">{fm(kpis.balanceOutflows)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Par catégorie</p>
          <ul className="space-y-1 text-sm">
            {kpis.byCategory.length === 0 && <li className="text-slate-400 italic">Aucune donnée</li>}
            {kpis.byCategory.map(c => (
              <li key={c.category} className="flex justify-between">
                <span className="text-slate-700 dark:text-slate-300">{c.label} <span className="text-slate-400">({c.count})</span></span>
                <span className={c.type === 'in' ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {c.type === 'in' ? '+' : '-'}{fm(c.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Évolution 12 mois</p>
          <ul className="space-y-1 text-sm">
            {kpis.monthlyEvolution.slice(-6).map((m, i) => (
              <li key={i} className="flex justify-between">
                <span className="text-slate-700 dark:text-slate-300 capitalize">{m.month} {m.year}</span>
                <span className={m.net >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {fm(m.net)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}