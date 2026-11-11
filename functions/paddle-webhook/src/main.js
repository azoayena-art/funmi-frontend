import crypto from 'crypto';

export default async ({ req, res, log, error }) => {
  log("🚀 PADDLE WEBHOOK - DÉBUT");

  // ============================================================
  // 1. CONFIGURATION & SÉCURITÉ
  // ============================================================
  const endpoint = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io").trim().replace(/\/+$/, "") + "/v1";
  const projectId = (process.env.APPWRITE_PROJECT_ID || "").trim();
  const apiKey = (process.env.APPWRITE_API_KEY || "").trim();
  const dbId = (process.env.APPWRITE_DATABASE_ID || "relancepro_db").trim();
  const paddleSecret = process.env.PADDLE_WEBHOOK_SECRET || "";

  if (!projectId || !apiKey || !dbId || !paddleSecret) {
    error("❌ Configuration manquante");
    return res.json({ success: false, error: "Configuration manquante" }, 500);
  }

  // ============================================================
  // 2. VÉRIFICATION DE LA SIGNATURE PADDLE (CRUCIAL)
  // ============================================================
  const signatureHeader = req.headers['paddle-signature'];
  if (!signatureHeader) {
    error("❌ Rejet : En-tête paddle-signature manquant");
    return res.json({ success: false, error: "Signature manquante" }, 401);
  }

  // Parser l'en-tête (format: ts=1234567890;h1=abcde...)
  const parts = signatureHeader.split(';');
  let timestamp = '';
  let signature = '';
  
  for (const part of parts) {
    if (part.startsWith('ts=')) timestamp = part.substring(3);
    if (part.startsWith('h1=')) signature = part.substring(3);
  }

  if (!timestamp || !signature) {
    error("❌ Rejet : Format de signature invalide");
    return res.json({ success: false, error: "Format signature invalide" }, 401);
  }

  // Vérifier que le timestamp a moins de 5 minutes (protection contre les attaques par rejeu)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    error("❌ Rejet : Signature expirée (plus de 5 min)");
    return res.json({ success: false, error: "Signature expirée" }, 401);
  }

  // Créer le payload à hasher : "timestamp:body"
  // Note: req.body doit être une chaîne de caractères brute pour le hachage
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const payloadToHash = `${timestamp}:${rawBody}`;

  // Calculer le HMAC-SHA256
  const expectedSignature = crypto
    .createHmac('sha256', paddleSecret)
    .update(payloadToHash)
    .digest('hex');

  // Comparer les signatures de manière sécurisée (protection contre les attaques par timing)
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    error("❌ Rejet : Signature invalide (tentative de falsification ?)");
    return res.json({ success: false, error: "Signature invalide" }, 403);
  }

  log("✅ Signature Paddle vérifiée avec succès");

  // ============================================================
  // 3. OUTILS REST & EXTRACTION DES DONNÉES
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
    let eventData = req.body;
    if (typeof eventData === "string") {
      try { eventData = JSON.parse(eventData); } catch { return res.json({ success: false, error: "Invalid JSON" }, 400); }
    }

    const data = eventData?.data || eventData;
    const customData = data?.custom_data || eventData?.custom_data || {};

    const teamId = String(customData.teamId || customData.team_id || "").trim();
    const firstItem = data?.items?.[0];
    const rawPriceId = firstItem?.price?.id || firstItem?.price_id || data?.price_id || null;
    const priceId = String(rawPriceId || "").trim();

    log(`2. Paddle : type=${eventData?.event_type}, teamId=${teamId}, priceId=${priceId}`);

    if (!teamId || !priceId) {
      return res.json({ success: true, message: "Missing teamId or priceId" }, 200);
    }

    // ... (Le reste de ton code à partir de "4. RECHERCHE PLAN" reste IDENTIQUE et est parfait) ...

    // ============================================================
    // 4. RECHERCHE PLAN
    // ============================================================
    log(`3. Recherche plan dans '${COLLECTION_PLANS}'`);
    const plansParams = new URLSearchParams();
    plansParams.append("queries[]", JSON.stringify({ method: "limit", values: [100] }));

    const plansUrl = apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/${COLLECTION_PLANS}/documents?${plansParams.toString()}`);
    const plansResponse = await fetch(plansUrl, { method: "GET", headers });
    const plansResult = await readResponse(plansResponse);

    if (!plansResult.ok) {
      error(`❌ Erreur lecture plans : ${JSON.stringify(plansResult.data)}`);
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
      return res.json({ success: false, step: "find_plan", receivedPriceId: priceId }, 404);
    }

    log(`4. ✅ Plan trouvé : ${matchedPlan.name}`);

    // ============================================================
    // 5. PRÉPARATION PAYLOAD & MAPPING DES STATUTS
    // ============================================================
    const rawRenewsAt = data.current_billing_period?.ends_at || data.next_billed_at || null;
    let subscriptionRenewsAt = null;
    if (rawRenewsAt) {
      const date = new Date(rawRenewsAt);
      if (!isNaN(date.getTime())) subscriptionRenewsAt = date.toISOString();
    }

    const paddleStatus = String(data.status || "").toLowerCase();

    // ⚠️ MAPPING CRITIQUE POUR APPWRITE
    // 1. Pour company_settings, on garde 'trialing' si c'est le cas
    const settingsStatus = (paddleStatus === "trialing" || paddleStatus === "active") ? "trialing" : paddleStatus;

    // 2. Pour licenses, on DOIT respecter l'Enum Appwrite : 'active', 'expired', 'suspended'
    let licenseStatus = "active"; // 'trialing' et 'active' deviennent 'active'
    if (paddleStatus === "canceled" || paddleStatus === "past_due" || paddleStatus === "paused") {
      licenseStatus = "suspended";
    } else if (paddleStatus === "expired") {
      licenseStatus = "expired";
    }

    const updatePayload = {
      planTier: matchedPlan.name.toLowerCase(),
      subscriptionStatus: settingsStatus,
      paddleSubscriptionId: data.subscription_id || data.id || null,
      paddleCustomerId: data.customer_id || null,
      subscriptionRenewsAt
    };

    // ============================================================
    // 6. MISE À JOUR company_settings
    // ============================================================
    log(`6. Mise à jour '${COLLECTION_SETTINGS}'`);
    const settingsParams = new URLSearchParams();
    settingsParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "teamId", values: [teamId] }));
    settingsParams.append("queries[]", JSON.stringify({ method: "limit", values: [10] }));

    const settingsUrl = apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/${COLLECTION_SETTINGS}/documents?${settingsParams.toString()}`);
    const settingsResponse = await fetch(settingsUrl, { method: "GET", headers });
    const settingsResult = await readResponse(settingsResponse);

    if (settingsResult.ok && settingsResult.data.documents?.length > 0) {
      const docId = settingsResult.data.documents[0].$id;
      const updateUrl = apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/${COLLECTION_SETTINGS}/documents/${encodeURIComponent(docId)}`);
      
      await fetch(updateUrl, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ data: updatePayload })
      });
      log(`   ✅ company_settings mis à jour`);
    }

       // ============================================================
    // 7. MISE À JOUR OU CRÉATION licenses (BLINDÉ ANTI-DOUBLON)
    // ============================================================
    log(`7. Traitement de la collection '${COLLECTION_LICENSES}'`);
    
    const licensesParams = new URLSearchParams();
    licensesParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "teamId", values: [teamId] }));
    licensesParams.append("queries[]", JSON.stringify({ method: "orderDesc", attribute: "$createdAt" })); // Prend le plus récent en cas de doublon
    licensesParams.append("queries[]", JSON.stringify({ method: "limit", values: [1] }));

    const licensesUrl = apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/${COLLECTION_LICENSES}/documents?${licensesParams.toString()}`);
    const licensesResponse = await fetch(licensesUrl, { method: "GET", headers });
    const licensesResult = await readResponse(licensesResponse);

    let licenseDocId = null;
    let licenseMethod = "POST";
    let licenseEndpointPath = `/databases/${encodeURIComponent(dbId)}/collections/${COLLECTION_LICENSES}/documents`;

    if (licensesResult.ok && licensesResult.data.documents?.length > 0) {
      licenseDocId = licensesResult.data.documents[0].$id;
      licenseMethod = "PATCH";
      licenseEndpointPath += `/${encodeURIComponent(licenseDocId)}`;
      log(`   ⚠️ Licence existante trouvée, mise à jour (PATCH) de : ${licenseDocId}`);
    } else {
      log(`   Aucune licence trouvée, tentative de création (POST)`);
    }

    const licensePayload = {
      teamId: teamId,
      plan: matchedPlan.name.toLowerCase(),
      status: licenseStatus,
      startDate: new Date().toISOString(),
      expirationDate: subscriptionRenewsAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };

    const finalLicensePayload = licenseMethod === "PATCH" 
      ? { data: licensePayload } 
      : { documentId: "unique()", data: licensePayload };
    
    const finalLicenseUrl = apiUrl(licenseEndpointPath);

    const licenseResponse = await fetch(finalLicenseUrl, {
      method: licenseMethod,
      headers,
      body: JSON.stringify(finalLicensePayload)
    });

    const licenseResult = await readResponse(licenseResponse);
    log(`   Réponse Licences (${licenseMethod}) : HTTP ${licenseResult.status}`);

    // 🛡️ SAUVETAGE EN CAS DE RACE CONDITION (Si le POST échoue car créé entre-temps par un autre webhook Paddle)
    if (!licenseResult.ok && licenseMethod === "POST" && licenseResult.status === 409) {
        log("   ⚠️ Conflit (409) : La licence a été créée entre-temps par un autre événement. Récupération et mise à jour...");
        
        // On refait une recherche rapide pour trouver l'ID qui vient d'être créé
        const retryRes = await fetch(licensesUrl, { method: "GET", headers });
        const retryResult = await readResponse(retryRes);
        
        if (retryResult.ok && retryResult.data.documents?.length > 0) {
            const newDocId = retryResult.data.documents[0].$id;
            const patchUrl = apiUrl(`/databases/${encodeURIComponent(dbId)}/collections/${COLLECTION_LICENSES}/documents/${encodeURIComponent(newDocId)}`);
            
            const patchRes = await fetch(patchUrl, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ data: licensePayload })
            });
            const patchResult = await readResponse(patchRes);
            log(`   ✅ Sauvetage réussi : Mise à jour (PATCH) de ${newDocId} (HTTP ${patchResult.status})`);
        }
    } else if (!licenseResult.ok) {
        error(`   ❌ ERREUR LICENSES : ${JSON.stringify(licenseResult.data)}`);
        return res.json({ 
          success: false, 
          step: "update_licenses", 
          status: licenseResult.status,
          error: licenseResult.data 
        }, 500);
    } else {
        log(`   🎉 LICENCE TRAITÉE AVEC SUCCÈS (ID: ${licenseDocId || licenseResult.data?.$id})`);
    }

    // ============================================================
    // 8. SUCCÈS
    // ============================================================
    log("🎯 WEBHOOK TERMINÉ AVEC SUCCÈS");
    return res.json({
      success: true,
      teamId,
      plan: matchedPlan.name.toLowerCase(),
      status: licenseStatus,
      licenseDocId: licenseDocId || licenseResult.data?.$id
    }, 200);

  } catch (err) {
    error(`❌ ERREUR CRITIQUE : ${err.message}`);
    return res.json({ success: false, error: err.message }, 500);
  }
};