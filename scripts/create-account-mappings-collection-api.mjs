// ============================================================
// 📦 Script avec API REST - Version corrigée
// ============================================================

// ✅ Configuration directe
const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = '6aacf8ec0010a7098203';
const DATABASE_ID = 'relancepro_db';
const COLLECTION_ID = 'account_mappings';

// ✅ TA CLÉ API ICI (remplace par la tienne)
const API_KEY = 'standard_6beae62f8607169482d2bb7ff20f34a0f2a2100cfb30af418e28f4e11cc235fd6e3f10d393afeeb18686c9c24b7eeb09dce9adb2f608a0eb85a8195b5b38c4bb236000333b46f45e77bb2d462440d8aa1cabd613c6742c3dc302f0e90911daa4e7b696c89ce8e2c813d46ef0872e5a1d139e98ddf5ab3270dd58002df70c58a3'; // ← Colle ta clé ici

if (!API_KEY || API_KEY === '' || API_KEY.startsWith('standardxx')) {
  console.error('❌ APPWRITE_API_KEY manquant ou invalide');
  console.log('\n💡 Éditez ce fichier et collez votre clé API dans la variable API_KEY');
  process.exit(1);
}

console.log('🚀 Démarrage avec :');
console.log(`   Endpoint : ${ENDPOINT}`);
console.log(`   Project : ${PROJECT_ID}`);
console.log(`   Database : ${DATABASE_ID}\n`);

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': PROJECT_ID,
  'X-Appwrite-Key': API_KEY,
};

// ============================================================
// 1. CRÉER LA COLLECTION
// ============================================================
console.log('📁 Création de la collection...');
const createRes = await fetch(`${ENDPOINT}/databases/${DATABASE_ID}/collections`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    collectionId: COLLECTION_ID,
    name: 'Plan Comptable Personnalisé',
    permissions: [], // ⚠️ VIDE : permissions au niveau document uniquement
    documentSecurity: true, // ✅ Sécurité par document activée
  }),
});

if (!createRes.ok) {
  const err = await createRes.json();
  console.error('❌ Erreur création collection:', err.message);
  process.exit(1);
}

console.log('✅ Collection créée\n');

// ============================================================
// 2. CRÉER LES ATTRIBUTS
// ============================================================
console.log('🔧 Création des attributs...');

const attributes = [
  { key: 'teamId', type: 'string', size: 100, required: true },
  { key: 'category', type: 'string', size: 50, required: true },
  { key: 'accountNumber', type: 'string', size: 20, required: true },
  { key: 'accountLabel', type: 'string', size: 200, required: false },
  { key: 'isDefault', type: 'boolean', default: true, required: false },
  { key: 'updatedAt', type: 'datetime', required: false },
];

for (const attr of attributes) {
  console.log(`  → ${attr.key}...`);
  const body = { key: attr.key, required: attr.required };
  
  if (attr.type === 'string') body.size = attr.size;
  if (attr.type === 'boolean') body.default = attr.default;

  const res = await fetch(
    `${ENDPOINT}/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/attributes/${attr.type}`,
    { method: 'POST', headers, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const err = await res.json();
    console.log(`    ⚠️  ${err.message}`);
  } else {
    console.log(`    ✅ ${attr.key} créé`);
  }
}

console.log('\n⏳ Attente propagation (5s)...');
await new Promise(r => setTimeout(r, 5000));

// ============================================================
// 3. CRÉER LES INDEX
// ============================================================
console.log('\n📇 Création des index...');

const indexes = [
  {
    key: 'idx_team_category',
    type: 'unique',
    attributes: ['teamId', 'category'],
    orders: ['ASC', 'ASC'],
  },
  {
    key: 'idx_teamId',
    type: 'key',
    attributes: ['teamId'],
    orders: ['ASC'],
  },
];

for (const idx of indexes) {
  console.log(`  → ${idx.key}...`);
  const res = await fetch(
    `${ENDPOINT}/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/indexes`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(idx),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    console.log(`    ⚠️  ${err.message}`);
  } else {
    console.log(`    ✅ ${idx.key} créé`);
  }
}

console.log('\n════════════════════════════════════════════════════');
console.log('🎉 COLLECTION CRÉÉE AVEC SUCCÈS !');
console.log('════════════════════════════════════════════════════');
console.log(`📁 Collection : ${COLLECTION_ID}`);
console.log(`🗄️  Base : ${DATABASE_ID}`);
console.log(`📋 Attributs : ${attributes.map(a => a.key).join(', ')}`);
console.log(`📇 Index : idx_team_category, idx_teamId`);
console.log(`🔒 Sécurité : documentSecurity activée`);
console.log('════════════════════════════════════════════════════\n');

console.log('💡 Prochaines étapes :');
console.log('   1. Redémarrez votre application : npm run dev');
console.log('   2. Connectez-vous et allez sur /account-mapping');
console.log('   3. Personnalisez votre Plan Comptable Général\n');
console.log('⚠️  IMPORTANT : Supprimez votre clé API du fichier après usage !\n');