export default async ({ req, res, log, error: logError }) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://funmi-frontend-g3nb.vercel.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-appwrite-project, x-appwrite-key',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') {
    return res.send('', 204, corsHeaders);
  }

  if (req.method !== 'POST') {
    return res.json(
      { success: false, error: 'Méthode non autorisée' },
      405,
      corsHeaders
    );
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    logError('Configuration RECAPTCHA_SECRET_KEY manquante.');
    return res.json(
      { success: false, error: 'Configuration serveur manquante' },
      500,
      corsHeaders
    );
  }

  let body;

  try {
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (req.bodyRaw) {
      body = JSON.parse(Buffer.from(req.bodyRaw).toString());
    } else {
      body = {};
    }
  } catch {
    return res.json(
      { success: false, error: 'Corps de requête invalide' },
      400,
      corsHeaders
    );
  }

  const { token, expectedAction, minScore = 0.5 } = body;

  const allowedActions = [
    'login',
    'register',
    'submit_form',
    'reset_password',
    'verify_email',
  ];

  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > 10000
  ) {
    return res.json(
      { success: false, error: 'Token invalide' },
      400,
      corsHeaders
    );
  }

  if (
    typeof expectedAction !== 'string' ||
    !allowedActions.includes(expectedAction)
  ) {
    return res.json(
      { success: false, error: 'Action invalide' },
      400,
      corsHeaders
    );
  }

  if (
    typeof minScore !== 'number' ||
    !Number.isFinite(minScore) ||
    minScore < 0 ||
    minScore > 1
  ) {
    return res.json(
      { success: false, error: 'Score minimum invalide' },
      400,
      corsHeaders
    );
  }

  try {
    const params = new URLSearchParams({
      secret: secretKey,
      response: token,
    });

    const verifyResponse = await fetch(
      'https://www.google.com/recaptcha/api/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      }
    );

    if (!verifyResponse.ok) {
      logError('Erreur HTTP lors de la vérification Google.');
      return res.json(
        { success: false, error: 'Service de vérification indisponible' },
        502,
        corsHeaders
      );
    }

    const data = await verifyResponse.json();

    if (!data.success) {
      return res.json(
        {
          success: false,
          error: 'Token reCAPTCHA rejeté',
          errorCodes: data['error-codes'] || [],
        },
        200,
        corsHeaders
      );
    }

    const actionMatch = data.action === expectedAction;

    const score =
      typeof data.score === 'number' && Number.isFinite(data.score)
        ? data.score
        : null;

    const hostnameMatch =
      data.hostname === 'funmi-frontend-g3nb.vercel.app';

    const scoreOk = score !== null && score >= minScore;

    const result = {
      success: actionMatch && hostnameMatch && scoreOk,
      score,
      action: data.action,
      hostname: data.hostname,
      actionMatch,
      hostnameMatch,
      scoreOk,
      minScore,
    };

    log('Validation reCAPTCHA terminée.');

    return res.json(result, 200, corsHeaders);
  } catch (e) {
    logError('Erreur lors de la vérification reCAPTCHA.');

    return res.json(
      { success: false, error: 'Échec de la vérification reCAPTCHA' },
      500,
      corsHeaders
    );
  }
};