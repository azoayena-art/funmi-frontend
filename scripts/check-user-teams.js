// scripts/check-user-teams.js
import { databases, DATABASE_ID } from '../src/appwrite';
import { Query } from 'appwrite';

const USER_ID = '6ab9494f0031205d5bda';

async function checkUserTeams() {
  console.log('🔍 Vérification des équipes pour user:', USER_ID);
  
  // 1. Équipes où l'utilisateur est owner
  console.log('\n📋 Équipes où vous êtes OWNER :');
  try {
    const ownerTeams = await databases.listDocuments(DATABASE_ID, 'teams', [
      Query.equal('ownerId', USER_ID)
    ]);
    
    if (ownerTeams.documents.length === 0) {
      console.log('  ❌ Aucune équipe trouvée');
    } else {
      ownerTeams.documents.forEach(team => {
        console.log(`  ✅ ${team.name || 'Sans nom'} (${team.$id})`);
      });
    }
  } catch (e) {
    console.error('  Erreur:', e.message);
  }
  
  // 2. Équipes où l'utilisateur est membre
  console.log('\n📋 Équipes où vous êtes MEMBRE :');
  try {
    const memberships = await databases.listDocuments(DATABASE_ID, 'team_members', [
      Query.equal('userId', USER_ID)
    ]);
    
    if (memberships.documents.length === 0) {
      console.log('  ❌ Aucune équipe trouvée');
    } else {
      for (const membership of memberships.documents) {
        try {
          const team = await databases.getDocument(DATABASE_ID, 'teams', membership.teamId);
          console.log(`  ✅ ${team.name || 'Sans nom'} (${team.$id})`);
        } catch (e) {
          console.log(`  ⚠️ TeamId ${membership.teamId} introuvable`);
        }
      }
    }
  } catch (e) {
    console.error('  Erreur:', e.message);
  }
  
  console.log('\n✅ Vérification terminée');
}

checkUserTeams();