// src/services/recaptchaService.ts
import { Client, Functions } from 'appwrite';

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

const functions = new Functions(client);

export interface RecaptchaValidationResult {
  success: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  error?: string;
  degraded?: boolean;
}

// ⚠️ ID de la fonction validate-recaptcha
const FUNCTION_ID = 'validate-recaptcha';

export async function validateRecaptchaToken(
  token: string,
  expectedAction: string,
  minScore: number = 0.5
): Promise<RecaptchaValidationResult> {
  if (!token || token.length < 20) {
    return { success: false, error: 'Token invalide' };
  }

  try {
    const response = await functions.createExecution(
      FUNCTION_ID,
      JSON.stringify({ token, expectedAction, minScore })
    );

    console.log('🔍 Réponse brute de la fonction:', {
      statusCode: response.statusCode,
      responseBody: response.responseBody,
      logs: response.logs,
      errors: response.errors,
    });

    // Cas 1 : La fonction a renvoyé une erreur HTTP
    if (response.statusCode >= 400) {
      console.warn(`⚠️ Fonction retournée avec code ${response.statusCode}`);
      console.warn('Erreurs:', response.errors);
      // Mode dégradé : on laisse passer avec avertissement
      return { success: true, degraded: true, error: `Function HTTP ${response.statusCode}` };
    }

    // Cas 2 : Parsing de la réponse
    let result: any;
    try {
      result = JSON.parse(response.responseBody || '{}');
    } catch {
      console.warn('⚠️ Réponse non-JSON de la fonction:', response.responseBody);
      return { success: true, degraded: true, error: 'Invalid JSON response' };
    }

    console.log('🛡️ Validation reCAPTCHA v3:', result);

    // Cas 3 : Réponse vide ou mal formée → mode dégradé
    if (!result || (result.success === undefined && result.action === undefined)) {
      console.warn('⚠️ Réponse vide de la fonction → mode dégradé');
      return { success: true, degraded: true, error: 'Empty function response' };
    }

    // Cas 4 : Échec explicite de Google (ex: invalid-input-secret)
    if (result.success === false && result.error) {
      console.error('❌ Erreur Google reCAPTCHA:', result.error);
      // Si c'est une erreur de config (pas de secret), on laisse passer en dev
      if (/secret|site/i.test(result.error)) {
        return { success: true, degraded: true, error: `Config error: ${result.error}` };
      }
      return { success: false, error: result.error };
    }

    // Cas 5 : Vérifications métier (action + score)
    if (result.action && result.action !== expectedAction) {
      return { success: false, error: `Action mismatch: ${result.action}` };
    }
    if (result.score !== undefined && result.score < minScore) {
      return {
        success: false,
        score: result.score,
        error: `Score trop faible (${result.score.toFixed(2)})`,
      };
    }

    return result;
  } catch (e: any) {
    console.error('❌ Erreur appel fonction:', e);

    // Mode dégradé si la fonction n'existe pas (404)
    const isMissing = e?.code === 404 || /not found|no function/i.test(e?.message || '');
    if (isMissing) {
      console.warn('⚠️ [MODE DÉGRADÉ] Fonction absente → validation ignorée');
      return { success: true, degraded: true, error: 'Function not found' };
    }

    return { success: false, error: e.message };
  }
}