
export default async ({ req, res, log, error }) => {
  try {
    const userId = req.headers['x-appwrite-user-id'];
    log('1. UserID detected: ' + (userId || 'None'));

    let endpoint = (
      process.env.APPWRITE_ENDPOINT ||
      'https://fra.cloud.appwrite.io/v1'
    ).trim().replace(/\/+$/, '');

    if (!endpoint.endsWith('/v1')) {
      endpoint += '/v1';
    }

    const projectId = process.env.APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    const databaseId = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';

    if (!projectId || !apiKey || !databaseId) {
      throw new Error('Configuration Appwrite manquante');
    }

    let payload = req.body;

    if (typeof payload === 'string') {
      payload = JSON.parse(payload);
    }

    if (!payload && req.payload) {
      payload = typeof req.payload === 'string'
        ? JSON.parse(req.payload)
        : req.payload;
    }

    const teamId = String(payload?.teamId || '').trim();

    log('2. TeamId extracted: ' + (teamId || 'None'));

    if (!teamId) {
      return res.json({
        planTier: 'free',
        status: 'none',
        isPro: false,
        isBusiness: false
      }, 200);
    }

    // Vérification de l'identité
    if (!userId) {
      return res.json({ error: 'Authentification requise' }, 401);
    }

    const headers = {
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
      'Content-Type': 'application/json'
    };

    // Vérifier que l'utilisateur appartient à cette équipe.
    // Cette vérification doit être adaptée si les propriétaires
    // sont enregistrés autrement dans ton modèle de données.
    const memberQueries = [
      JSON.stringify({
        method: 'equal',
        attribute: 'userId',
        values: [userId]
      }),
      JSON.stringify({
        method: 'equal',
        attribute: 'teamId',
        values: [teamId]
      }),
      JSON.stringify({
        method: 'equal',
        attribute: 'status',
        values: ['active']
      }),
      JSON.stringify({
        method: 'limit',
        values: [1]
      })
    ];

    const memberUrl =
      `${endpoint}/databases/${encodeURIComponent(databaseId)}` +
      `/collections/team_members/documents?` +
      memberQueries.map(q => `queries[]=${encodeURIComponent(q)}`).join('&');

    const memberResponse = await fetch(memberUrl, {
      method: 'GET',
      headers
    });

    const memberText = await memberResponse.text();
    const memberData = JSON.parse(memberText || '{}');

    if (!memberResponse.ok) {
      throw new Error(
        'Erreur vérification équipe : ' +
        (memberData.message || memberResponse.status)
      );
    }

    if (!memberData.documents?.length) {
      return res.json({ error: 'Accès à cette équipe refusé' }, 403);
    }

    // Lecture company_settings
    const settingsQueries = [
      JSON.stringify({
        method: 'equal',
        attribute: 'teamId',
        values: [teamId]
      }),
      JSON.stringify({
        method: 'limit',
        values: [1]
      })
    ];

    const settingsUrl =
      `${endpoint}/databases/${encodeURIComponent(databaseId)}` +
      `/collections/company_settings/documents?` +
      settingsQueries.map(q => `queries[]=${encodeURIComponent(q)}`).join('&');

    log('3. Reading company_settings');

    const response = await fetch(settingsUrl, {
      method: 'GET',
      headers
    });

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error('Réponse Appwrite invalide');
    }

    if (!response.ok) {
      throw new Error(
        `Appwrite ${response.status}: ${data.message || responseText}`
      );
    }

    let planTier = 'free';
    let status = 'none';
    let renewsAt = null;

    if (data.documents?.length > 0) {
      const doc = data.documents[0];

      planTier = String(
        doc.planTier || doc.plan || 'free'
      ).toLowerCase().trim();

      status = String(
        doc.subscriptionStatus || doc.status || 'none'
      ).toLowerCase().trim();

      renewsAt =
        doc.subscriptionRenewsAt ||
        doc.expirationDate ||
        null;
    }

    const validPlans = [
      'free',
      'essentiel',
      'pro',
      'business',
      'legende'
    ];

    if (!validPlans.includes(planTier)) {
      planTier = 'free';
      status = 'none';
    }

    const isPro = ['pro', 'business', 'legende'].includes(planTier);
    const isBusiness = ['business', 'legende'].includes(planTier);

    log('4. Final result:', {
      planTier,
      status,
      isPro,
      isBusiness
    });

    return res.json({
      planTier,
      status,
      subscriptionRenewsAt: renewsAt,
      isPro,
      isBusiness
    }, 200);

  } catch (err) {
    error('GLOBAL FUNCTION FAILURE: ' + err.message);

    return res.json({
      error: 'Impossible de vérifier le forfait',
      planTier: 'free',
      status: 'none',
      isPro: false,
      isBusiness: false
    }, 500);
  }
};
