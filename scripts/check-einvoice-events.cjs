require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB = process.env.VITE_APPWRITE_DATABASE_ID;

(async () => {
  console.log('🔍 Diagnostic einvoice_events...\n');

  // 1. Attributs
  try {
    const attrs = await databases.listAttributes(DB, 'einvoice_events');
    console.log(`📋 ${attrs.attributes.length} attribut(s) :`);
    attrs.attributes.forEach(a =>
      console.log(`   - ${a.key} (${a.type}) status=${a.status} required=${a.required}`)
    );
    const notAvailable = attrs.attributes.filter(a => a.status !== 'available');
    if (notAvailable.length > 0) {
      console.warn('\n⚠️ Attributs non disponibles :', notAvailable.map(a => `${a.key} (${a.status})`).join(', '));
    }
  } catch (e) {
    console.error('❌ Erreur attributs:', e.message);
  }

  // 2. Documents
  try {
    const docs = await databases.listDocuments(DB, 'einvoice_events');
    console.log(`\n📄 ${docs.total} document(s) enregistré(s) :`);
    if (docs.total === 0) {
      console.log('   → Collection VIDE : les événements passés ont été rejetés.');
      console.log('   → Il faut RE-TRANSMETTRE une e-facture pour générer des événements.');
    } else {
      docs.documents.forEach(d =>
        console.log(`   - ${d.invoiceNumber} | ${d.eventType} | ${d.status} | ${d.eventDate || 'SANS DATE'}`)
      );
    }
  } catch (e) {
    console.error('❌ Erreur documents:', e.message);
  }

  console.log('\n🎉 Diagnostic terminé.');
})();