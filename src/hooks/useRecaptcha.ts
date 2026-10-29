// src/hooks/useRecaptcha.ts
import { useCallback } from 'react';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { toast } from 'sonner';

export type RecaptchaAction = 'login' | 'register' | 'submit_form' | 'reset_password';

export function useRecaptcha() {
  // Peut être undefined si le Provider n'est pas présent
  const recaptcha = useGoogleReCaptcha();
  const executeRecaptcha = recaptcha?.executeRecaptcha;

  const getToken = useCallback(async (action: RecaptchaAction): Promise<string | null> => {
    // ⏳ Attente avec retry (max 5 tentatives)
    let attempts = 0;
    const MAX_ATTEMPTS = 5;
    
    while (!executeRecaptcha && attempts < MAX_ATTEMPTS) {
      console.warn(`⚠️ reCAPTCHA v3 pas prêt, tentative ${attempts + 1}/${MAX_ATTEMPTS}...`);
      await new Promise(r => setTimeout(r, 800));
      attempts++;
      
      // Relire le contexte (cas où le script charge entre-temps)
      if (recaptcha?.executeRecaptcha) break;
    }

    const executor = recaptcha?.executeRecaptcha;
    if (!executor) {
      console.error('❌ GoogleReCaptchaProvider non trouvé dans l\'arborescence React');
      console.error('💡 Vérifiez que <App /> est enveloppé dans <GoogleReCaptchaProvider> dans src/main.tsx');
      toast.error('Protection anti-bot indisponible', {
        description: 'Configuration manquante. Contactez le support.',
      });
      return null;
    }

    try {
      const token = await executor(action);
      console.log(`🛡️ Token reCAPTCHA v3 généré pour action "${action}"`);
      return token;
    } catch (e) {
      console.error('❌ Erreur génération token v3:', e);
      toast.error('Erreur de vérification anti-bot');
      return null;
    }
  }, [executeRecaptcha, recaptcha]);

  return { getToken };
}