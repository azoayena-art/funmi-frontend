import { Client, Teams, Databases, Query, Users } from 'node-appwrite';

const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('6aacf8ec0010a7098203')
  .setKey('standard_85b1c2940c934f7344ca18942563ced42af8df90739edf9b434b498c01136169918ebe2e8a39491ad83820d164ff00b169ca79f8fd497b140e62528ca65609f8eac2adc16c4cbc508279b5e8d4ba3b5b2f9786071b4d290e08e391d75754ebd1e32bf1dc8f2d4d40aea7bd593c1f5706859a98b91bec2e160da6066643537059'); // scopes : teams.read, teams.write, databases.read, users.read

const teams = new Teams(client);
const databases = new Databases(client);
const users = new Users(client); // ✅ NOUVEAU : pour récupérer les vrais emails
const DATABASE_ID = 'relancepro_db';

// ✅ Fonction de validation/nettoyage email
const cleanEmail = (email) => {
  if (!email) return null;
  // Supprimer espaces, tabulations, retours à la ligne
  const cleaned = email.trim().toLowerCase().replace(/[\r\n\t]/g, '');
  // Regex email standard
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(cleaned) && cleaned.length <= 254 ? cleaned : null;
};

// 1. Équipes custom -> team native
const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.limit(100)]);
const teamById = new Map(teamsRes.documents.map(t => [t.$id, t]));

// 2. Tous les membres actifs
const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [
  Query.equal('status', 'active'),
  Query.limit(500),
]);

let ok = 0, fixed = 0, skipped = 0, failed = 0;
const emailIssues = []; // ✅ Stockage des emails problématiques

for (const m of membersRes.documents) {
  const teamDoc = teamById.get(m.teamId);
  if (!teamDoc) { console.log('⚠️ équipe introuvable:', m.teamId); failed++; continue; }
  if (!m.userId || m.userId === 'pending') { console.log('⚠️ userId pending:', m.email); skipped++; continue; }

  const appwriteTeamId = teamDoc.appwriteTeamId;
  const roles = teamDoc.ownerId === m.userId ? ['owner'] : ['member'];

  // ✅ Nettoyage de l'email
  let email = cleanEmail(m.email);
  
  // ✅ Si email invalide, récupérer l'email depuis Appwrite Users
  if (!email && m.userId) {
    try {
      const appwriteUser = await users.get(m.userId);
      email = cleanEmail(appwriteUser.email);
      if (email) {
        console.log(`🔧 Email corrigé depuis Appwrite Users pour ${m.userId}: ${email}`);
        // Optionnel : mettre à jour le document team_members avec le bon email
        await databases.updateDocument(DATABASE_ID, 'team_members', m.$id, { email });
      }
    } catch (e) {
      console.log(`⚠️ Impossible de récupérer l'user ${m.userId}:`, e.message);
    }
  }

  if (!email) {
    console.log(`❌ Email invalide pour ${m.userId}: "${m.email}" (longueur: ${m.email?.length || 0}, chars: ${JSON.stringify(m.email?.split('').map(c => c.charCodeAt(0)))})`);
    emailIssues.push({ userId: m.userId, email: m.email, docId: m.$id });
    failed++;
    continue;
  }

  try {
    const native = await teams.listMemberships(appwriteTeamId, [Query.equal('userId', m.userId)]);
    const existing = native.memberships[0];

    if (existing && existing.confirm) {
      console.log('✅ déjà membre natif:', email);
      ok++;
      continue;
    }

    if (existing && !existing.confirm) {
      await teams.deleteMembership(appwriteTeamId, existing.$id);
      console.log('🗑️ membership pending supprimé:', email);
    }

    const created = await teams.createMembership(
      appwriteTeamId,
      roles,
      'https://cloud.appwrite.io',
      email,
      m.userId
    );
    await teams.updateMembership(appwriteTeamId, created.$id, m.userId, created.secret);
    console.log('🔧 ajouté à la team native:', email);
    fixed++;
  } catch (e) {
    console.log('❌ échec:', email, '-', e.message);
    failed++;
  }
}

console.log(`\n📊 Rapport final :`);
console.log(`  ✅ ${ok} déjà membres natifs`);
console.log(`  🔧 ${fixed} corrigés`);
console.log(`  ⏭️ ${skipped} ignorés`);
console.log(`  ❌ ${failed} échecs`);

if (emailIssues.length > 0) {
  console.log(`\n⚠️ Emails problématiques détectés (${emailIssues.length}) :`);
  emailIssues.forEach((issue, i) => {
    console.log(`  ${i + 1}. docId: ${issue.docId}, userId: ${issue.userId}`);
    console.log(`     email brut: "${issue.email}"`);
    console.log(`     caractères: ${JSON.stringify(issue.email?.split('').map(c => `${c}(${c.charCodeAt(0)})`))}`);
  });
  console.log(`\n💡 Action recommandée : corriger ces emails dans Appwrite Console → Databases → relancepro_db → team_members`);
}