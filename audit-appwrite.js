// audit-appwrite.js
// Script d'audit Appwrite pour diagnostiquer les problèmes de permissions
// Usage : node audit-appwrite.js

const { Client, Databases, Teams, Permission, Role, ID, Query } = require('appwrite');

// ⚠️ CONFIGUREZ CES VARIABLES
const config = {
  endpoint: 'https://cloud.appwrite.io/v1', // Votre endpoint
  projectId: '6aacf8ec0010a7098203',            // Votre Project ID
  databaseId: 'relancepro_db',          // Votre Database ID
  userEmail: 'azoayena@gmail.com',             // Email de test
  userPassword: 'Godomey1978@',       // Mot de passe de test
};

async function auditAppwrite() {
  console.log('🔍 DÉMARRAGE AUDIT APPWRITE\n');
  console.log('='.repeat(60));

  const client = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId);

  const databases = new Databases(client);
  const teams = new Teams(client);

  try {
    // ============================================================
    // TEST 1 : Connexion
    // ============================================================
    console.log('\n📋 TEST 1 : Connexion à Appwrite...');
    
    // Note: Pour un audit complet, vous devriez utiliser une session existante
    // ou créer un utilisateur de test. Ici on suppose que vous avez un JWT.
    console.log('⚠️  Utilisez une session existante ou créez un utilisateur de test.');
    
    // ============================================================
    // TEST 2 : Vérifier les formats de permissions générés
    // ============================================================
    console.log('\n📋 TEST 2 : Formats de permissions générés par le SDK...');
    
    const testTeamId = '6ab9495000191542af6e';
    const testUserId = '6ab9494f0031205d5bda';
    
    console.log('\n🔐 Permissions générées avec Role.team():');
    const teamPerms = [
      Permission.read(Role.team(testTeamId)),
      Permission.update(Role.team(testTeamId)),
      Permission.delete(Role.team(testTeamId)),
    ];
    teamPerms.forEach((perm, i) => {
      console.log(`   ${i + 1}. "${perm}"`);
      console.log(`      Type: ${typeof perm}`);
      console.log(`      Longueur: ${perm.length}`);
    });
    
    console.log('\n🔐 Permissions générées avec Role.user():');
    const userPerms = [
      Permission.read(Role.user(testUserId)),
      Permission.update(Role.user(testUserId)),
      Permission.delete(Role.user(testUserId)),
    ];
    userPerms.forEach((perm, i) => {
      console.log(`   ${i + 1}. "${perm}"`);
    });
    
    console.log('\n🔐 Permissions générées avec Role.any():');
    const anyPerms = [
      Permission.read(Role.any()),
    ];
    anyPerms.forEach((perm, i) => {
      console.log(`   ${i + 1}. "${perm}"`);
    });
    
    // ============================================================
    // TEST 3 : Vérifier les formats attendus par Appwrite
    // ============================================================
    console.log('\n📋 TEST 3 : Formats attendus par Appwrite (selon votre erreur)...');
    
    const expectedFormats = [
      'any',
      'users',
      `user:${testUserId}`,
      `user:${testUserId}/unverified`,
      'users/unverified',
      `team:${testTeamId}`,
      'member:6ab9495089a126a41b2d',
      `team:${testTeamId}/owner`
    ];
    
    console.log('\n✅ Formats VALIDES attendus :');
    expectedFormats.forEach((format, i) => {
      console.log(`   ${i + 1}. "${format}"`);
    });
    
    // ============================================================
    // TEST 4 : Comparaison des formats
    // ============================================================
    console.log('\n📋 TEST 4 : Comparaison SDK vs Attendu...');
    
    const generatedTeamPerm = Permission.read(Role.team(testTeamId));
    const expectedTeamPerm = `read("team:${testTeamId}")`;
    
    console.log(`\n   Généré : "${generatedTeamPerm}"`);
    console.log(`   Attendu: "${expectedTeamPerm}"`);
    console.log(`   Match  : ${generatedTeamPerm === expectedTeamPerm ? '✅ OUI' : '❌ NON'}`);
    
    // ============================================================
    // TEST 5 : Lister les équipes
    // ============================================================
    console.log('\n📋 TEST 5 : Liste des équipes Appwrite natives...');
    
    try {
      const teamsList = await teams.list();
      console.log(`\n   Nombre d'équipes: ${teamsList.total}`);
      teamsList.teams.forEach((team, i) => {
        console.log(`   ${i + 1}. ${team.name} (ID: ${team.$id})`);
      });
      
      // Vérifier si l'équipe cible existe
      const targetTeam = teamsList.teams.find(t => t.$id === testTeamId);
      if (targetTeam) {
        console.log(`\n   ✅ Équipe cible trouvée: ${targetTeam.name}`);
        
        // Lister les membres
        try {
          const memberships = await teams.listMemberships(testTeamId);
          console.log(`\n   👥 Membres de l'équipe (${memberships.total}):`);
          memberships.memberships.forEach((member, i) => {
            console.log(`      ${i + 1}. ${member.userName || member.userEmail} (ID: ${member.$id}, Rôles: ${member.roles.join(', ')})`);
          });
        } catch (memberErr) {
          console.log(`   ❌ Erreur liste membres: ${memberErr.message}`);
        }
      } else {
        console.log(`\n   ❌ Équipe cible INTROUVABLE: ${testTeamId}`);
      }
    } catch (teamErr) {
      console.log(`   ❌ Erreur liste équipes: ${teamErr.message}`);
      console.log('   💡 Astuce: Vérifiez votre JWT/session ou utilisez la console Appwrite');
    }
    
    // ============================================================
    // TEST 6 : Vérifier la collection clients
    // ============================================================
    console.log('\n📋 TEST 6 : Vérification de la collection "clients"...');
    
    try {
      const collection = await databases.getCollection(config.databaseId, 'clients');
      console.log(`\n   ✅ Collection trouvée: ${collection.name}`);
      console.log(`   📊 Permissions de collection: ${JSON.stringify(collection.collectionSecurity, null, 2)}`);
      console.log(`   🔐 Document Security: ${collection.documentSecurity ? '✅ Activé' : '❌ Désactivé'}`);
      
      if (!collection.documentSecurity) {
        console.log('\n   ⚠️  ATTENTION: documentSecurity est DÉSACTIVÉ !');
        console.log('   💡 Cela signifie que les permissions de collection s\'appliquent à TOUS les documents.');
        console.log('   💡 Activez "Document Security" dans la console Appwrite pour utiliser les permissions par document.');
      }
    } catch (colErr) {
      console.log(`   ❌ Erreur: ${colErr.message}`);
    }
    
    // ============================================================
    // RÉSUMÉ ET RECOMMANDATIONS
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSUMÉ DE L\'AUDIT\n');
    
    console.log('🔍 PROBLÈME IDENTIFIÉ :');
    console.log('   Le SDK génère probablement un format incorrect.');
    console.log('   Ou "Document Security" est désactivé sur la collection.\n');
    
    console.log('✅ SOLUTIONS À TESTER :');
    console.log('   1. Activez "Document Security" sur la collection "clients"');
    console.log('   2. Utilisez le format string direct au lieu de Role.team()');
    console.log('   3. Vérifiez que l\'utilisateur est bien membre de l\'équipe native\n');
    
    console.log('🛠️  CODE DE SECOURS (à tester dans Clients.tsx) :');
    console.log(`
   // Option A : Format string direct
   const perms = [
     \`read("team:\${currentTeamId}")\`,
     \`update("team:\${currentTeamId}")\`,
     \`delete("team:\${currentTeamId}")\`
   ];
   
   // Option B : Permissions minimales (pour test)
   const perms = [
     Permission.read(Role.any()),  // ⚠️ TEST UNIQUEMENT
   ];
   
   // Option C : Permissions utilisateur
   const perms = [
     \`read("user:\${user.$id}")\`,
     \`update("user:\${user.$id}")\`,
     \`delete("user:\${user.$id}")\`
   ];
    `);
    
  } catch (error) {
    console.error('\n❌ ERREUR AUDIT:', error.message);
    console.error('Détails:', error);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 FIN DE L\'AUDIT');
}

auditAppwrite();