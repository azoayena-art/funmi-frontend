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
  console.log('⏳ Attente que l\'attribut teamId soit disponible...\n');
  
  // Attendre que teamId soit "available"
  for (let i = 0; i < 15; i++) {
    try {
      const res = await databases.listAttributes(DB, 'followups');
      const teamIdAttr = res.attributes.find(a => a.key === 'teamId');
      if (teamIdAttr && teamIdAttr.status === 'available') {
        console.log('✅ teamId est disponible !\n');
        break;
      }
      console.log(`   ... teamId status: ${teamIdAttr?.status || 'inconnu'} (${i * 2}s)`);
    } catch (e) {
      console.warn('   Erreur vérification:', e.message);
    }
    await sleep(2000);
  }

  // Créer l'index
  try {
    await databases.createIndex(DB, 'followups', 'idx_teamId', 'key', ['teamId'], ['ASC']);
    console.log('✅ Index idx_teamId créé avec succès !');
  } catch (e) {
    if (e.code === 409) console.log('️  Index idx_teamId existe déjà');
    else console.error('❌ Index idx_teamId:', e.message);
  }

  console.log('\n Terminé !');
})();