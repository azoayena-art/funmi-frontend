import { Client, Users, Teams, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('6aacf8ec0010a7098203')
  .setKey('standard_85b1c2940c934f7344ca18942563ced42af8df90739edf9b434b498c01136169918ebe2e8a39491ad83820d164ff00b169ca79f8fd497b140e62528ca65609f8eac2adc16c4cbc508279b5e8d4ba3b5b2f9786071b4d290e08e391d75754ebd1e32bf1dc8f2d4d40aea7bd593c1f5706859a98b91bec2e160da6066643537059');

const users = new Users(client);
const teams = new Teams(client);

const APPWRITE_TEAM_ID = '6ac4c02c0007d55b5a10';
const userIds = [
  { id: '6ac4d7fb002fac2a338b', expected: 'lea@gmail.com' },
  { id: '6ac4db67002e2fda3467', expected: 'trio@gmail.com' }
];

console.log('🔬 VÉRIFICATION DES USERS APPWRITE\n');

for (const u of userIds) {
  console.log(`\n━━━ User ${u.id} ━━━`);
  try {
    const user = await users.get(u.id);
    console.log(`  ID: ${user.$id}`);
    console.log(`  Name: "${user.name}"`);
    console.log(`  Email: "${user.email}"`);
    console.log(`  Phone: "${user.phone}"`);
    console.log(`  Status: ${user.status}`);
    console.log(`  EmailVerification: ${user.emailVerification}`);
    console.log(`  Labels: ${JSON.stringify(user.labels)}`);
    console.log(`  Prefs: ${JSON.stringify(user.prefs)}`);
    console.log(`  Registration: ${user.registration}`);
    console.log(`  PasswordUpdate: ${user.passwordUpdate}`);
    
    // Comparer avec l'email attendu
    const emailMatch = user.email === u.expected;
    console.log(`  Match avec attendu: ${emailMatch ? '✅' : '❌'}`);
    
    // Codes caractères de l'email stocké
    console.log(`  Chars email: ${user.email?.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(',')}`);
    
  } catch (e) {
    console.log(`  ❌ Erreur: ${e.message}`);
  }
}

// Test 2 : Essayer createMembership avec phone au lieu d'email
console.log('\n\n━━━ Test createMembership via PHONE ━━━');
try {
  const user = await users.get(userIds[0].id);
  if (user.phone) {
    console.log(`Tentative avec phone: ${user.phone}`);
    const membership = await teams.createMembership(
      APPWRITE_TEAM_ID,
      ['member'],
      'https://cloud.appwrite.io',
      undefined, // pas d'email
      userIds[0].id,
      user.phone // phone à la place
    );
    console.log(`✅ SUCCESS via phone: ${membership.$id}`);
  } else {
    console.log(`❌ Pas de phone pour cet utilisateur`);
  }
} catch (e) {
  console.log(`❌ Échec: ${e.message}`);
}