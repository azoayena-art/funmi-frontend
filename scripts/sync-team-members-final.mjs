import { Client, Teams, Databases, Users, Query } from 'node-appwrite';

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================
const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('6aacf8ec0010a7098203')
  .setKey('standard_85b1c2940c934f7344ca18942563ced42af8df90739edf9b434b498c01136169918ebe2e8a39491ad83820d164ff00b169ca79f8fd497b140e62528ca65609f8eac2adc16c4cbc508279b5e8d4ba3b5b2f9786071b4d290e08e391d75754ebd1e32bf1dc8f2d4d40aea7bd593c1f5706859a98b91bec2e160da6066643537059');

const teams = new Teams(client);
const databases = new Databases(client);
const users = new Users(client);

const DATABASE_ID = 'relancepro_db';
const CUSTOM_TEAM_ID = '6ac4c02c00293611f4a1';
const APPWRITE_TEAM_ID = '6ac4c02c0007d55b5a10';
const OWNER_USER_ID = '6ac4c026002aa6d19a14';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('🚀 SYNC TEAM MEMBERS → APPWRITE NATIVE (userId only)');
console.log('═'.repeat(60));
console.log(`Team: MALVINE`);
console.log(`appwriteTeamId: ${APPWRITE_TEAM_ID}`);
console.log('═'.repeat(60));

// ============================================================
// Étape 1 : Vérification de la team native
// ============================================================
console.log('\n━━━ Étape 1 : Vérification ━━━');
try {
  const nativeTeam = await teams.get(APPWRITE_TEAM_ID);
  console.log(`✅ Team native: ${nativeTeam.name} (${nativeTeam.total} membres)`);
} catch (e) {
  console.log(`❌ ${e.message}`);
  process.exit(1);
}

// ============================================================
// Étape 2 : Membres actifs
// ============================================================
console.log('\n━━━ Étape 2 : Membres actifs ━━━');
const activeMembers = await databases.listDocuments(
  DATABASE_ID,
  'team_members',
  [
    Query.equal('status', 'active'),
    Query.equal('teamId', CUSTOM_TEAM_ID),
    Query.limit(100)
  ]
);
console.log(`✅ ${activeMembers.documents.length} membre(s) actif(s)`);

// ============================================================
// Étape 3 : Membres natifs actuels
// ============================================================
console.log('\n━━━ Étape 3 : Membres natifs actuels ━━━');
let existingNativeMembers = [];
try {
  const nativeMembersRes = await teams.listMemberships(APPWRITE_TEAM_ID, [Query.limit(100)]);
  existingNativeMembers = nativeMembersRes.memberships;
  console.log(`✅ ${existingNativeMembers.length} membre(s) natif(s)`);
  existingNativeMembers.forEach(m => {
    console.log(`   • ${m.userId} - confirmé: ${m.confirm}`);
  });
} catch (e) {
  console.log(`⚠️ ${e.message}`);
}

// ============================================================
// Étape 4 : Synchronisation (APPROCHE USERID ONLY)
// ============================================================
console.log('\n━━━ Étape 4 : Synchronisation ━━━');
let ok = 0, fixed = 0, alreadyExists = 0, failed = 0, skipped = 0;

for (const member of activeMembers.documents) {
  console.log(`\n👤 ${member.email || 'sans email'} (${member.userId})`);
  console.log('─'.repeat(50));

  if (member.userId === OWNER_USER_ID) {
    console.log('   ⏭️  Propriétaire, skip');
    skipped++;
    continue;
  }

  if (!member.userId || member.userId === 'pending') {
    console.log('   ⏭️  userId pending, skip');
    skipped++;
    continue;
  }

  // Déjà membre natif ?
  const existingMember = existingNativeMembers.find(m => m.userId === member.userId);
  
  if (existingMember && existingMember.confirm) {
    console.log('   ✅ Déjà membre confirmé');
    alreadyExists++;
    continue;
  }

  if (existingMember && !existingMember.confirm) {
    console.log('   🗑️  Suppression membership pending...');
    try {
      await teams.deleteMembership(APPWRITE_TEAM_ID, existingMember.$id);
      console.log('   ✅ Supprimé');
    } catch (e) {
      console.log(`   ⚠️ ${e.message}`);
    }
    await sleep(500);
  }

  // ✅ APPROCHE : Création avec userId UNIQUEMENT (sans email)
  console.log('   🔧 Création membership (userId uniquement)...');
  try {
    const newMembership = await teams.createMembership(
      APPWRITE_TEAM_ID,
      ['member'],
      'https://cloud.appwrite.io',
      undefined,        // ← PAS d'email
      member.userId     // ← Juste l'userId
    );
    
    console.log(`   ✅ Membership créé: ${newMembership.$id}`);
    console.log(`   🔑 Secret: ${newMembership.secret.substring(0, 10)}...`);

    // Confirmation immédiate
    console.log('   🔐 Confirmation...');
    await teams.updateMembership(
      APPWRITE_TEAM_ID,
      newMembership.$id,
      member.userId,
      newMembership.secret
    );
    
    console.log('   ✅ Membership confirmé !');
    fixed++;

  } catch (e) {
    console.log(`   ❌ Échec: ${e.message}`);
    console.log(`      Code: ${e.code}, Type: ${e.type}`);
    failed++;
  }

  await sleep(300);
}

// ============================================================
// 📊 RAPPORT FINAL
// ============================================================
console.log('\n');
console.log('═'.repeat(60));
console.log('📊 RAPPORT FINAL');
console.log('═'.repeat(60));
console.log(`✅ ${alreadyExists} déjà confirmé(s)`);
console.log(`🔧 ${fixed} ajouté(s) et confirmé(s)`);
console.log(`⏭️  ${skipped} ignoré(s)`);
console.log(`❌ ${failed} échec(s)`);
console.log('═'.repeat(60));

if (fixed > 0) {
  console.log('\n🎉 SUCCÈS ! Membres ajoutés à la team native.');
  console.log('   Appwrite Console → Teams → MALVINE → Members');
}

if (failed > 0) {
  console.log('\n⚠️  Échecs détectés, consulter logs.');
}

console.log('\n✨ Terminé !');