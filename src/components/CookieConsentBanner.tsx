// src/components/CookieConsentBanner.tsx
// 🍪 Bandeau cookies premium — conforme RGPD & Code numérique béninois
// Design moderne avec animations, glassmorphism et préférences détaillées
import { useState, useEffect } from 'react';
import {
  Cookie, Shield, BarChart3, Target, Settings,
  Check, X, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';

// ============================================================
// 🗂️ TYPES
// ============================================================
export type CookieCategory = 'necessary' | 'analytics' | 'marketing';

export interface CookiePreferences {
  necessary: boolean;      // Toujours true (non modifiable)
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
  version: string;
}

// ============================================================
// 🔧 CONSTANTES
// ============================================================
const CONSENT_KEY = 'relancepro_cookie_consent';
const CONSENT_VERSION = '2.0';

const DEFAULT_PREFERENCES: CookiePreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  timestamp: 0,
  version: CONSENT_VERSION,
};

// ============================================================
// 📚 DESCRIPTIONS DES CATÉGORIES
// ============================================================
const CATEGORIES = {
  necessary: {
    icon: Shield,
    title: 'Strictement nécessaires',
    description: 'Essentiels au fonctionnement de la plateforme (authentification, sécurité, préférences). Ils ne peuvent pas être désactivés.',
    color: 'emerald',
    count: 4,
    required: true,
  },
  analytics: {
    icon: BarChart3,
    title: 'Analyse et performance',
    description: 'Nous aident à comprendre comment vous utilisez la plateforme pour l\'améliorer (pages visitées, temps passé, erreurs).',
    color: 'blue',
    count: 3,
    required: false,
  },
  marketing: {
    icon: Target,
    title: 'Publicité et personnalisation',
    description: 'Permettent de vous proposer des contenus et offres adaptés à vos intérêts, sur notre plateforme et chez nos partenaires.',
    color: 'purple',
    count: 5,
    required: false,
  },
} as const;

// ============================================================
// 🎨 CLASSES DE COULEUR PAR CATÉGORIE
// ============================================================
const colorClasses = {
  emerald: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: 'text-emerald-600 dark:text-emerald-400',
    toggle: 'bg-emerald-500',
    badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  },
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-400',
    toggle: 'bg-blue-500',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-300',
    icon: 'text-purple-600 dark:text-purple-400',
    toggle: 'bg-purple-500',
    badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  },
} as const;

// ============================================================
// 🎯 HOOK DE GESTION DU CONSENTEMENT
// ============================================================
export function useCookieConsent() {
  const [preferences, setPreferences] = useState<CookiePreferences | null>(null);
  const [hasConsented, setHasConsented] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CookiePreferences;
        if (parsed.version === CONSENT_VERSION) {
          setPreferences(parsed);
          setHasConsented(true);
          applyConsent(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn('⚠️ Erreur lecture préférences cookies:', e);
    }
    setHasConsented(false);
  }, []);

  const savePreferences = (prefs: Omit<CookiePreferences, 'timestamp' | 'version'>) => {
    const fullPrefs: CookiePreferences = {
      ...prefs,
      necessary: true,
      timestamp: Date.now(),
      version: CONSENT_VERSION,
    };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(fullPrefs));
      setPreferences(fullPrefs);
      setHasConsented(true);
      applyConsent(fullPrefs);
      dispatchConsentEvent(fullPrefs);
    } catch (e) {
      console.error('❌ Erreur sauvegarde préférences:', e);
    }
  };

  const resetConsent = () => {
    localStorage.removeItem(CONSENT_KEY);
    setPreferences(null);
    setHasConsented(false);
  };

  return { preferences, hasConsented, savePreferences, resetConsent };
}

// Applique les préférences (désactive/active les scripts)
function applyConsent(prefs: CookiePreferences) {
  // Analytics
  if (prefs.analytics) {
    console.log('📊 Cookies analytics activés');
    // Ici : activer Google Analytics, Plausible, etc.
    // window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
  } else {
    console.log('📊 Cookies analytics désactivés');
    // window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  }

  // Marketing
  if (prefs.marketing) {
    console.log('🎯 Cookies marketing activés');
    // window.gtag?.('consent', 'update', { ad_storage: 'granted' });
  } else {
    console.log('🎯 Cookies marketing désactivés');
    // window.gtag?.('consent', 'update', { ad_storage: 'denied' });
  }
}

function dispatchConsentEvent(prefs: CookiePreferences) {
  window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: prefs }));
}

// ============================================================
// 🎨 COMPOSANT TOGGLE PREMIUM
// ============================================================
function PremiumToggle({
  enabled,
  onChange,
  disabled = false,
  color = 'purple',
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color?: 'emerald' | 'blue' | 'purple';
}) {
  const toggleColor = colorClasses[color].toggle;
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:shadow-md'
      } ${enabled ? toggleColor : 'bg-slate-300 dark:bg-slate-600'}`}
      aria-pressed={enabled}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-300 ease-in-out ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ============================================================
// 🎯 COMPOSANT PRINCIPAL : BANDEAU COOKIES
// ============================================================
export default function CookieConsentBanner() {
  const { preferences, hasConsented, savePreferences } = useCookieConsent();
  const [showPreferences, setShowPreferences] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [localPrefs, setLocalPrefs] = useState({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  // Animation d'entrée
  useEffect(() => {
    if (!hasConsented) {
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, [hasConsented]);

  if (hasConsented) return null;

  // ============================================================
  // HANDLERS
  // ============================================================
  const acceptAll = () => {
    savePreferences({ necessary: true, analytics: true, marketing: true });
  };

  const rejectAll = () => {
    savePreferences({ necessary: true, analytics: false, marketing: false });
  };

  const saveCustom = () => {
    savePreferences(localPrefs);
  };

  // ============================================================
  // 🎨 RENDU
  // ============================================================
  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[9998] bg-slate-900/40 backdrop-blur-sm transition-opacity duration-500 ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Bandeau principal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-title"
        className={`fixed bottom-0 left-0 right-0 z-[9999] transition-all duration-700 ease-out ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 pb-4 sm:pb-6">
          <div className="relative overflow-hidden rounded-3xl shadow-2xl border border-white/20 dark:border-slate-700/50">
            {/* Dégradé d'arrière-plan */}
            <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-purple-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-purple-950/20" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-400/10 dark:bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-400/10 dark:bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            <div className="relative p-6 sm:p-8">
              {/* En-tête */}
              <div className="flex items-start gap-4 mb-5">
                <div className="flex-shrink-0">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl blur-md opacity-50" />
                    <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
                      <Cookie className="text-white" size={24} />
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 id="cookie-title" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                      Votre vie privée compte
                    </h2>
                    <Sparkles size={16} className="text-purple-500" />
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Nous utilisons des cookies pour améliorer votre expérience, analyser le trafic et personnaliser le contenu.
                    Vous pouvez accepter, refuser ou personnaliser vos choix à tout moment.{' '}
                    <a
                      href="/privacy"
                      className="text-purple-600 dark:text-purple-400 hover:underline font-medium"
                    >
                      En savoir plus
                    </a>
                  </p>
                </div>
              </div>

              {/* Panneau de préférences (dépliant) */}
              <div
                className={`overflow-hidden transition-all duration-500 ease-in-out ${
                  showPreferences ? 'max-h-[500px] opacity-100 mb-5' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="space-y-3 pt-5 border-t border-slate-200/60 dark:border-slate-700/60">
                  {(Object.keys(CATEGORIES) as CookieCategory[]).map((category) => {
                    const config = CATEGORIES[category];
                    const colors = colorClasses[config.color];
                    const Icon = config.icon;
                    const isEnabled = localPrefs[category];

                    return (
                      <div
                        key={category}
                        className="flex items-start gap-4 p-4 rounded-2xl bg-white/60 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                      >
                        {/* Icône */}
                        <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center`}>
                          <Icon className={colors.icon} size={20} />
                        </div>

                        {/* Contenu */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                {config.title}
                              </h3>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                                {config.count} cookie{config.count > 1 ? 's' : ''}
                              </span>
                            </div>
                            <PremiumToggle
                              enabled={isEnabled}
                              onChange={(v) =>
                                setLocalPrefs((p) => ({ ...p, [category]: v }))
                              }
                              disabled={config.required}
                              color={config.color}
                            />
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {config.description}
                          </p>
                          {config.required && (
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                              <Shield size={10} />
                              Toujours actifs (obligatoires)
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Bouton personnaliser */}
                <button
                  onClick={() => setShowPreferences(!showPreferences)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all border border-slate-200 dark:border-slate-700"
                >
                  <Settings size={16} />
                  Personnaliser
                  {showPreferences ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <div className="flex flex-1 gap-2 sm:justify-end">
                  {/* Tout refuser */}
                  <button
                    onClick={rejectAll}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all border border-slate-200 dark:border-slate-700"
                  >
                    <X size={16} />
                    Tout refuser
                  </button>

                  {/* Tout accepter ou Enregistrer */}
                  {showPreferences ? (
                    <button
                      onClick={saveCustom}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 active:scale-95"
                    >
                      <Check size={16} />
                      Enregistrer mes choix
                    </button>
                  ) : (
                    <button
                      onClick={acceptAll}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 active:scale-95"
                    >
                      <Check size={16} />
                      Tout accepter
                    </button>
                  )}
                </div>
              </div>

              {/* Footer légal */}
             <p className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-500 text-center">
  🌍 Conforme à la législation applicable en matière de protection des données ·{' '}
  <a href="/privacy" className="hover:text-purple-600 dark:hover:text-purple-400 underline">
    Politique de confidentialité
  </a>
</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}