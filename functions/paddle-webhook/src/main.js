
export default async ({ req, res, log, error }) => {
  log("🚀 PADDLE WEBHOOK - DÉBUT");

  // ============================================================
  // 1. CONFIGURATION APPWRITE
  // ============================================================

  let endpoint = (
    process.env.APPWRITE_ENDPOINT ||
    "https://fra.cloud.appwrite.io"
  ).trim().replace(/\/+$/, "");

  // Garantir un seul /v1
  endpoint = endpoint.replace(/(?:\/v1)+$/i, "");
  endpoint += "/v1";

  const projectId = (process.env.APPWRITE_PROJECT_ID || "").trim();
  const apiKey = (process.env.APPWRITE_API_KEY || "").trim();
  const dbId = (
    process.env.APPWRITE_DATABASE_ID || "relancepro_db"
  ).trim();

  log(`1. Endpoint API : ${endpoint}`);
  log(`Project ID : ${projectId ? "OK" : "MANQUANT"}`);
  log(`API Key : ${apiKey ? "OK" : "MANQUANTE"}`);
  log(`Database ID : ${dbId}`);

  if (!projectId || !apiKey || !dbId) {
    error("Configuration Appwrite manquante");

    return res.json({
      success: false,
      error: "Configuration Appwrite manquante"
    }, 500);
  }

  // ============================================================
  // 2. OUTILS REST APPWRITE
  // ============================================================

  const headers = {
    "X-Appwrite-Project": projectId,
    "X-Appwrite-Key": apiKey,
    "Content-Type": "application/json"
  };

  const readResponse = async (response) => {
    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 1500) };
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  };

  const apiUrl = (path) => `${endpoint}${path}`;

  try {
    // ============================================================
    // 3. EXTRACTION DES DONNÉES PADDLE
    // ============================================================

    let eventData = req.body;

    if (typeof eventData === "string") {
      try {
        eventData = JSON.parse(eventData);
      } catch {
        error("Corps de requête JSON invalide");

        return res.json({
          success: false,
          error: "Invalid JSON"
        }, 400);
      }
    }

    const data = eventData?.data || eventData;

    const customData =
      data?.custom_data ||
      eventData?.custom_data ||
      {};

    const teamId = String(
      customData.teamId ||
      customData.team_id ||
      ""
    ).trim();

    const firstItem = data?.items?.[0];

    const rawPriceId =
      firstItem?.price?.id ||
      firstItem?.price_id ||
      data?.price_id ||
      data?.price?.id ||
      null;

    const priceId = String(rawPriceId || "").trim();

    log("2. Événement Paddle reçu");
    log(`Type : ${eventData?.event_type || "Non précisé"}`);
    log(`Team ID : ${teamId || "ABSENT"}`);
    log(`Price ID reçu : ${priceId || "ABSENT"}`);

    if (!teamId || !priceId) {
      log("Données teamId ou priceId absentes");

      return res.json({
        success: true,
        message: "Missing teamId or priceId"
      }, 200);
    }

    // ============================================================
    // 4. RECHERCHE DES PLANS
    // ============================================================

    log("3. Recherche des plans dans Appwrite");

    const plansParams = new URLSearchParams();

    plansParams.append(
      "queries[]",
      JSON.stringify({
        method: "limit",
        values: [100]
      })
    );

    const plansUrl = apiUrl(
      `/databases/${encodeURIComponent(dbId)}` +
      `/collections/plans/documents?${plansParams.toString()}`
    );

    log(`URL Plans : ${plansUrl}`);

    const plansResponse = await fetch(plansUrl, {
      method: "GET",
      headers
    });

    const plansResult = await readResponse(plansResponse);

    log(`Réponse Plans : HTTP ${plansResult.status}`);

    if (!plansResult.ok) {
      error(`Erreur lecture plans : ${JSON.stringify(plansResult.data)}`);

      return res.json({
        success: false,
        step: "read_plans",
        status: plansResult.status,
        details: plansResult.data
      }, 500);
    }

    const plans = plansResult.data.documents || [];

    log(`Nombre de plans récupérés : ${plans.length}`);

    // Afficher les identifiants enregistrés pour le diagnostic
    for (const plan of plans) {
      log(
        `Plan ${plan.name} : ` +
        `mensuel=${plan.paddlePriceIdMonthly || "NULL"}, ` +
        `annuel=${plan.paddlePriceIdYearly || "NULL"}`
      );
    }

    const matchedPlan = plans.find((plan) => {
      const monthlyId = String(
        plan.paddlePriceIdMonthly || ""
      ).trim();

      const yearlyId = String(
        plan.paddlePriceIdYearly || ""
      ).trim();

      return monthlyId === priceId || yearlyId === priceId;
    });

    if (!matchedPlan) {
      error(`Aucun plan trouvé pour priceId=${priceId}`);

      return res.json({
        success: false,
        step: "find_plan",
        error: "Plan not found",
        receivedPriceId: priceId,
        availablePlans: plans.map((plan) => ({
          name: plan.name,
          monthlyPriceId: plan.paddlePriceIdMonthly,
          yearlyPriceId: plan.paddlePriceIdYearly
        }))
      }, 404);
    }

    log(`4. Plan trouvé : ${matchedPlan.name}`);
    log(`Identifiant du plan : ${matchedPlan.$id}`);

    // ============================================================
    // 5. RECHERCHE DES PARAMÈTRES DE L'ÉQUIPE
    // ============================================================

    log("5. Recherche de company_settings");

    const settingsParams = new URLSearchParams();

    settingsParams.append(
      "queries[]",
      JSON.stringify({
        method: "equal",
        attribute: "teamId",
        values: [teamId]
      })
    );

    settingsParams.append(
      "queries[]",
      JSON.stringify({
        method: "limit",
        values: [10]
      })
    );

    const settingsUrl = apiUrl(
      `/databases/${encodeURIComponent(dbId)}` +
      `/collections/company_settings/documents?${settingsParams.toString()}`
    );

    log(`URL Settings : ${settingsUrl}`);

    const settingsResponse = await fetch(settingsUrl, {
      method: "GET",
      headers
    });

    const settingsResult = await readResponse(settingsResponse);

    log(`Réponse Settings : HTTP ${settingsResult.status}`);

    if (!settingsResult.ok) {
      error(
        `Erreur lecture settings : ${JSON.stringify(settingsResult.data)}`
      );

      return res.json({
        success: false,
        step: "read_settings",
        status: settingsResult.status,
        details: settingsResult.data
      }, 500);
    }

    const settingsDocuments =
      settingsResult.data.documents || [];

    if (settingsDocuments.length === 0) {
      error(`Aucun document trouvé pour teamId=${teamId}`);

      return res.json({
        success: false,
        step: "find_settings",
        error: "Settings not found",
        teamId
      }, 404);
    }

    const settingsDocument = settingsDocuments[0];
    const docId = settingsDocument.$id;

    log(`6. Document company_settings trouvé : ${docId}`);

    // ============================================================
    // 6. PRÉPARATION DE LA MISE À JOUR
    // ============================================================

    log("7. Préparation de la mise à jour");

    const rawRenewsAt =
      data.current_billing_period?.ends_at ||
      data.next_billed_at ||
      data.billing_period?.ends_at ||
      null;

    let subscriptionRenewsAt = null;

    if (rawRenewsAt) {
      const date = new Date(rawRenewsAt);

      if (!isNaN(date.getTime())) {
        subscriptionRenewsAt = date.toISOString();
      } else {
        log(`Date invalide : ${rawRenewsAt}`);
      }
    }

    const paddleStatus = String(data.status || "").toLowerCase();

    const statusMap = {
      trialing: "trialing",
      active: "active",
      past_due: "past_due",
      paused: "paused",
      canceled: "canceled",
      completed: "active"
    };

    const subscriptionStatus =
      statusMap[paddleStatus] || "active";

    const updatePayload = {
      planTier: matchedPlan.name.toLowerCase(),

      subscriptionStatus,

      paddleSubscriptionId:
        data.subscription_id ||
        data.id ||
        settingsDocument.paddleSubscriptionId ||
        null,

      paddleCustomerId:
        data.customer_id ||
        settingsDocument.paddleCustomerId ||
        null,

      subscriptionRenewsAt
    };

    log(`8. Données préparées : ${JSON.stringify(updatePayload)}`);

    // ============================================================
    // 7. MISE À JOUR DE COMPANY_SETTINGS
    // ============================================================

    const updateUrl = apiUrl(
      `/databases/${encodeURIComponent(dbId)}` +
      `/collections/company_settings/documents/${encodeURIComponent(docId)}`
    );

    const updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        data: updatePayload
      })
    });

    const updateResult = await readResponse(updateResponse);

    log(`Réponse Update : HTTP ${updateResult.status}`);

    if (!updateResult.ok) {
      error(
        `Erreur mise à jour : ${JSON.stringify(updateResult.data)}`
      );

      return res.json({
        success: false,
        step: "update_settings",
        status: updateResult.status,
        details: updateResult.data
      }, 500);
    }

    const updatedDocument = updateResult.data;

    // ============================================================
    // 8. CONFIRMATION
    // ============================================================

    log("🎉 ABONNEMENT MIS À JOUR AVEC SUCCÈS");
    log(`Plan actif : ${updatedDocument.planTier}`);
    log(`Statut : ${updatedDocument.subscriptionStatus}`);
    log(`Document : ${updatedDocument.$id}`);

    return res.json({
      success: true,
      message: "Subscription updated successfully",
      teamId,
      documentId: updatedDocument.$id,
      plan: updatedDocument.planTier,
      status: updatedDocument.subscriptionStatus,
      paddleSubscriptionId: updatedDocument.paddleSubscriptionId,
      subscriptionRenewsAt: updatedDocument.subscriptionRenewsAt
    }, 200);

  } catch (err) {
    error("ERREUR CRITIQUE PADDLE WEBHOOK");
    error(`Message : ${err.message || "Inconnu"}`);
    error(`Stack : ${err.stack || "Non disponible"}`);

    return res.json({
      success: false,
      error: err.message || "Erreur inconnue",
      type: err.name || null
    }, 500);
  }
};
