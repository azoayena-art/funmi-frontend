import { Client, Users, Teams } from 'node-appwrite';

const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('6aacf8ec0010a7098203')
  .setKey('standard_85b1c2940c934f7344ca18942563ced42af8df90739edf9b434b498c01136169918ebe2e8a39491ad83820d164ff00b169ca79f8fd497b140e62528ca65609f8eac2adc16c4cbc508279b5e8d4ba3b5b2f9786071b4d290e08e391d75754ebd1e32bf1dc8f2d4d40aea7bd593c1f5706859a98b91bec2e160da6066643537059');

const users = new Users(client);
const teams = new Teams(client);

const APPWRITE_TEAM_ID = '6ac4c02c0007d55b5a10';
const userIds = [
  '6ac4d7fb002fac2a338b', // lea
  '6ac4db67002e2fda3467'  // trio
];

console.log('🔐 VÉRIFICATION DES EMAILS + AJOUT TEAM\n');

for (const userId of userIds) {
  console.log(`\n━━━ User ${userId} ━━━`);
  
  try {
    // 1. Vérifier l'email
    console.log('  🔐 Vérification email...');
    await users.updateEmailVerification(userId, true);
    console.log('  ✅ Email marqué comme vérifié');
    
    // 2. Créer le membership
    console.log('  🔧 Création membership...');
    const membership = await teams.createMembership(
      APPWRITE_TEAM_ID,
      ['member'],
      'https://cloud.appwrite.io',
      undefined,  // pas d'email
      userId
    );
    console.log(`  ✅ Membership créé: ${membership.$id}`);
    
    // 3. Confirmer le membership
    console.log('  🔐 Confirmation...');
    await teams.updateMembership(
      APPWRITE_TEAM_ID,
      membership.$id,
      userId,
      membership.secret
    );
    console.log('  ✅ Membership confirmé !');
    
  } catch (e) {
    console.log(`  ❌ Échec: ${e.message}`);
    console.log(`     Code: ${e.code}`);
  }
}

// 4. Vérification finale
console.log('\n\n━━━ Vérification finale ━━━');
try {
  const team = await teams.get(APPWRITE_TEAM_ID);
  console.log(`✅ Team ${team.name}: ${team.total} membre(s)`);
  
  const members = await teams.listMemberships(APPWRITE_TEAM_ID);
  members.memberships.forEach(m => {
    console.log(`  • ${m.userId} - ${m.userEmail || 'N/A'} - confirmé: ${m.confirm}`);
  });
} catch (e) {
  console.log(`❌ ${e.message}`);
}

console.log('\n✨ Terminé !');