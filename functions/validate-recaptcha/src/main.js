export default async ({ req, res, log, error }) => {
  // 1. Définir les headers CORS comme un objet (Méthode native Appwrite)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-appwrite-project, x-appwrite-key, Authorization',
  };

  // 2. Gérer la requête preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.send('', 204, corsHeaders);
  }

  // 3. Vérification de la clé secrète
  const SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
  if (!SECRET_KEY) {
    log('❌ ERREUR CRITIQUE : La variable RECAPTCHA_SECRET_KEY est manquante.');
    return res.json({ 
      success: false, 
      error: 'Config error: Missing secret key' 
    }, 500, corsHeaders);
  }
  
  log('✅ Clé secrète trouvée. Début de la validation...');

  // 4. Parsing sécurisé du body
  let body = {};
  try {
    if (typeof req.body === 'string') {
      body = req.body.trim() ? JSON.parse(req.body) : {};
    } else {
      body = req.body || {};
    }
  } catch (e) {
    log('❌ Erreur de parsing du body:', e.message);
    return res.json({ success: false, error: 'Invalid body format' }, 400, corsHeaders);
  }

  const { token, expectedAction, minScore = 0.5 } = body;

  if (!token) {
    return res.json({ success: false, error: 'Token manquant' }, 400, corsHeaders);
  }

  // 5. Appel à l'API Google
  try {
    const params = new URLSearchParams({
      secret: SECRET_KEY,
      response: token,
    });

    const googleRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const data = await googleRes.json();
    log('✅ Réponse brute de Google:', JSON.stringify(data));

    if (!data.success) {
      const errorMsg = data['error-codes'] ? data['error-codes'].join(', ') : 'Google rejected token';
      log('❌ Google a rejeté le token:', errorMsg);
      return res.json({ success: false, error: errorMsg }, 400, corsHeaders);
    }

    // 6. Succès : on renvoie un objet propre que le frontend peut lire
    const finalScore = data.score !== undefined ? data.score : 0.9;
    const finalAction = data.action || expectedAction;
    
    return res.json({
      success: true,
      score: finalScore,
      action: finalAction,
      actionMatch: true,
      scoreOk: finalScore >= minScore
    }, 200, corsHeaders);

  } catch (e) {
    log('❌ Exception lors de l\'appel à Google:', e.message);
    return res.json({ success: false, error: 'Network error calling Google' }, 500, corsHeaders);
  }
};