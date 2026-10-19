import { Client, Teams, Databases, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('6aacf8ec0010a7098203')
  .setKey('standard_85b1c2940c934f7344ca18942563ced42af8df90739edf9b434b498c01136169918ebe2e8a39491ad83820d164ff00b169ca79f8fd497b140e62528ca65609f8eac2adc16c4cbc508279b5e8d4ba3b5b2f9786071b4d290e08e391d75754ebd1e32bf1dc8f2d4d40aea7bd593c1f5706859a98b91bec2e160da6066643537059');

const teams = new Teams(client);
const databases = new Databases(client);
const DATABASE_ID = 'relancepro_db';

console.log('🔬 RECHERCHE DES VRAIS APPWRITE TEAM IDs\n');

// Étape 1 : Lister tous les documents `teams` de la base custom
console.log('━━━ Étape 1 : Documents teams dans la base ━━━');
try {
  const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.limit(100)]);
  console.log(`Total: ${teamsRes.documents.length} équipe(s)\n`);
  
  teamsRes.documents.forEach((t, i) => {
    console.log(`Équipe ${i + 1}:`);
    console.log(`  customTeamId (doc.$id): ${t.$id}`);
    console.log(`  appwriteTeamId: ${t.appwriteTeamId || '❌ MANQUANT'}`);
    console.log(`  name: ${t.name}`);
    console.log(`  ownerId: ${t.ownerId}`);
    console.log('');
  });
} catch (e) {
  console.log('❌ Erreur:', e.message);
}

// Étape 2 : Lister les teams natives Appwrite existantes
console.log('\n━━━ Étape 2 : Teams natives Appwrite ━━━');
try {
  const nativeTeams = await teams.list([Query.limit(100)]);
  console.log(`Total: ${nativeTeams.total} team(s) native(s)\n`);
  
  nativeTeams.teams.forEach((t, i) => {
    console.log(`Team native ${i + 1}:`);
    console.log(`  ID: ${t.$id}`);
    console.log(`  name: ${t.name}`);
    console.log(`  total: ${t.total} membre(s)`);
    console.log('');
  });
} catch (e) {
  console.log('❌ Erreur:', e.message);
}

// Étape 3 : Corrélation customTeamId ↔ appwriteTeamId
console.log('\n━━━ Étape 3 : Corrélation ━━━');
try {
  const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.limit(100)]);
  const nativeTeams = await teams.list([Query.limit(100)]);
  
  teamsRes.documents.forEach(t => {
    const nativeExists = nativeTeams.teams.find(nt => nt.$id === t.appwriteTeamId);
    console.log(`customTeamId: ${t.$id}`);
    console.log(`  appwriteTeamId: ${t.appwriteTeamId}`);
    console.log(`  Existe en natif: ${nativeExists ? '✅ OUI' : '❌ NON'}`);
    if (nativeExists) {
      console.log(`  Nom natif: ${nativeExists.name}`);
      console.log(`  Membres natifs: ${nativeExists.total}`);
    }
    console.log('');
  });
} catch (e) {
  console.log('❌ Erreur:', e.message);
}

console.log('\n📋 PROCHAINE ÉTAPE');
console.log('Utilise le VRAI appwriteTeamId (celui qui existe en natif) dans le script sync.');