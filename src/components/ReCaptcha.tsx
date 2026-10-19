// src/components/ReCaptcha.tsx
// ✅ Version propre - un seul composant, détection dark mode automatique
import { useEffect, useState } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';

interface ReCaptchaBoxProps {
  onChange: (token: string | null) => void;
  siteKey?: string;
}

export default function ReCaptchaBox({ onChange, siteKey }: ReCaptchaBoxProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 🔑 Priorité : prop > env var > clé par défaut (votre nouvelle clé)
  const SITE_KEY =
    siteKey ||
    import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
    '6Le1CPUtAAAAAPeWEPGZHdQd5NU0d08-ASeQ9EQw';

  // 🌓 Détection automatique du thème (dark mode)
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // 🔍 Log de diagnostic au montage
  useEffect(() => {
    if (!SITE_KEY || SITE_KEY.length < 20) {
      console.error('❌ reCAPTCHA : Clé Site Key invalide ou manquante');
    } else {
      console.log('✅ reCAPTCHA : Clé chargée', SITE_KEY.substring(0, 12) + '...');
    }
  }, [SITE_KEY]);

  // ⚠️ Fallback si clé manquante
  if (!SITE_KEY) {
    return (
      <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-xs text-red-700 dark:text-red-300">
          ⚠️ reCAPTCHA non configuré. Contactez l'administrateur.
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-center my-4">
      <ReCAPTCHA
        sitekey={SITE_KEY}
        onChange={onChange}
        onExpired={() => {
          console.log('⏰ reCAPTCHA expiré');
          onChange(null);
        }}
        onError={(err) => {
          console.error('❌ Erreur reCAPTCHA:', err);
          onChange(null);
        }}
        theme={isDarkMode ? 'dark' : 'light'}
        // Type Checkbox v2 — compatible avec votre clé
      />
    </div>
  );
}