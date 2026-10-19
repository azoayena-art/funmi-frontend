// functions/validate-recaptcha/src/main.js
export default async ({ req, res, log, error: logError }) => {
  log('=== Début validation reCAPTCHA v3 ===');
  log('Headers:', JSON.stringify(req.headers));
  log('Method:', req.method);
  log('Raw body type:', typeof req.body);
  log('Raw body:', typeof req.body === 'string' ? req.body.substring(0, 200) : JSON.stringify(req.body));

  const SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
  if (!SECRET_KEY) {
    logError('❌ RECAPTCHA_SECRET_KEY manquante !');
    return res.json({
      success: false,
      error: 'Secret key not configured',
      debug: 'Missing RECAPTCHA_SECRET_KEY env var',
    }, 500);
  }
  log('✅ Secret key présente:', SECRET_KEY.substring(0, 10) + '...');

  // Parsing robuste du body (Appwrite peut l'envoyer en string ou objet)
  let body = {};
  try {
    if (typeof req.body === 'string') {
      body = req.body.trim() ? JSON.parse(req.body) : {};
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (req.bodyRaw) {
      body = JSON.parse(Buffer.from(req.bodyRaw).toString());
    }
  } catch (e) {
    logError('❌ Erreur parsing body:', e.message);
    return res.json({ success: false, error: 'Invalid body: ' + e.message }, 400);
  }

  log('Body parsé:', JSON.stringify(body));

  const { token, expectedAction, minScore = 0.5 } = body;

  if (!token) {
    return res.json({ success: false, error: 'Token manquant dans le body' }, 400);
  }

  log('🔄 Appel Google siteverify pour action:', expectedAction);

  try {
    const params = new URLSearchParams({
      secret: SECRET_KEY,
      response: token,
    });

    const verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    log('Google HTTP status:', verifyResponse.status);

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      logError('❌ Erreur HTTP Google:', errorText);
      return res.json({
        success: false,
        error: `Google HTTP ${verifyResponse.status}`,
        details: errorText,
      }, 502);
    }

    const data = await verifyResponse.json();
    log('✅ Réponse Google:', JSON.stringify(data));

    if (!data.success) {
      logError('❌ Google a rejeté le token:', data['error-codes']);
      return res.json({
        success: false,
        error: (data['error-codes'] || []).join(', '),
        errorCodes: data['error-codes'],
      });
    }

    // Calcul du résultat
    const actionMatch = !expectedAction || data.action === expectedAction;
    const score = data.score ?? 1.0;
    const scoreOk = score >= minScore;

    const result = {
      success: actionMatch && scoreOk,
      score,
      action: data.action,
      hostname: data.hostname,
      challengeTs: data.challenge_ts,
      actionMatch,
      scoreOk,
      minScore,
    };

    log('✅ Résultat final:', JSON.stringify(result));
    return res.json(result);
  } catch (e) {
    logError('❌ Exception lors de la vérification:', e.message);
    return res.json({
      success: false,
      error: e.message,
      stack: e.stack,
    }, 500);
  }
};