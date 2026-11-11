import crypto from 'crypto';

export default async ({ req, res, log, error }) => {
  log("🚀 PADDLE WEBHOOK - DÉBUT");
  log("📋 Headers reçus:", JSON.stringify(req.headers));

  // ============================================================
  // 1. CONFIGURATION
  // ============================================================
  const endpoint = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io").trim().replace(/\/+$/, "") + "/v1";
  const projectId = (process.env.APPWRITE_PROJECT_ID || "").trim();
  const apiKey = (process.env.APPWRITE_API_KEY || "").trim();
  const dbId = (process.env.APPWRITE_DATABASE_ID || "relancepro_db").trim();
  const paddleSecret = (process.env.PADDLE_WEBHOOK_SECRET || "").trim();

  log("🔑 Secret configuré (début):", paddleSecret.substring(0, 15));
  log("🔑 Secret longueur:", paddleSecret.length);

  if (!projectId || !apiKey || !dbId || !paddleSecret) {
    error("❌ Configuration manquante");
    return res.json({ success: false, error: "Configuration manquante" }, 500);
  }

  // ============================================================
  // 2. RÉCUPÉRATION DU CORPS BRUT (CRUCIAL !)
  // ============================================================
  // Appwrite parse automatiquement le JSON, donc req.body est un objet.
  // Pour vérifier la signature HMAC, on a besoin du corps EXACT reçu.
  
  let rawBody = '';
  
  // Méthode 1 : req.bodyRaw (disponible dans les versions récentes d'Appwrite)
  if (req.bodyRaw) {
    rawBody = typeof req.bodyRaw === 'string' ? req.bodyRaw : JSON.stringify(req.bodyRaw);
    log("📦 Corps récupéré via bodyRaw");
  }
  // Méthode 2 : Si req.body est déjà un objet, on le re-stringifie
  else if (typeof req.body === 'object' && req.body !== null) {
    rawBody = JSON.stringify(req.body);
    log("📦 Corps re-stringifié depuis objet");
  }
  // Méthode 3 : Si req.body est déjà une string
  else if (typeof req.body === 'string') {
    rawBody = req.body;
    log("📦 Corps récupéré comme string");
  }

  log("📦 Corps brut (100 premiers chars):", rawBody.substring(0, 100));

  // ============================================================
  // 3. VÉRIFICATION DE LA SIGNATURE
  // ============================================================
  const signatureHeader = req.headers['paddle-signature'] || req.headers['Paddle-Signature'];
  
  if (!signatureHeader) {
    error("❌ En-tête paddle-signature manquant");
    log("📋 Headers disponibles:", Object.keys(req.headers).join(', '));
    return res.json({ success: false, error: "Signature manquante" }, 401);
  }

  log("📝 Header signature:", signatureHeader.substring(0, 50));

  // Parser l'en-tête
  const parts = signatureHeader.split(';');
  let timestamp = '';
  let signature = '';
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith('ts=')) timestamp = trimmed.substring(3);
    if (trimmed.startsWith('h1=')) signature = trimmed.substring(3);
  }

  if (!timestamp || !signature) {
    error("❌ Format de signature invalide");
    return res.json({ success: false, error: "Format signature invalide" }, 401);
  }

  // Vérifier le timestamp (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    error("❌ Signature expirée");
    return res.json({ success: false, error: "Signature expirée" }, 401);
  }

  // Calculer le HMAC
  const payloadToHash = `${timestamp}:${rawBody}`;
  log("🔐 Payload à hasher (100 premiers chars):", payloadToHash.substring(0, 100));

  const expectedSignature = crypto
    .createHmac('sha256', paddleSecret)
    .update(payloadToHash)
    .digest('hex');

  log("🔐 Signature attendue:", expectedSignature.substring(0, 20));
  log("🔐 Signature reçue:", signature.substring(0, 20));
  log("🔐 Match:", expectedSignature === signature);

  // Comparaison sécurisée
  let signatureValid = false;
  try {
    signatureValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (e) {
    log("⚠️ Erreur timingSafeEqual (longueurs différentes ?):", e.message);
    // Fallback : comparaison simple si longueurs différentes
    signatureValid = signature === expectedSignature;
  }

  if (!signatureValid) {
    error("❌ Signature invalide");
    log("🔍 Debug - Secret utilisé:", paddleSecret);
    log("🔍 Debug - Timestamp:", timestamp);
    log("🔍 Debug - RawBody length:", rawBody.length);
    return res.json({ success: false, error: "Signature invalide" }, 403);
  }

  log("✅ Signature vérifiée avec succès !");

  // ============================================================
  // 4. TRAITEMENT DE L'ÉVÉNEMENT
  // ============================================================
  const headers = {
    "X-Appwrite-Project": projectId,
    "X-Appwrite-Key": apiKey,
    "Content-Type": "application/json"
  };

  const readResponse = async (response) => {
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 1500) }; }
    return { ok: response.ok, status: response.status, data };
  };

  const apiUrl = (path) => `${endpoint}${path}`;

  try {
    // Parser le corps en objet pour traitement
    let eventData = typeof rawBody === 'string' ? JSON.parse(rawBody) : req.body;
    const eventType = eventData?.event_type || "unknown";
    const data = eventData?.data || eventData;
    const customData = data?.custom_data || eventData?.custom_data || {};

    log(`📨 Type d'événement: ${eventType}`);
    log(`📊 Données:`, JSON.stringify(data).substring(0, 200));

    const teamId = String(customData.teamId || customData.team_id || "").trim();
    const firstItem = data?.items?.[0];
    const rawPriceId = firstItem?.price?.id || firstItem?.price_id || data?.price_id || null;
    const priceId = String(rawPriceId || "").trim();

    log(`🎯 teamId: ${teamId}, priceId: ${priceId}`);

    if (!teamId || !priceId) {
      log("⚠️ teamId ou priceId manquant, webhook ignoré");
      return res.json({ success: true, message: "Ignoré (teamId/priceId manquant)" }, 200);
    }

    // ============================================================
    // 5. RECHERCHE DU PLAN
    // ============================================================
    const plansParams = new URLSearchParams();
    plansParams.append("queries[]", JSON.stringify({ method: "limit", values: [100] }));

    const plansUrl = apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/plans/documents?${plansParams.toString()}`);
    const plansResponse = await fetch(plansUrl, { method: "GET", headers });
    const plansResult = await readResponse(plansResponse);

    if (!plansResult.ok) {
      error(`❌ Erreur lecture plans: ${JSON.stringify(plansResult.data)}`);
      return res.json({ success: false, step: "read_plans" }, 500);
    }

    const plans = plansResult.data.documents || [];
    const matchedPlan = plans.find((plan) => {
      const monthlyId = String(plan.paddlePriceIdMonthly || "").trim();
      const yearlyId = String(plan.paddlePriceIdYearly || "").trim();
      return monthlyId === priceId || yearlyId === priceId;
    });

    if (!matchedPlan) {
      error(`❌ Plan non trouvé pour priceId=${priceId}`);
      log("📋 Plans disponibles:", plans.map(p => ({ name: p.name, monthly: p.paddlePriceIdMonthly, yearly: p.paddlePriceIdYearly })));
      return res.json({ success: false, step: "find_plan", receivedPriceId: priceId }, 404);
    }

    log(`✅ Plan trouvé: ${matchedPlan.name}`);

    // ============================================================
    // 6. MISE À JOUR company_settings
    // ============================================================
    const paddleStatus = String(data.status || "").toLowerCase();
    const settingsStatus = (paddleStatus === "trialing" || paddleStatus === "active") ? "active" : paddleStatus;

    const updatePayload = {
      planTier: matchedPlan.name.toLowerCase(),
      subscriptionStatus: settingsStatus,
      paddleSubscriptionId: data.subscription_id || data.id || null,
      paddleCustomerId: data.customer_id || null,
    };

    const settingsParams = new URLSearchParams();
    settingsParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "teamId", values: [teamId] }));
    settingsParams.append("queries[]", JSON.stringify({ method: "limit", values: [10] }));

    const settingsUrl = apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/company_settings/documents?${settingsParams.toString()}`);
    const settingsResponse = await fetch(settingsUrl, { method: "GET", headers });
    const settingsResult = await readResponse(settingsResponse);

    if (settingsResult.ok && settingsResult.data.documents?.length > 0) {
      const docId = settingsResult.data.documents[0].$id;
      const updateUrl = apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/company_settings/documents/${encodeURIComponent(docId)}`);
      
      const updateRes = await fetch(updateUrl, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ data: updatePayload })
      });
      const updateResult = await readResponse(updateRes);
      
      if (updateResult.ok) {
        log(`✅ company_settings mis à jour (doc: ${docId})`);
      } else {
        error(`❌ Erreur update settings: ${JSON.stringify(updateResult.data)}`);
      }
    } else {
      log(`⚠️ Aucun document company_settings trouvé pour teamId=${teamId}`);
    }

    // ============================================================
    // 7. MISE À JOUR licenses
    // ============================================================
    let licenseStatus = "active";
    if (paddleStatus === "canceled" || paddleStatus === "past_due" || paddleStatus === "paused") {
      licenseStatus = "suspended";
    } else if (paddleStatus === "expired") {
      licenseStatus = "expired";
    }

    const licensesParams = new URLSearchParams();
    licensesParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "teamId", values: [teamId] }));
    licensesParams.append("queries[]", JSON.stringify({ method: "limit", values: [1] }));

    const licensesUrl = apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/licenses/documents?${licensesParams.toString()}`);
    const licensesResponse = await fetch(licensesUrl, { method: "GET", headers });
    const licensesResult = await readResponse(licensesResponse);

    if (licensesResult.ok && licensesResult.data.documents?.length > 0) {
      const licenseDocId = licensesResult.data.documents[0].$id;
      const licensePayload = {
        plan: matchedPlan.name.toLowerCase(),
        status: licenseStatus,
      };
      
      const patchUrl = apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/licenses/documents/${encodeURIComponent(licenseDocId)}`);
      const patchRes = await fetch(patchUrl, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ data: licensePayload })
      });
      const patchResult = await readResponse(patchRes);
      log(`📝 License mise à jour: ${patchResult.ok ? 'OK' : 'ÉCHEC'}`);
    } else {
      // Créer une nouvelle license
      const licensePayload = {
        teamId: teamId,
        plan: matchedPlan.name.toLowerCase(),
        status: licenseStatus,
        startDate: new Date().toISOString(),
      };
      
      const createRes = await fetch(apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/licenses/documents`), {
        method: "POST",
        headers,
        body: JSON.stringify({ documentId: "unique()", data: licensePayload })
      });
      const createResult = await readResponse(createRes);
      log(`🆕 License créée: ${createResult.ok ? 'OK' : 'ÉCHEC'}`);
    }

    log("🎯 WEBHOOK TERMINÉ AVEC SUCCÈS");
    return res.json({
      success: true,
      teamId,
      plan: matchedPlan.name.toLowerCase(),
      status: licenseStatus,
      eventType
    }, 200);

  } catch (err) {
    error(`❌ ERREUR CRITIQUE: ${err.message}`);
    return res.json({ success: false, error: err.message }, 500);
  }
};