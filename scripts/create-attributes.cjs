// ============================================================
// 🛠️ SCRIPT DE CRÉATION DES ATTRIBUTS APPWRITE
// Usage : node scripts/create-attributes.js
// ============================================================

const sdk = require('node-appwrite');

// ⚠️ CONFIGUREZ CES VARIABLES
const config = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: '6aacf8ec0010a7098203',
  apiKey: 'standard_6beae62f8607169482d2bb7ff20f34a0f2a2100cfb30af418e28f4e11cc235fd6e3f10d393afeeb18686c9c24b7eeb09dce9adb2f608a0eb85a8195b5b38c4bb236000333b46f45e77bb2d462440d8aa1cabd613c6742c3dc302f0e90911daa4e7b696c89ce8e2c813d46ef0872e5a1d139e98ddf5ab3270dd58002df70c58a3', // ← COLLEZ VOTRE CLÉ API
  databaseId: 'relancepro_db',
};

// ============================================================
// 📋 DÉFINITION DES ATTRIBUTS PAR COLLECTION
// ============================================================

const collectionsSchema = {
  // ----------------------------------------------------------
  // company_settings
  // ----------------------------------------------------------
  company_settings: [
    { key: 'userId', type: 'string', size: 255, required: false },
    { key: 'teamId', type: 'string', size: 255, required: true },
    { key: 'name', type: 'string', size: 255, required: false },
    { key: 'legalForm', type: 'string', size: 255, required: false },
    { key: 'address', type: 'string', size: 500, required: false },
    { key: 'siret', type: 'string', size: 50, required: false },
    { key: 'rcs', type: 'string', size: 50, required: false },
    { key: 'tvaNumber', type: 'string', size: 50, required: false },
    { key: 'phone', type: 'string', size: 50, required: false },
    { key: 'email', type: 'string', size: 255, required: false },
    { key: 'defaultTvaRate', type: 'string', size: 10, required: false },
    { key: 'customUnits', type: 'string', size: 65535, required: false },
    { key: 'tvaRates', type: 'string', size: 65535, required: false },
    { key: 'logoFileId', type: 'string', size: 255, required: false },
    { key: 'publicSlug', type: 'string', size: 255, required: false },
    { key: 'createdAt', type: 'string', size: 255, required: false },
  ],

  // ----------------------------------------------------------
  // categories
  // ----------------------------------------------------------
  categories: [
    { key: 'teamId', type: 'string', size: 255, required: true },
    { key: 'userId', type: 'string', size: 255, required: false },
    { key: 'name', type: 'string', size: 255, required: true },
    { key: 'description', type: 'string', size: 5000, required: false },
    { key: 'status', type: 'string', size: 50, required: false },
  ],

  // ----------------------------------------------------------
  // products
  // ----------------------------------------------------------
  products: [
    { key: 'teamId', type: 'string', size: 255, required: true },
    { key: 'userId', type: 'string', size: 255, required: false },
    { key: 'categoryId', type: 'string', size: 255, required: false },
    { key: 'reference', type: 'string', size: 100, required: false },
    { key: 'name', type: 'string', size: 255, required: true },
    { key: 'description', type: 'string', size: 5000, required: false },
    { key: 'unit', type: 'string', size: 50, required: false },
    { key: 'unitPrice', type: 'string', size: 50, required: false },
    { key: 'tvaRate', type: 'string', size: 20, required: false },
    { key: 'status', type: 'string', size: 50, required: false },
  ],

  // ----------------------------------------------------------
  // clients
  // ----------------------------------------------------------
  clients: [
    { key: 'teamId', type: 'string', size: 255, required: true },
    { key: 'userId', type: 'string', size: 255, required: false },
    { key: 'clientId', type: 'string', size: 100, required: false },
    { key: 'type', type: 'string', size: 50, required: false },
    { key: 'country', type: 'string', size: 10, required: false },
    { key: 'firstName', type: 'string', size: 255, required: false },
    { key: 'lastName', type: 'string', size: 255, required: false },
    { key: 'companyName', type: 'string', size: 255, required: false },
    { key: 'email', type: 'string', size: 255, required: false },
    { key: 'phone', type: 'string', size: 50, required: false },
    { key: 'address', type: 'string', size: 500, required: false },
    { key: 'billingAddress', type: 'string', size: 500, required: false },
    { key: 'siren', type: 'string', size: 20, required: false },
    { key: 'siret', type: 'string', size: 20, required: false },
    { key: 'vatNumber', type: 'string', size: 50, required: false },
    { key: 'taxNumber', type: 'string', size: 50, required: false },
    { key: 'notes', type: 'string', size: 10000, required: false },
    { key: 'status', type: 'string', size: 50, required: false },
    { key: 'prospectId', type: 'string', size: 255, required: false },
  ],

  // ----------------------------------------------------------
  // prospects
  // ----------------------------------------------------------
  prospects: [
    { key: 'teamId', type: 'string', size: 255, required: true },
    { key: 'userId', type: 'string', size: 255, required: false },
    { key: 'firstName', type: 'string', size: 255, required: false },
    { key: 'lastName', type: 'string', size: 255, required: false },
    { key: 'companyName', type: 'string', size: 255, required: false },
    { key: 'email', type: 'string', size: 255, required: false },
    { key: 'phone', type: 'string', size: 50, required: false },
    { key: 'address', type: 'string', size: 500, required: false },
    { key: 'source', type: 'string', size: 100, required: false },
    { key: 'status', type: 'string', size: 50, required: false },
    { key: 'needs', type: 'string', size: 10000, required: false },
    { key: 'notes', type: 'string', size: 10000, required: false },
    { key: 'country', type: 'string', size: 10, required: false },
    { key: 'siren', type: 'string', size: 20, required: false },
    { key: 'siret', type: 'string', size: 20, required: false },
    { key: 'vatNumber', type: 'string', size: 50, required: false },
    { key: 'firstContactDate', type: 'string', size: 255, required: false },
    { key: 'lastContactDate', type: 'string', size: 255, required: false },
  ],

  // ----------------------------------------------------------
  // team_members
  // ----------------------------------------------------------
  team_members: [
    { key: 'teamId', type: 'string', size: 255, required: true },
    { key: 'userId', type: 'string', size: 255, required: false },
    { key: 'roleId', type: 'string', size: 255, required: false },
    { key: 'email', type: 'string', size: 255, required: true },
    { key: 'name', type: 'string', size: 255, required: false },
    { key: 'status', type: 'string', size: 50, required: false },
    { key: 'invitedAt', type: 'string', size: 255, required: false },
    { key: 'joinedAt', type: 'string', size: 255, required: false },
    { key: 'invitedBy', type: 'string', size: 255, required: false },
    { key: 'archivedAt', type: 'string', size: 255, required: false },
    { key: 'restoredAt', type: 'string', size: 255, required: false },
    { key: 'roleChangedAt', type: 'string', size: 255, required: false },
  ],

  // ----------------------------------------------------------
  // roles
  // ----------------------------------------------------------
  roles: [
    { key: 'teamId', type: 'string', size: 255, required: true },
    { key: 'name', type: 'string', size: 255, required: true },
    { key: 'permissions', type: 'string', size: 65535, required: false },
    { key: 'isDefault', type: 'boolean', required: false },
    { key: 'createdAt', type: 'string', size: 255, required: false },
  ],

  // ----------------------------------------------------------
  // users
  // ----------------------------------------------------------
  users: [
    { key: 'userId', type: 'string', size: 255, required: true },
    { key: 'firstName', type: 'string', size: 255, required: false },
    { key: 'lastName', type: 'string', size: 255, required: false },
    { key: 'email', type: 'string', size: 255, required: false },
    { key: 'companyName', type: 'string', size: 255, required: false },
    { key: 'trade', type: 'string', size: 255, required: false },
    { key: 'phone', type: 'string', size: 50, required: false },
    { key: 'country', type: 'string', size: 10, required: false },
    { key: 'role', type: 'string', size: 50, required: false },
    { key: 'createdAt', type: 'string', size: 255, required: false },
  ],
};

// ============================================================
// 🚀 SCRIPT PRINCIPAL
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🛠️  CRÉATION DES ATTRIBUTS APPWRITE         ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Vérifier la configuration
  if (config.apiKey === 'VOTRE_CLE_API_ICI') {
    console.error('❌ ERREUR : Veuillez configurer votre clé API dans le script !');
    console.error('   Ouvrez scripts/create-attributes.js et remplacez VOTRE_CLE_API_ICI');
    process.exit(1);
  }

  // Initialiser le client Appwrite
  const client = new sdk.Client();
  client
    .setEndpoint(config.endpoint)
    .setProject(config.projectId)
    .setKey(config.apiKey);

  const databases = new sdk.Databases(client);

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Parcourir chaque collection
  for (const [collectionId, attributes] of Object.entries(collectionsSchema)) {
    console.log(`\n📦 Collection : ${collectionId}`);
    console.log('─'.repeat(50));

    try {
      // Récupérer les attributs existants
      const existingAttrs = await databases.listAttributes(
        config.databaseId,
        collectionId
      );
      const existingKeys = existingAttrs.attributes.map(a => a.key);

      console.log(`   📋 ${existingKeys.length} attributs existants`);

      // Créer les attributs manquants
      for (const attr of attributes) {
        if (existingKeys.includes(attr.key)) {
          console.log(`   ⏭️  ${attr.key} — existe déjà`);
          totalSkipped++;
          continue;
        }

        try {
          if (attr.type === 'string') {
            await databases.createStringAttribute(
              config.databaseId,
              collectionId,
              attr.key,
              attr.size,
              attr.required
            );
          } else if (attr.type === 'boolean') {
            await databases.createBooleanAttribute(
              config.databaseId,
              collectionId,
              attr.key,
              attr.required
            );
          } else if (attr.type === 'integer') {
            await databases.createIntegerAttribute(
              config.databaseId,
              collectionId,
              attr.key,
              attr.required
            );
          } else if (attr.type === 'float') {
            await databases.createFloatAttribute(
              config.databaseId,
              collectionId,
              attr.key,
              attr.required
            );
          }

          console.log(`   ✅ ${attr.key} — créé`);
          totalCreated++;

          // Attendre un peu pour éviter le rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (attrError) {
          if (attrError.code === 409) {
            console.log(`   ⏭️  ${attr.key} — existe déjà (conflit)`);
            totalSkipped++;
          } else {
            console.error(`   ❌ ${attr.key} — erreur : ${attrError.message}`);
            totalErrors++;
          }
        }
      }

    } catch (collectionError) {
      if (collectionError.code === 404) {
        console.log(`   ⚠️  Collection introuvable — création...`);
        
        try {
          await databases.createCollection(
            config.databaseId,
            collectionId,
            collectionId
          );
          console.log(`   ✅ Collection créée`);
          
          // Créer les attributs
          for (const attr of attributes) {
            try {
              if (attr.type === 'string') {
                await databases.createStringAttribute(
                  config.databaseId,
                  collectionId,
                  attr.key,
                  attr.size,
                  attr.required
                );
              } else if (attr.type === 'boolean') {
                await databases.createBooleanAttribute(
                  config.databaseId,
                  collectionId,
                  attr.key,
                  attr.required
                );
              }
              console.log(`   ✅ ${attr.key} — créé`);
              totalCreated++;
              await new Promise(resolve => setTimeout(resolve, 300));
            } catch (e) {
              console.error(`   ❌ ${attr.key} — ${e.message}`);
              totalErrors++;
            }
          }
        } catch (createError) {
          console.error(`   ❌ Impossible de créer la collection : ${createError.message}`);
          totalErrors++;
        }
      } else {
        console.error(`   ❌ Erreur : ${collectionError.message}`);
        totalErrors++;
      }
    }
  }

  // Résumé final
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  📊 RÉSUMÉ                                   ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  ✅ Attributs créés    : ${String(totalCreated).padStart(3)}                ║`);
  console.log(`║  ⏭️  Attributs ignorés  : ${String(totalSkipped).padStart(3)}                ║`);
  console.log(`║  ❌ Erreurs            : ${String(totalErrors).padStart(3)}                ║`);
  console.log('╚══════════════════════════════════════════════╝');

  if (totalErrors === 0) {
    console.log('\n🎉 Tous les attributs ont été créés avec succès !');
    console.log('   Vous pouvez maintenant tester votre application.\n');
  } else {
    console.log('\n⚠️  Certaines erreurs sont survenues. Vérifiez les logs ci-dessus.\n');
  }
}

// Lancer le script
main().catch(error => {
  console.error('\n💥 Erreur fatale :', error.message);
  process.exit(1);
});