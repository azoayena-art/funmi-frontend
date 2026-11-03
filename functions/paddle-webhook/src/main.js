// functions/paddle-webhook/src/main.js
// Webhook Paddle - Version Production
// Gère la création automatique de licences après paiement

// ============================================================
// 🔧 HELPERS
// ============================================================

async function findPlanByPriceId(endpoint, projectId, apiKey, dbId, priceId, log) {
  const url = `${endpoint}/databases/${dbId}/collections/plans/documents`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      log(`Erreur API lors de la récupération des plans: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.total === 0) {
      log('Aucun plan trouvé dans la base de données');
      return null;
    }

    const targetPlan = data.documents.find(doc => 
      doc.paddlePriceIdMonthly === priceId || doc.paddlePriceIdYearly === priceId
    );

    return targetPlan || null;
  } catch (error) {
    log(`Erreur lors de la recherche du plan: ${error.message}`);
    return null;
  }
}

async function createLicenseAndKey(endpoint, projectId, apiKey, dbId, { userId, teamId, plan, transactionId, log }) {
  const now = new Date();
  const durationDays = 30;
  const keyCode = generateKeyCode();
  const activationKeyCollectionId = 'activation_keys';

  const teamPermissions = [
    `read("team:${teamId}")`,
    `write("team:${teamId}")`
  ];

  try {
    // 1. Créer la clé d'activation
    const keyPayload = {
      documentId: 'unique()',
      data: {
        keyCode,
        durationDays,
        status: 'activated',
        activatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
        activatedBy: userId,
        createdAt: now.toISOString(),
        plan: plan.$id
      },
      permissions: teamPermissions
    };

    const keyResponse = await fetch(`${endpoint}/databases/${dbId}/collections/${activationKeyCollectionId}/documents`, {
      method: 'POST',
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(keyPayload)
    });

    if (!keyResponse.ok) {
      const errText = await keyResponse.text();
      throw new Error(`Création clé échouée: ${keyResponse.status} - ${errText}`);
    }
    
    const activationKey = await keyResponse.json();

    // 2. Créer la licence
    const licencePayload = {
      documentId: 'unique()',
      data: {
        status: 'active',
        startDate: now.toISOString(),
        expirationDate: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now.toISOString(),
        plan: plan.$id,
        activationKey: activationKey.$id,
        teamId
      },
      permissions: teamPermissions
    };

    const licenceResponse = await fetch(`${endpoint}/databases/${dbId}/collections/licenses/documents`, {
      method: 'POST',
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(licencePayload)
    });

    if (!licenceResponse.ok) {
      const errText = await licenceResponse.text();
      throw new Error(`Création licence échouée: ${licenceResponse.status} - ${errText}`);
    }

    const licence = await licenceResponse.json();
    log(`Licence créée avec succès - Team: ${teamId}, Plan: ${plan.name}, Clé: ${keyCode}`);
    
    return { activationKey, licence };
  } catch (error) {
    log(`Erreur lors de la création: ${error.message}`);
    throw error;
  }
}

function generateKeyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = [];
  for (let i = 0; i < 4; i++) {
    let segment = '';
    for (let j = 0; j < 5; j++) segment += chars.charAt(Math.floor(Math.random() * chars.length));
    segments.push(segment);
  }
  return segments.join('-');
}

// ============================================================
// 🎯 HANDLERS D'ÉVÉNEMENTS
// ============================================================

async function handleTransactionCompleted(event, endpoint, projectId, apiKey, dbId, log, error) {
  const tx = event.data;
  const customData = tx.custom_data || {};
  const userId = customData.user_id;
  const teamId = customData.team_id;

  log(`Transaction complétée: ${tx.id}`);
  
  if (!userId || !teamId) { 
    log('Ignoré: user_id ou team_id manquant dans custom_data'); 
    return; 
  }

  const priceId = tx.items?.[0]?.price?.id;
  if (!priceId) { 
    error('Price ID manquant dans la transaction'); 
    return; 
  }

  const plan = await findPlanByPriceId(endpoint, projectId, apiKey, dbId, priceId, log);
  if (!plan) { 
    error(`Plan non trouvé pour le price ID: ${priceId}`); 
    return; 
  }

  await createLicenseAndKey(endpoint, projectId, apiKey, dbId, { 
    userId, teamId, plan, transactionId: tx.id, log 
  });
}

// ============================================================
// 🎯 HANDLER PRINCIPAL
// ============================================================
export default async ({ req, res, log, error }) => {
  try {
    const rawBodyString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    let eventData;
    try {
      eventData = typeof req.body === 'string' ? JSON.parse(rawBodyString) : req.body;
    } catch (e) {
      log('Erreur de parsing JSON');
      return res.json({ error: 'Invalid JSON' }, 400);
    }

    const eventName = eventData?.event_type || 'inconnu';

    const endpoint = process.env.APPWRITE_ENDPOINT?.trim();
    const projectId = process.env.APPWRITE_PROJECT_ID?.trim();
    const apiKey = process.env.APPWRITE_API_KEY?.trim();
    const dbId = (process.env.APPWRITE_DATABASE_ID || 'relancepro_db').trim();

    if (!endpoint || !projectId || !apiKey) {
      error('Variables d\'environnement manquantes');
      return res.json({ error: 'Missing environment variables' }, 500);
    }

    switch (eventName) {
      case 'transaction.completed':
        await handleTransactionCompleted(eventData, endpoint, projectId, apiKey, dbId, log, error);
        break;
      case 'subscription.activated':
      case 'subscription.created':
        log(`Événement subscription reçu: ${eventName} (non implémenté)`);
        break;
      default:
        log(`Événement ignoré: ${eventName}`);
    }

    return res.json({ success: true }, 200);

  } catch (err) {
    error(`Erreur webhook: ${err.message}`);
    return res.json({ error: err.message }, 500);
  }
};