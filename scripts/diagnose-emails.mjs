import { Client, Databases, Users, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('6aacf8ec0010a7098203')
  .setKey('standard_85b1c2940c934f7344ca18942563ced42af8df90739edf9b434b498c01136169918ebe2e8a39491ad83820d164ff00b169ca79f8fd497b140e62528ca65609f8eac2adc16c4cbc508279b5e8d4ba3b5b2f9786071b4d290e08e391d75754ebd1e32bf1dc8f2d4d40aea7bd593c1f5706859a98b91bec2e160da6066643537059');

const databases = new Databases(client);
const users = new Users(client);
const DATABASE_ID = 'relancepro_db';

const problematicEmails = ['lea@gmail.com', 'trio@gmail.com'];

console.log('🔍 Diagnostic des emails problématiques...\n');

// 1. Chercher les documents team_members avec ces emails
for (const email of problematicEmails) {
  console.log(`\n━━━ Email: ${email} ━━━`);
  
  try {
    const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [
      Query.equal('email', email),
      Query.limit(5)
    ]);

    if (membersRes.documents.length === 0) {
      console.log('❌ Aucun document team_members trouvé avec cet email');
      continue;
    }

    for (const member of membersRes.documents) {
      console.log(`\n📄 Document trouvé:`);
      console.log(`   docId: ${member.$id}`);
      console.log(`   userId: ${member.userId}`);
      console.log(`   status: ${member.status}`);
      console.log(`   teamId: ${member.teamId}`);
      console.log(`   email brut: "${member.email}"`);
      console.log(`   caractères: ${JSON.stringify(member.email?.split('').map(c => `${c}(${c.charCodeAt(0)})`))}`);

      // 2. Essayer de récupérer l'utilisateur Appwrite
      if (member.userId && member.userId !== 'pending') {
        try {
          const appwriteUser = await users.get(member.userId);
          console.log(`\n👤 Utilisateur Appwrite trouvé:`);
          console.log(`   userId: ${appwriteUser.$id}`);
          console.log(`   email: "${appwriteUser.email}"`);
          console.log(`   name: ${appwriteUser.name}`);
          console.log(`   status: ${appwriteUser.status}`);
          
          if (appwriteUser.email !== member.email) {
            console.log(`\n⚠️ MISMATCH: L'email dans team_members ("${member.email}") diffère de l'email Appwrite ("${appwriteUser.email}")`);
          }
        } catch (e) {
          console.log(`\n❌ Utilisateur Appwrite introuvable pour userId ${member.userId}`);
          console.log(`   Erreur: ${e.message}`);
          console.log(`   Code: ${e.code}`);
        }
      }
    }
  } catch (e) {
    console.log(`❌ Erreur lors de la recherche: ${e.message}`);
  }
}

console.log('\n\n📋 Résumé des actions recommandées:');
console.log('1. Si les utilisateurs Appwrite existent avec un email différent → mettre à jour team_members');
console.log('2. Si les utilisateurs Appwrite n\'existent pas → supprimer les documents team_members orphelins');
console.log('3. Si les emails sont corrects mais mal encodés → corriger manuellement dans Appwrite Console');