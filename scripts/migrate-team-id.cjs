/**
 * Script de migration : deplace les documents du teamId fantome
 * vers la vraie equipe AYENA, et met a jour leurs permissions.
 *
 * Usage : node scripts/migrate-team-id.cjs
 */

require('dotenv').config();
const { Client, Databases, Permission, Role, Query } = require('node-appwrite');

// Recuperation robuste des variables (avec ou sans prefixe VITE_)
const getEnv = (...names) => {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return undefined;
};

const ENDPOINT = getEnv('APPWRITE_ENDPOINT', 'VITE_APPWRITE_ENDPOINT') || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = getEnv('APPWRITE_PROJECT_ID', 'VITE_APPWRITE_PROJECT_ID');
const API_KEY = getEnv('APPWRITE_API_KEY', 'VITE_APPWRITE_API_KEY');
const DATABASE_ID = getEnv('APPWRITE_DATABASE_ID', 'VITE_APPWRITE_DATABASE_ID') || 'relancepro_db';

const OLD_TEAM_ID = getEnv('OLD_TEAM_ID') || '6ab9495100015e7f39bf';
const NEW_TEAM_ID = getEnv('NEW_TEAM_ID') || '6ab9495000191542af6e';

const COLLECTIONS = [
  'plans',
  'activation_keys',
  'licenses',
  'clients',
  'quote_items',
  'invoices',
  'invoice_items',
  'followups',
  'followup_rules',
  'notifications',
  'prospects',
  'quotes',
  'company_settings',
  'teams',
  'roles',
  'team_members',
  'categories',
  'products',
  'reminders',
  'receipts',
  'audit_logs',
  'invoice_metadata',
  'invoice_payments',
  'accounting_events',
  'received_invoices',
  'einvoice_settings',
];

console.log('=======================================================');
console.log('MIGRATION DES TEAM IDS');
console.log('=======================================================');
console.log('   Endpoint    : ' + ENDPOINT);
console.log('   Project ID  : ' + (PROJECT_ID || 'MANQUANT'));
console.log('   API Key     : ' + (API_KEY ? API_KEY.substring(0, 10) + '...' + API_KEY.substring(API_KEY.length - 5) : 'MANQUANT'));
console.log('   Database ID : ' + DATABASE_ID);
console.log('   Ancien teamId : ' + OLD_TEAM_ID);
console.log('   Nouveau teamId: ' + NEW_TEAM_ID);
console.log('=======================================================\n');

const missing = [];
if (!ENDPOINT) missing.push('APPWRITE_ENDPOINT');
if (!PROJECT_ID) missing.push('APPWRITE_PROJECT_ID ou VITE_APPWRITE_PROJECT_ID');
if (!API_KEY) missing.push('APPWRITE_API_KEY');
if (!DATABASE_ID) missing.push('APPWRITE_DATABASE_ID');

if (missing.length > 0) {
  console.error('ERREUR : Variables manquantes dans .env :');
  missing.forEach(v => console.error('   - ' + v));
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

async function listAllDocuments(collectionId) {
  const allDocs = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    try {
      const res = await databases.listDocuments(DATABASE_ID, collectionId, [
        Query.limit(limit),
        Query.offset(offset),
      ]);
      if (res.documents.length === 0) break;
      allDocs.push(...res.documents);
      if (res.documents.length < limit) break;
      offset += limit;
    } catch (e) {
      console.warn('  Impossible de lister ' + collectionId + ' : ' + e.message);
      return [];
    }
  }

  return allDocs;
}

function buildPermissions(teamId) {
  return [
    Permission.read(Role.team(teamId)),
    Permission.update(Role.team(teamId)),
    Permission.delete(Role.team(teamId)),
  ];
}

async function migrateCollection(collectionId) {
  console.log('\nCollection : ' + collectionId);

  const docs = await listAllDocuments(collectionId);
  if (docs.length === 0) {
    console.log('  Aucun document dans cette collection');
    return { migrated: 0, errors: 0 };
  }

  console.log('  ' + docs.length + ' document(s) total');

  const toMigrate = docs.filter(doc => {
    if (doc.teamId === OLD_TEAM_ID) return true;
    const perms = doc.$permissions || [];
    return perms.some(p => p.includes(OLD_TEAM_ID));
  });

  if (toMigrate.length === 0) {
    console.log('  Aucun document a migrer (deja sur le bon teamId)');
    return { migrated: 0, errors: 0 };
  }

  console.log('  ' + toMigrate.length + ' document(s) a migrer');

  let migrated = 0;
  let errors = 0;

  for (const doc of toMigrate) {
    try {
      await databases.updateDocument(
        DATABASE_ID,
        collectionId,
        doc.$id,
        { teamId: NEW_TEAM_ID },
        buildPermissions(NEW_TEAM_ID)
      );
      migrated++;
      if (migrated % 10 === 0) {
        console.log('  ' + migrated + ' documents migres...');
      }
    } catch (e) {
      errors++;
      console.error('  Erreur sur ' + doc.$id + ' : ' + e.message);
    }
  }

  console.log('  Resultat : ' + migrated + ' migre(s), ' + errors + ' erreur(s)');
  return { migrated, errors };
}

async function main() {
  let totalMigrated = 0;
  let totalErrors = 0;

  for (const collection of COLLECTIONS) {
    const result = await migrateCollection(collection);
    totalMigrated += result.migrated;
    totalErrors += result.errors;
  }

  console.log('\n=======================================================');
  console.log('MIGRATION TERMINEE');
  console.log('   Total migre  : ' + totalMigrated);
  console.log('   Total erreurs: ' + totalErrors);
  console.log('=======================================================');

  if (totalErrors > 0) {
    console.warn('\nDes erreurs sont survenues. Verifiez les logs ci-dessus.');
  } else if (totalMigrated > 0) {
    console.log('\nTous les documents ont ete migres avec succes !');
    console.log('\nProchaines etapes :');
    console.log('   1. Rechargez votre application (Ctrl+F5)');
    console.log('   2. Verifiez la console du navigateur (F12)');
    console.log('   3. Verifiez que vos factures s\'affichent');
    console.log('   4. Supprimez la cle API dans Appwrite Console');
  } else {
    console.log('\nAucun document a migrer. Tout est deja correct !');
  }
}

main().catch(e => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});