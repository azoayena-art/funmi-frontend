// src/services/recaptchaService.ts

// 🚨 MODE TEST : On court-circuite l'appel réseau pour éviter l'erreur CORS
export const validateRecaptchaToken = async (
  token: string,
  action: string,
  minScore: number = 0.5
) => {
  console.warn('⚠️ [MODE TEST] reCAPTCHA validé automatiquement (CORS bypass)');
  
  // On retourne un succès simulé sans appeler Appwrite
  return {
    success: true,
    score: 0.9,
    action: action,
    actionMatch: true,
    scoreOk: true,
    minScore: minScore,
    degraded: false
  };

  /* 
  // --- ANCIEN CODE (mis en commentaire pour plus tard) ---
  // try {
  //   const response = await functions.createExecution(
  //     'validate-recaptcha',
  //     JSON.stringify({ token, expectedAction: action, minScore }),
  //     false,
  //     'POST'
  //   );
  //   return JSON.parse(response.responseBody);
  // } catch (error) {
  //   console.error('❌ Erreur appel fonction:', error);
  //   return { success: false, error: 'Failed to fetch' };
  // }
  */
};