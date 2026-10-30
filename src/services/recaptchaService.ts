
import { functions } from '../appwrite';
import { ExecutionMethod } from 'appwrite';

interface RecaptchaValidation {
  success: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  actionMatch?: boolean;
  scoreOk?: boolean;
  minScore?: number;
  error?: string;
}

export const validateRecaptchaToken = async (
  token: string,
  action: string,
  minScore: number = 0.5
): Promise<RecaptchaValidation> => {
  if (!token || !action) {
    return {
      success: false,
      error: 'Token ou action manquant',
    };
  }

  try {
    const execution = await functions.createExecution(
      'validate-recaptcha',
      JSON.stringify({
        token,
        expectedAction: action,
        minScore,
      }),
      false,
      '/',
      ExecutionMethod.POST
    );

    if (execution.responseStatusCode < 200 ||
        execution.responseStatusCode >= 300) {
      return {
        success: false,
        error: `Erreur serveur reCAPTCHA (${execution.responseStatusCode})`,
      };
    }

    let result: RecaptchaValidation;

    try {
      result = JSON.parse(execution.responseBody);
    } catch {
      return {
        success: false,
        error: 'Réponse JSON invalide de la fonction reCAPTCHA',
      };
    }

    return result;
  } catch (error) {
    console.error('Erreur appel fonction reCAPTCHA:', error);

    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : 'Erreur de communication avec Appwrite',
    };
  }
};
