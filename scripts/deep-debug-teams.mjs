import { Client, Teams, Databases, Users, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('6aacf8ec0010a7098203')
  .setKey('standard_85b1c2940c934f7344ca18942563ced42af8df90739edf9b434b498c01136169918ebe2e8a39491ad83820d164ff00b169ca79f8fd497b140e62528ca65609f8eac2adc16c4cbc508279b5e8d4ba3b5b2f9786071b4d290e08e391d75754ebd1e32bf1dc8f2d4d40aea7bd593c1f5706859a98b91bec2e160da6066643537059');

const teams = new Teams(client);
const databases = new Databases(client);
const users = new Users(client);
const DATABASE_ID = 'relancepro_db';

// L'ID de ta team Appwrite native (trouvé dans le diagnostic précédent)
const APPWRITE_TEAM_ID = '6ac4c02c00293611f4a1';

const problemEmails = [
  { email: 'lea@gmail.com', userId: '6ac4d7fb002fac2a338b', docId: '6ac4d7e000221e74b599' },
  { email: 'trio@gmail.com', userId: '6ac4db67002e2fda3467', docId: '6ac4db4b00261402d934' }
];

console.log('🔬 DIAGNOSTIC APPROFONDI DES MEMBRES PROBLÉMATIQUES\n');

// Étape 1 : Lister TOUS les membres de la team native (sans filtre)
console.log('━━━ Étape 1 : Tous les membres de la team native ━━━');
try {
  const allMembers = await teams.listMemberships(APPWRITE_TEAM_ID, [Query.limit(100)]);
  console.log(`Total de membres natifs: ${allMembers.total}`);
  console.log('\nListe complète:');
  allMembers.memberships.forEach(m => {
    console.log(`  • ${m.$id} | userId: ${m.userId} | email: ${m.userEmail || 'N/A'} | confirm: ${m.confirm} | roles: ${m.roles?.join(',')} | invited: ${m.invited}`);
  });
} catch (e) {
  console.log('❌ Erreur listage:', e.message);
}

// Étape 2 : Pour chaque utilisateur problématique, vérifier où il est
console.log('\n\n━━━ Étape 2 : Analyse détaillée par utilisateur ━━━');

for (const problem of problemEmails) {
  console.log(`\n🎯 Utilisateur: ${problem.email} (${problem.userId})`);
  console.log('─'.repeat(60));

  // 2a. Lister toutes les teams de cet utilisateur
  console.log('\n📋 Teams de cet utilisateur:');
  try {
    // Il faut utiliser une approche différente : chercher dans toutes les teams
    // Appwrite ne permet pas de lister les teams d'un user directement
    // On va essayer de l'inviter et voir l'erreur exacte
  } catch (e) {
    console.log('  Erreur:', e.message);
  }

  // 2b. Tenter de créer le membership et capturer l'erreur COMPLÈTE
  console.log('\n🧪 Tentative createMembership directe:');
  try {
    const result = await teams.createMembership(
      APPWRITE_TEAM_ID,
      ['member'],
      'https://cloud.appwrite.io',
      problem.email,
      problem.userId
    );
    console.log('  ✅ Membership créé:', result.$id);
  } catch (e) {
    console.log('  ❌ Échec createMembership:');
    console.log(`     Code: ${e.code}`);
    console.log(`     Type: ${e.type}`);
    console.log(`     Message: ${e.message}`);
    console.log(`     Response: ${JSON.stringify(e.response)}`);
    
    // Analyse de l'erreur
    if (e.code === 400 && e.message.includes('email')) {
      console.log('\n  💡 DIAGNOSTIC: Appwrite refuse l\'email mais il est valide.');
      console.log('     Cela signifie que l\'utilisateur est DÉJÀ membre de cette team.');
    }
  }

  // 2c. Essayer avec juste l'userId (sans email)
  console.log('\n🧪 Tentative avec seulement userId:');
  try {
    const result = await teams.createMembership(
      APPWRITE_TEAM_ID,
      ['member'],
      'https://cloud.appwrite.io',
      undefined, // pas d'email
      problem.userId
    );
    console.log('  ✅ Membership créé avec userId seul:', result.$id);
  } catch (e) {
    console.log('  ❌ Échec:', e.message);
    if (e.code === 409) {
      console.log('  💡 Code 409 = Conflict: L\'utilisateur est DÉJÀ membre !');
    }
  }

  // 2d. Chercher dans la liste complète si l'utilisateur est déjà là
  console.log('\n🔎 Recherche dans la liste complète des membres:');
  try {
    const allMembers = await teams.listMemberships(APPWRITE_TEAM_ID, [Query.limit(100)]);
    const found = allMembers.memberships.find(m => m.userId === problem.userId);
    if (found) {
      console.log(`  ✅ TROUVÉ ! Membership ID: ${found.$id}`);
      console.log(`     Confirm: ${found.confirm}`);
      console.log(`     Roles: ${found.roles?.join(',')}`);
      console.log(`     Invited: ${found.invited}`);
      console.log(`     Joined: ${found.joined}`);
      
      // Si pas confirmé, confirmer maintenant
      if (!found.confirm && found.secret) {
        console.log('\n  🔧 Tentative de confirmation...');
        try {
          await teams.updateMembership(
            APPWRITE_TEAM_ID,
            found.$id,
            problem.userId,
            found.secret
          );
          console.log('  ✅ Membership confirmé !');
        } catch (e2) {
          console.log('  ❌ Échec confirmation:', e2.message);
          console.log('  💡 Le secret a expiré. Il faut recréer le membership.');
        }
      } else if (!found.confirm) {
        console.log('  ⚠️ Membership pending sans secret accessible.');
        console.log('  💡 Solution: supprimer ce membership et en recréer un.');
      }
    } else {
      console.log('  ❌ Utilisateur PAS trouvé dans les membres de la team.');
      console.log('  💡 Étrange : l\'email est valide mais Appwrite refuse de l\'ajouter.');
    }
  } catch (e) {
    console.log('  Erreur recherche:', e.message);
  }
}

console.log('\n\n📋 RÉSUMÉ ET SOLUTIONS');
console.log('═'.repeat(60));
console.log('Si les utilisateurs sont DÉJÀ membres (trouvés dans la liste):');
console.log('  → Confirmer le membership si pas confirmé');
console.log('  → Ou supprimer + recréer si le secret a expiré');
console.log('\nSi les utilisateurs ne sont PAS dans la liste mais createMembership échoue:');
console.log('  → Utiliser Appwrite Console pour les ajouter manuellement');
console.log('  → Ou supprimer leur compte + recréer + réinviter');