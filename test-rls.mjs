// test-rls.mjs — Test RLS via API REST direct (contourne le bug JWT du SDK)
const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = '6aacf8ec0010a7098203';          // ← ton project ID
const DB_ID = 'relancepro_db';               // ← ton database ID
const EMAIL = 'malvine@gmail.com'; // ← un compte RÉEL (team A)
const PASSWORD = 'Crepin1978@';       // ← son mot de passe

// 1️⃣ Créer une session via l'API REST
console.log('🔐 Création de session...');
const sessionRes = await fetch(`${ENDPOINT}/account/sessions/email`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': PROJECT_ID,
  },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});

if (!sessionRes.ok) {
  const err = await sessionRes.json();
  console.error('❌ Échec login:', err.message);
  process.exit(1);
}

const session = await sessionRes.json();
console.log(`✅ Connecté comme: ${session.userId}`);
console.log(`   Session ID: ${session.$id}`);

// 2️⃣ Le secret de session est NOTRE token d'authentification
const sessionSecret = session.secret;

// 3️⃣ Fonction helper pour requêtes authentifiées
const appwriteFetch = async (path, options = {}) => {
  const res = await fetch(`${ENDPOINT}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': PROJECT_ID,
      'X-Appwrite-Session': sessionSecret, // ← Le token qui authentifie comme utilisateur
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`HTTP ${res.status}: ${err.message}`);
  }
  return res.json();
};

// 4️⃣ Tester les collections SANS filtre teamId (scénario d'attaque)
console.log('\n🧪 Test RLS - Requêtes SANS filtre teamId\n');

const collections = ['invoices', 'quotes', 'clients'];
const results = {};

for (const col of collections) {
  try {
    const data = await appwriteFetch(
      `/databases/${DB_ID}/collections/${col}/documents?limit=1000`
    );
    
    const docs = data.documents || [];
    const teams = [...new Set(docs.map(d => d.teamId).filter(Boolean))];
    
    results[col] = { count: docs.length, teams };
    
    console.log(`📦 ${col} : ${docs.length} document(s)`);
    console.log(`   Teams visibles : ${teams.length === 0 ? '(aucune)' : teams.join(', ')}`);
    
    if (teams.length > 1) {
      console.log('   ❌ FUITE : plusieurs équipes visibles !');
    } else if (teams.length === 1) {
      console.log('   ⚠️ Une seule team — vérifier que c\'est bien la tienne');
    } else {
      console.log('   ✅ Aucun document accessible (RLS actif ou docs privés)');
    }
  } catch (e) {
    console.log(`\n📦 ${col} : bloqué par Appwrite ✅`);
    console.log(`   ${e.message}`);
    results[col] = { count: 0, teams: [], error: e.message };
  }
}

// 5️⃣ Test complémentaire : vérifier qu'on voit bien SES PROPRES documents
console.log('\n🔍 Vérification : documents avec TON teamId');
try {
  // D'abord, trouver le teamId de l'utilisateur connecté
  const teamsRes = await appwriteFetch('/teams');
  const userTeams = teamsRes.teams || [];
  console.log(`   Tu es membre de ${userTeams.length} équipe(s) Appwrite :`);
  userTeams.forEach(t => console.log(`     - ${t.name} (${t.$id})`));
  
  if (userTeams.length > 0) {
    const myTeamId = userTeams[0].$id;
    
    // Chercher les docs de cette team dans invoices
    const myDocs = await appwriteFetch(
      `/databases/${DB_ID}/collections/invoices/documents?limit=10&queries[]=${encodeURIComponent(JSON.stringify({ method: 'equal', attribute: 'teamId', values: [myTeamId] }))}`
    );
    console.log(`\n   📋 Tes factures visibles : ${myDocs.documents?.length || 0}`);
  }
} catch (e) {
  console.log(`   ⚠️ ${e.message}`);
}

// 6️⃣ Nettoyer la session
console.log('\n🧹 Nettoyage session...');
try {
  await fetch(`${ENDPOINT}/account/sessions/${session.$id}`, {
    method: 'DELETE',
    headers: {
      'X-Appwrite-Project': PROJECT_ID,
      'X-Appwrite-Session': sessionSecret,
    },
  });
  console.log('   ✅ Session fermée');
} catch (e) {
  console.log('   ⚠️ Session non fermée (non critique)');
}

console.log('\n🏁 Test terminé\n');

// 7️⃣ Diagnostic final
console.log('📊 DIAGNOSTIC :');
const hasLeak = Object.values(results).some(r => r.teams && r.teams.length > 1);
const hasAccess = Object.values(results).some(r => r.count > 0);

if (hasLeak) {
  console.log('   🔴 CRITIQUE : Fuite multi-tenant détectée !');
  console.log('      Des documents de plusieurs équipes sont visibles.');
  console.log('      → Exécuter migrate-rls.mjs en urgence.');
} else if (hasAccess) {
  console.log('   🟡 PARTIEL : Tu vois des documents (d\'une seule team).');
  console.log('      → Si c\'est TA team : normal.');
  console.log('      → Si c\'est une AUTRE team : permissions mal configurées.');
} else {
  console.log('   🟢 BON : Aucune fuite détectée.');
  console.log('      → Mais vérifie que tes propres documents sont bien visibles.');
}