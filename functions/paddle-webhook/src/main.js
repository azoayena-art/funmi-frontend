
export default async ({ req, res, log, error }) => {
  log("1. ✅ Début de la fonction");

  // ==========================================
  // CONFIGURATION
  // ==========================================

  const endpoint = (
    process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io"
  ).replace(/\/+$/, "");

  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const dbId = process.env.APPWRITE_DATABASE_ID || "relancepro_db";

  log(
    `2. Variables: endpoint=${endpoint}, projectId=${projectId ? "OK" : "MANQUANT"}, apiKey=${apiKey ? "OK" : "MANQUANT"}, dbId=${dbId}`
  );

  if (!projectId || !apiKey) {
    return res.json({
      success: false,
      error: "Configuration Appwrite manquante"
    }, 500);
  }

  try {
    // ==========================================
    // ÉTAPE 1 : EXTRACTION DES DONNÉES PADDLE
    // ==========================================

    let eventData = req.body;

    if (typeof req.body === "string") {
      try {
        eventData = JSON.parse(req.body);
      } catch (e) {
        return res.json({
          success: false,
          error: "Invalid JSON"
        }, 400);
      }
    }

    const data = eventData?.data || eventData;

    const teamId = data?.custom_data?.teamId;

    const priceId =
      data?.items?.[0]?.price?.id ||
      data?.price_id;

    log(`3. Données extraites: teamId=${teamId}, priceId=${priceId}`);

    if (!teamId || !priceId) {
      log("Données teamId ou priceId absentes");

      return res.json({
        success: true,
        message: "Missing teamId or priceId"
      }, 200);
    }

    // ==========================================
    // ÉTAPE A : TROUVER LE PLAN
    // ==========================================

    log("4. Recherche du plan...");

    const plansUrl =
      `${endpoint}/v1/databases/${dbId}/collections/plans/documents?limit=100`;

    const plansRes = await fetch(plansUrl, {
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey
      }
    });

    log(`5. Réponse Plans: status=${plansRes.status}`);

    if (!plansRes.ok) {
      const msg = await plansRes.text();

      log(`ERREUR PLANS: ${msg}`);

      return res.json({
        success: false,
        error: "Failed to fetch plans",
        details: msg
      }, 500);
    }

    const plansData = await plansRes.json();

    const matchedPlan = plansData.documents?.find(p =>
      p.paddlePriceIdMonthly === priceId ||
      p.paddlePriceIdYearly === priceId
    );

    if (!matchedPlan) {
      log(`Plan non trouvé pour priceId=${priceId}`);

      return res.json({
        success: false,
        error: "Plan not found"
      }, 404);
    }

    log(`6. Plan trouvé: ${matchedPlan.name}`);

    // ==========================================
    // ÉTAPE B : TROUVER LES SETTINGS
    // ==========================================

    log("7. Recherche des paramètres de l'équipe...");

    const query = JSON.stringify({
      method: "equal",
      attribute: "teamId",
      values: [teamId]
    });

    const params = new URLSearchParams();

    // IMPORTANT : queries[] et non queries
    params.append("queries[]", query);

    const settingsUrl =
      `${endpoint}/v1/databases/${dbId}/collections/company_settings/documents?${params.toString()}`;

    log(`URL Settings: ${settingsUrl}`);

    const settingsRes = await fetch(settingsUrl, {
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey
      }
    });

    log(`8. Réponse Settings: status=${settingsRes.status}`);

    if (!settingsRes.ok) {
      const msg = await settingsRes.text();

      log(`ERREUR SETTINGS: ${msg}`);

      return res.json({
        success: false,
        error: "Failed to fetch settings",
        details: msg
      }, 500);
    }

    const settingsData = await settingsRes.json();

    if (!settingsData.documents || settingsData.documents.length === 0) {
      log(`Aucun setting trouvé pour teamId=${teamId}`);

      return res.json({
        success: false,
        error: "Settings not found",
        teamId
      }, 404);
    }

    const settingsDocument = settingsData.documents[0];
    const docId = settingsDocument.$id;

    log(`9. Document trouvé: ${docId}`);

    // ==========================================
    // ÉTAPE C : PRÉPARER LA MISE À JOUR
    // ==========================================

    log("10. Préparation de la mise à jour...");

    const renewsAt =
      data.current_billing_period?.ends_at ||
      data.next_billed_at ||
      data.billing_period?.ends_at ||
      null;

    let subscriptionRenewsAt = null;

    if (renewsAt) {
      const date = new Date(renewsAt);

      if (!isNaN(date.getTime())) {
        subscriptionRenewsAt = date.toISOString();
      } else {
        log(`Date de renouvellement invalide: ${renewsAt}`);
      }
    }

    const updatePayload = {
      planTier: matchedPlan.name.toLowerCase(),

      subscriptionStatus:
        data.status === "trialing" ? "trialing" : "active",

      paddleSubscriptionId:
        data.subscription_id || data.id || null,

      paddleCustomerId:
        data.customer_id || null,

      subscriptionRenewsAt
    };

    log(`11. Données à mettre à jour: ${JSON.stringify(updatePayload)}`);

    // ==========================================
    // ÉTAPE D : METTRE À JOUR COMPANY_SETTINGS
    // ==========================================

    const updateUrl =
      `${endpoint}/v1/databases/${dbId}/collections/company_settings/documents/${docId}`;

    const updateRes = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        data: updatePayload
      })
    });

    log(`12. Réponse Update: status=${updateRes.status}`);

    if (!updateRes.ok) {
      const msg = await updateRes.text();

      log(`ERREUR UPDATE: ${msg}`);

      return res.json({
        success: false,
        error: "Update failed",
        details: msg
      }, 500);
    }

    const updatedDocument = await updateRes.json();

    // ==========================================
    // ÉTAPE E : CONFIRMATION
    // ==========================================

    log("13. 🎉 SUCCÈS : Abonnement mis à jour !");
    log(`Plan actif: ${updatedDocument.planTier}`);
    log(`Statut: ${updatedDocument.subscriptionStatus}`);
    log(`Document: ${updatedDocument.$id}`);

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
    log(`ERREUR CRITIQUE: ${err.message}`);

    error(err.stack || err.message);

    return res.json({
      success: false,
      error: err.message
    }, 500);
  }
};
