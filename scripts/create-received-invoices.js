import { Client, Databases, ID } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY); // Clé API serveur

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID;

async function createCollection() {
  try {
    await databases.createCollection(DATABASE_ID, 'received_invoices', 'received_invoices', [], false);
    console.log('✅ Collection créée');

    const attributes = [
      { key: 'teamId', type: 'string', size: 255, required: true },
      { key: 'userId', type: 'string', size: 255, required: true },
      { key: 'invoiceNumber', type: 'string', size: 100, required: true },
      { key: 'supplierName', type: 'string', size: 255, required: true },
      { key: 'supplierSiret', type: 'string', size: 50, required: false },
      { key: 'issueDate', type: 'string', size: 50, required: true },
      { key: 'dueDate', type: 'string', size: 50, required: false },
      { key: 'subtotal', type: 'double', required: false },
      { key: 'tax', type: 'double', required: false },
      { key: 'total', type: 'double', required: true },
      { key: 'currencyCode', type: 'string', size: 10, required: true },
      { key: 'xmlContent', type: 'string', size: 1000000, required: false },
      { key: 'pdfFileId', type: 'string', size: 255, required: false },
      { key: 'status', type: 'string', size: 50, required: true },
      { key: 'format', type: 'string', size: 50, required: false },
      { key: 'extractedAt', type: 'string', size: 50, required: false },
      { key: 'validatedBy', type: 'string', size: 255, required: false },
      { key: 'validatedAt', type: 'string', size: 50, required: false },
      { key: 'rejectionReason', type: 'string', size: 2000, required: false },
    ];

    for (const attr of attributes) {
      await databases.createStringAttribute(
        DATABASE_ID, 'received_invoices', attr.key, attr.size, attr.required
      ).catch(async () => {
        // Si c'est un double, utiliser createDoubleAttribute
        if (attr.type === 'double') {
          await databases.createDoubleAttribute(
            DATABASE_ID, 'received_invoices', attr.key, attr.required
          );
        }
      });
      console.log(`  ✓ Attribut ${attr.key}`);
    }

    console.log('✅ Attributs créés. Créez les index manuellement dans la console.');
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
}

createCollection();