require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB = process.env.VITE_APPWRITE_DATABASE_ID;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('🔧 Correction de metadataVersion...\n');

  // 1. Vérifier l'état actuel des attributs
  let attributes = [];
  try {
    const res = await databases.listAttributes(DB, 'invoice_metadata');
    attributes = res.attributes;
    console.log(' Attributs actuels :', attributes.map(a => `${a.key}(${a.type}, status=${a.status})`).join(', '));
  } catch (e) {
    console.error('❌ Impossible de lire les attributs:', e.message);
    process.exit(1);
  }

  const existing = attributes.find(a => a.key === 'metadataVersion');

  // 2. Si l'attribut existe, on essaie de le supprimer
  if (existing) {
    console.log(`\n️ Suppression de metadataVersion (type: ${existing.type}, status: ${existing.status})...`);
    try {
      await databases.deleteAttribute(DB, 'invoice_metadata', 'metadataVersion');
      console.log('✅ Suppression lancée');
    } catch (e) {
      if (e.code === 404) {
        console.log('ℹ️ Attribut déjà supprimé');
      } else {
        console.error(' Erreur suppression:', e.message);
        console.log('\n⚠️ Solution manuelle : allez dans Appwrite Console → Databases → invoice_metadata → Attributes → supprimez metadataVersion manuellement');
        process.exit(1);
      }
    }

    // 3. Attendre que la suppression soit effective (jusqu'à 30s)
    console.log('⏳ Attente de la suppression effective...');
    let deleted = false;
    for (let i = 0; i < 15; i++) {
      await sleep(2000);
      try {
        const res = await databases.listAttributes(DB, 'invoice_metadata');
        const stillThere = res.attributes.find(a => a.key === 'metadataVersion');
        if (!stillThere) {
          deleted = true;
          console.log(`✅ Suppression effective après ${i * 2}s`);
          break;
        }
        console.log(`   ... encore en cours (${stillThere.status})`);
      } catch (e) {
        console.warn('️ Erreur vérification:', e.message);
      }
    }

    if (!deleted) {
      console.error('\n❌ L\'attribut n\'a pas été supprimé après 30s.');
      console.log(' Solution : allez dans Appwrite Console → Databases → relancepro_db → invoice_metadata → Attributes → supprimez metadataVersion manuellement, puis relancez ce script.');
      process.exit(1);
    }
  } else {
    console.log('\nℹ️ metadataVersion n\'existe pas, on peut créer directement.');
  }

  // 4. Créer le nouvel attribut integer
  console.log('\n Création de metadataVersion (integer)...');
  try {
    await databases.createIntegerAttribute(
      DB,
      'invoice_metadata',
      'metadataVersion',
      false,  // required
      0,      // default
      0,      // min
      999999  // max
    );
    console.log('✅ metadataVersion (integer) créé avec default=0, min=0, max=999999');
  } catch (e) {
    if (e.code === 409) {
      console.log('⏭️  metadataVersion existe déjà (peut-être recréé automatiquement)');
    } else {
      console.error('❌ metadataVersion:', e.message);
      process.exit(1);
    }
  }

  console.log('\n🎉 Terminé !');
})();