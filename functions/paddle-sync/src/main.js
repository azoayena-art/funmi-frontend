
export default async ({ req, res, log, error }) => {
  log("🚀 TEST APPWRITE REST - DÉBUT");

  // ============================================================
  // 1. CONFIGURATION
  // ============================================================

  let endpoint = (
    process.env.APPWRITE_ENDPOINT ||
    "https://fra.cloud.appwrite.io"
  ).trim().replace(/\/+$/, "");

  // Normaliser l'endpoint : ajouter /v1 exactement une fois
  endpoint = endpoint.replace(/(?:\/v1)+$/i, "");
  endpoint += "/v1";

  const projectId = (process.env.APPWRITE_PROJECT_ID || "").trim();
  const apiKey = (process.env.APPWRITE_API_KEY || "").trim();
  const dbId = (
    process.env.APPWRITE_DATABASE_ID || "relancepro_db"
  ).trim();

  log("1. Vérification des variables");
  log(`Endpoint API : ${endpoint}`);
  log(`Project ID : ${projectId ? "PRÉSENT" : "ABSENT"}`);
  log(`API Key : ${apiKey ? "PRÉSENTE" : "ABSENTE"}`);
  log(`Database ID : ${dbId}`);

  if (!projectId || !apiKey || !dbId) {
    error("❌ Variables Appwrite manquantes");

    return res.json({
      success: false,
      message: "Variables Appwrite manquantes"
    }, 500);
  }

  // ============================================================
  // 2. FONCTION REST APPWRITE
  // ============================================================

  const appwriteRequest = async (url, label) => {
    log(`📡 ${label}`);
    log(`URL : ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
        "Content-Type": "application/json"
      }
    });

    const responseText = await response.text();

    log(`Statut HTTP : ${response.status}`);

    // Limiter les logs pour éviter les réponses trop volumineuses
    log(`Réponse : ${responseText.slice(0, 2000)}`);

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = {
        rawResponse: responseText.slice(0, 2000)
      };
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  };

  try {
    // ============================================================
    // TEST A : LECTURE DE LA BASE
    // ============================================================

    log("2. TEST A : lecture de la base de données");

    const databaseUrl =
      `${endpoint}/databases/${encodeURIComponent(dbId)}`;

    const databaseResult = await appwriteRequest(
      databaseUrl,
      "Lecture de la base"
    );

    if (!databaseResult.ok) {
      error("❌ ÉCHEC DE LECTURE DE LA BASE");

      return res.json({
        success: false,
        step: "lecture_database",
        status: databaseResult.status,
        response: databaseResult.data
      }, 500);
    }

    log(`✅ Base trouvée : ${databaseResult.data.name}`);

    // ============================================================
    // TEST B : LECTURE DE LA COLLECTION PLANS
    // ============================================================

    log("3. TEST B : lecture de la collection plans");

    const query = encodeURIComponent(
      JSON.stringify({
        method: "limit",
        values: [5]
      })
    );

    const collectionUrl =
      `${endpoint}/databases/${encodeURIComponent(dbId)}` +
      `/collections/plans/documents?queries[]=${query}`;

    const plansResult = await appwriteRequest(
      collectionUrl,
      "Lecture des documents plans"
    );

    if (!plansResult.ok) {
      error("❌ ÉCHEC DE LECTURE DE LA COLLECTION PLANS");

      return res.json({
        success: false,
        step: "lecture_plans",
        status: plansResult.status,
        response: plansResult.data,
        database: databaseResult.data.name
      }, 500);
    }

    const documents = plansResult.data.documents || [];

    log(
      `✅ Collection lue : ${plansResult.data.total} document(s)`
    );

    // ============================================================
    // 4. RÉSULTAT FINAL
    // ============================================================

    log("🎉 TOUS LES TESTS SONT RÉUSSIS");

    return res.json({
      success: true,
      message: "Connexion Appwrite REST réussie",
      endpoint,
      database: databaseResult.data.name,
      totalPlans: plansResult.data.total,
      plans: documents.map(plan => ({
        id: plan.$id,
        name: plan.name,
        monthlyPrice: plan.paddlePriceIdMonthly,
        yearlyPrice: plan.paddlePriceIdYearly
      }))
    }, 200);

  } catch (err) {
    error("❌ ERREUR GÉNÉRALE");
    error(`Message : ${err.message || "Inconnu"}`);
    error(`Stack : ${err.stack || "Non disponible"}`);

    return res.json({
      success: false,
      step: "requete_rest",
      message: err.message || "Erreur inconnue",
      type: err.name || null
    }, 500);
  }
};
