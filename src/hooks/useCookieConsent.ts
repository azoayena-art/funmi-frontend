// src/hooks/useCookieConsent.ts
// Gestion du consentement aux cookies conforme RGPD

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// 📋 TYPES
// ============================================================

export interface CookiePreferences {
  essential: boolean;      // Toujours true (obligatoires)
  analytics: boolean;      // Google Analytics, Plausible, etc.
  marketing: boolean;      // Pixels publicitaires
  functional: boolean;     // Préférences utilisateur (langue, thème)
}

export interface CookieConsentState {
  hasConsented: boolean;
  consentDate: string | null;
  preferences: CookiePreferences;
  version: string;
}

export type ConsentLevel = 'all' | 'essential' | 'custom';

const STORAGE_KEY = 'funmi_cookie_consent';
const CONSENT_VERSION = '1.0'; // Incrémenter si la politique change

// ============================================================
// 🎯 VALEURS PAR DÉFAUT
// ============================================================

const DEFAULT_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
  functional: true,
};

const DEFAULT_STATE: CookieConsentState = {
  hasConsented: false,
  consentDate: null,
  preferences: DEFAULT_PREFERENCES,
  version: CONSENT_VERSION,
};

// ============================================================
// 🔧 HELPERS
// ============================================================

const loadConsent = (): CookieConsentState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_STATE;
    
    const parsed = JSON.parse(stored) as CookieConsentState;
    
    // Si la version a changé, redemander le consentement
    if (parsed.version !== CONSENT_VERSION) {
      return DEFAULT_STATE;
    }
    
    return parsed;
  } catch (e) {
    console.warn('⚠️ Erreur lecture consentement cookies:', e);
    return DEFAULT_STATE;
  }
};

const saveConsent = (state: CookieConsentState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Émettre un événement pour notifier les autres composants
    window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: state }));
  } catch (e) {
    console.warn('⚠️ Erreur sauvegarde consentement cookies:', e);
  }
};

// ============================================================
// 🎯 HOOK PRINCIPAL
// ============================================================

export function useCookieConsent() {
  const [state, setState] = useState<CookieConsentState>(loadConsent);
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [tempPreferences, setTempPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);

  // Afficher la bannière si pas encore consenti
  useEffect(() => {
    if (!state.hasConsented) {
      // Délai pour laisser la page se charger
      const timer = setTimeout(() => setShowBanner(true), 800);
      return () => clearTimeout(timer);
    }
  }, [state.hasConsented]);

  // Appliquer les préférences (charger/décharger les scripts)
  const applyPreferences = useCallback((prefs: CookiePreferences) => {
    // 🟢 Cookies essentiels : toujours actifs
    // (pas besoin d'action, ils sont nécessaires au fonctionnement)

    // 📊 Analytics
    if (prefs.analytics) {
      // TODO : Charger votre script analytics ici
      // Exemple : chargerGoogleAnalytics();
      console.log('📊 Cookies analytics activés');
    } else {
      // Supprimer les cookies analytics existants
      deleteCookie('_ga');
      deleteCookie('_gid');
      deleteCookie('_gat');
      console.log('📊 Cookies analytics désactivés');
    }

    // 📢 Marketing
    if (prefs.marketing) {
      // TODO : Charger vos pixels marketing ici
      console.log('📢 Cookies marketing activés');
    } else {
      deleteCookie('_fbp');
      deleteCookie('_gcl_au');
      console.log('📢 Cookies marketing désactivés');
    }

    // ⚙️ Fonctionnels
    if (!prefs.functional) {
      deleteCookie('funmi_theme');
      deleteCookie('funmi_language');
    }
  }, []);

  // ============================================================
  // ✅ ACTIONS
  // ============================================================

  /** Accepter tous les cookies */
  const acceptAll = useCallback(() => {
    const allAccepted: CookiePreferences = {
      essential: true,
      analytics: true,
      marketing: true,
      functional: true,
    };
    
    const newState: CookieConsentState = {
      hasConsented: true,
      consentDate: new Date().toISOString(),
      preferences: allAccepted,
      version: CONSENT_VERSION,
    };
    
    setState(newState);
    saveConsent(newState);
    applyPreferences(allAccepted);
    setShowBanner(false);
  }, [applyPreferences]);

  /** Refuser tous les cookies non essentiels */
  const rejectAll = useCallback(() => {
    const onlyEssential: CookiePreferences = {
      essential: true,
      analytics: false,
      marketing: false,
      functional: false,
    };
    
    const newState: CookieConsentState = {
      hasConsented: true,
      consentDate: new Date().toISOString(),
      preferences: onlyEssential,
      version: CONSENT_VERSION,
    };
    
    setState(newState);
    saveConsent(newState);
    applyPreferences(onlyEssential);
    setShowBanner(false);
  }, [applyPreferences]);

  /** Accepter uniquement les essentiels */
  const acceptEssentialOnly = useCallback(() => {
    const essentialOnly: CookiePreferences = {
      essential: true,
      analytics: false,
      marketing: false,
      functional: true,
    };
    
    const newState: CookieConsentState = {
      hasConsented: true,
      consentDate: new Date().toISOString(),
      preferences: essentialOnly,
      version: CONSENT_VERSION,
    };
    
    setState(newState);
    saveConsent(newState);
    applyPreferences(essentialOnly);
    setShowBanner(false);
  }, [applyPreferences]);

  /** Sauvegarder les préférences personnalisées */
  const saveCustomPreferences = useCallback(() => {
    const newState: CookieConsentState = {
      hasConsented: true,
      consentDate: new Date().toISOString(),
      preferences: tempPreferences,
      version: CONSENT_VERSION,
    };
    
    setState(newState);
    saveConsent(newState);
    applyPreferences(tempPreferences);
    setShowBanner(false);
    setShowPreferences(false);
  }, [tempPreferences, applyPreferences]);

  /** Ouvrir le panneau de préférences */
  const openPreferences = useCallback(() => {
    setTempPreferences(state.preferences);
    setShowPreferences(true);
  }, [state.preferences]);

  /** Modifier le consentement (accessible depuis les paramètres) */
  const changeConsent = useCallback(() => {
  window.dispatchEvent(new CustomEvent('cookie-consent-open-preferences'));
    setTempPreferences(state.preferences);
    setShowBanner(true);
    setShowPreferences(true);
  }, [state.preferences]);

  /** Réinitialiser le consentement */
  const resetConsent = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(DEFAULT_STATE);
    setShowBanner(true);
  }, []);

  return {
    // États
    hasConsented: state.hasConsented,
    consentDate: state.consentDate,
    preferences: state.preferences,
    showBanner,
    showPreferences,
    tempPreferences,
    
    // Setters
    setShowBanner,
    setShowPreferences,
    setTempPreferences,
    
    // Actions
    acceptAll,
    rejectAll,
    acceptEssentialOnly,
    saveCustomPreferences,
    openPreferences,
    changeConsent,
    resetConsent,
  };
}

// ============================================================
// 🗑️ HELPER : Supprimer un cookie
// ============================================================

function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}