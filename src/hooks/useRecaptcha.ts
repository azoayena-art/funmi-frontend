import { useEffect, useState } from 'react';

export const useRecaptcha = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkReady = () => {
      if (typeof window !== 'undefined' && (window as any).grecaptcha) {
        setIsReady(true);
      }
    };
    
    checkReady();
    const interval = setInterval(checkReady, 100);
    const timeout = setTimeout(() => clearInterval(interval), 3000); // Arrête de vérifier après 3s
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  const getToken = async (action: string): Promise<string | null> => {
    try {
      const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
      
      // 🛡️ SÉCURITÉ : Si la clé est manquante ou reCAPTCHA n'est pas prêt, on ne plante pas
      if (!siteKey || !isReady || !(window as any).grecaptcha) {
        console.warn('⚠️ reCAPTCHA non configuré ou non prêt. Mode dégradé activé.');
        return 'degraded_mode_token_' + Date.now();
      }

      const token = await (window as any).grecaptcha.execute(siteKey, { action });
      return token;
    } catch (error) {
      // 🛡️ CRUCIAL : On capture l'erreur pour EMPÊCHER la page blanche
      console.error('❌ Erreur reCAPTCHA (mode dégradé activé pour éviter le crash) :', error);
      return 'degraded_mode_token_' + Date.now();
    }
  };

  return { getToken, isReady };
};