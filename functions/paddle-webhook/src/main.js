// functions/paddle-webhook/src/main.js
// Webhook Paddle Billing - Gestion des abonnements Funmi (Sécurisé)

const crypto = require('crypto');

export default async ({ req, res, log, error }) => {
  try {
    // 1. Récupérer le corps brut pour la vérification de signature
    const rawBodyString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    
    // 2. Vérification de la signature Paddle (SÉCURITÉ CRITIQUE)
    const signatureHeader = req.headers['paddle-signature'];
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

    if (signatureHeader && webhookSecret) {
      const parts = signatureHeader.split(',');
      let ts = '';
      let h1 = '';
      
      for (const part of parts) {
        const [key, value] = part.trim().split('=');
        if (key === 'ts') ts = value;
        if (key === 'h1') h1 = value;
      }

      if (ts && h1) {
        // La chaîne à signer est : "timestamp:corps_de_la_requête"
        const dataToSign = `${ts}:${rawBodyString}`;
        const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(dataToSign).digest('hex');
        
        // Utilisation de timingSafeEqual pour éviter les attaques par temps de réponse
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        const actualBuffer = Buffer.from(h1, 'hex');
        
        if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
          error('❌ Signature du webhook Paddle invalide ! Requête rejetée.');
          return res.json({ error: 'Invalid signature' }, 401);
        }
        log('✅ Signature du webhook Paddle vérifiée avec succès.');
      } else {
        error('❌ Format de signature Paddle invalide (ts ou h1 manquant).');
        return res.json({ error: 'Invalid signature format' }, 400);
      }
    } else {
      log('⚠️ Attention : PADDLE_WEBHOOK_SECRET non défini ou header manquant. La vérification de signature est ignorée (à corriger en production).');
    }

    // 3. Parser le corps de la requête
    let eventData;
    try {
      eventData = typeof req.body === 'string' ? JSON.parse(rawBodyString) : req.body;
    } catch (e) {
      log('Erreur de parsing JSON');
      return res.json({ error: 'Invalid JSON' }, 400);
    }

    const eventName = eventData?.event_type;
    const data = eventData?.data || {};
    
    log(`Événement Paddle reçu : ${eventName}`);

    // 4. Récupérer les variables d'environnement
    const endpoint = process.env.APPWRITE_ENDPOINT?.replace(/\/$/, '');
    const projectId = process.env.APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    const dbId = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';
    const collectionId = 'company_settings'; // Collection cible

    if (!endpoint || !projectId || !apiKey) {
      error('Variables d\'environnement manquantes');
      return res.json({ error: 'Missing environment variables' }, 500);
    }

    // 5. Mapper les Price IDs aux plans Funmi
    const PRICE_ID_STARTER = 'pri_01m6rssy7qr42tgyyj0r0tnnb8';
    const PRICE_ID_PRO = 'pri_01m6rt1mkc16kkrvbtg25v89t5';

    const priceId = data.items?.[0]?.price?.id || data.price_id;
    let planTier = 'free';
    if (priceId === PRICE_ID_STARTER) planTier = 'starter';
    else if (priceId === PRICE_ID_PRO) planTier = 'pro';

    // 6. Récupérer le teamId depuis les custom_data envoyés par le frontend
    const customData = data.custom_data || {};
    const teamId = customData.teamId;

    if (!teamId) {
      log('Ignoré: teamId manquant dans custom_data');
      return res.json({ success: true, message: 'Ignoré: pas de teamId' }, 200);
    }

    // 7. Trouver le document company_settings correspondant au teamId
    const listUrl = `${endpoint}/v1/databases/${dbId}/collections/${collectionId}/documents?queries=${encodeURIComponent(JSON.stringify([`equal('teamId', '${teamId}')`]))}`;
    
    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!listResponse.ok) {
      error(`Erreur liste documents: ${listResponse.status}`);
      return res.json({ error: 'Appwrite list error' }, 500);
    }

    const listData = await listResponse.json();
    if (listData.total === 0) {
      log(`Aucun company_settings trouvé pour le teamId: ${teamId}`);
      return res.json({ success: true, message: 'No settings found' }, 200);
    }

    const docId = listData.documents[0].$id;

    // 8. Préparer les données de mise à jour selon l'événement
    let updatePayload = {};

    if (eventName === 'subscription.activated' || eventName === 'subscription.created') {
      const nextBillingDate = data.next_billed_at || data.current_billing_period_ends_at;
      const status = data.status === 'trialing' ? 'trialing' : 'active';
      
      updatePayload = {
        subscriptionStatus: status,
        paddleSubscriptionId: data.id,
        paddleCustomerId: data.customer_id,
        planTier: planTier,
        subscriptionRenewsAt: nextBillingDate ? new Date(nextBillingDate).toISOString() : null
      };
      log(`Activation abonnement: Team ${teamId}, Plan ${planTier}, Status ${status}`);

    } else if (eventName === 'subscription.updated') {
      const nextBillingDate = data.next_billed_at || data.current_billing_period_ends_at;
      updatePayload = {
        planTier: planTier, // Au cas où il y a eu un upgrade/downgrade
        subscriptionRenewsAt: nextBillingDate ? new Date(nextBillingDate).toISOString() : null
      };
      log(`Mise à jour abonnement: Team ${teamId}, Plan ${planTier}`);

    } else if (eventName === 'subscription.canceled' || eventName === 'subscription.past_due') {
      updatePayload = {
        subscriptionStatus: eventName === 'subscription.canceled' ? 'canceled' : 'past_due'
      };
      log(`Abonnement annulé ou en retard: Team ${teamId}`);
    } else {
      log(`Événement ignoré: ${eventName}`);
      return res.json({ success: true, message: 'Event ignored' }, 200);
    }

    // 9. Mettre à jour le document dans Appwrite
    const updateUrl = `${endpoint}/v1/databases/${dbId}/collections/${collectionId}/documents/${docId}`;
    
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateResponse.ok) {
      const errText = await updateResponse.text();
      error(`Erreur mise à jour Appwrite: ${updateResponse.status} - ${errText}`);
      return res.json({ error: 'Appwrite update error' }, 500);
    }

    log(`✅ Succès : company_settings mis à jour pour le teamId ${teamId}`);
    return res.json({ success: true }, 200);

  } catch (err) {
    error(`❌ Erreur critique webhook: ${err.message}`);
    return res.json({ error: err.message }, 500);
  }
};