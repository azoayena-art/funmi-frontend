import { Client, Users, Databases, Query } from 'node-appwrite';

// ============================================================
// CONFIGURATION
// ============================================================
const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = '6aacf8ec0010a7098203';
const API_KEY = 'standard_85b1c2940c934f7344ca18942563ced42af8df90739edf9b434b498c01136169918ebe2e8a39491ad83820d164ff00b169ca79f8fd497b140e62528ca65609f8eac2adc16c4cbc508279b5e8d4ba3b5b2f9786071b4d290e08e391d75754ebd1e32bf1dc8f2d4d40aea7bd593c1f5706859a98b91bec2e160da6066643537059'; // scopes: teams.write, users.read, databases.read

const APPWRITE_TEAM_ID = '6ac4c02c0007d55b5a10';
const CUSTOM_TEAM_ID = '6ac4c02c00293611f4a1';
const OWNER_USER_ID = '6ac4c026002aa6d19a14';

// ============================================================
// CLIENT APPWRITE POUR LECTURE
// ============================================================
const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const users = new Users(client);
const databases = new Databases(client);

// ============================================================
// FONCTION REST API DIRECTE
// ============================================================
async function createMembershipREST(teamId, userId) {
  const url = `${ENDPOINT}/teams/${teamId}/memberships`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': PROJECT_ID,
      'X-Appwrite-Key': API_KEY,
    },
    body: JSON.stringify({
      roles: ['member'],
      url: 'https://cloud.appwrite.io',
      userId: userId  // ← UNIQUEMENT userId, PAS d'email
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  
  return data;
}

async function confirmMembershipREST(teamId, membershipId, userId, secret) {
  const url = `${ENDPOINT}/teams/${teamId}/memberships/${membershipId}`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': PROJECT_ID,
      'X-Appwrite-Key': API_KEY,
    },
    body: JSON.stringify({
      userId: userId,
      secret: secret
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  
  return data;
}

// ============================================================
// SCRIPT PRINCIPAL
// ============================================================
console.log('🚀 AJOUT VIA REST API DIRECT (bypass SDK)\n');

// Récupérer tous les membres actifs
const activeMembers = await databases.listDocuments(
  'relancepro_db',
  'team_members',
  [
    Query.equal('status', 'active'),
    Query.equal('teamId', CUSTOM_TEAM_ID),
    Query.limit(100)
  ]
);

console.log(`📋 ${activeMembers.documents.length} membre(s) actif(s) à traiter\n`);

for (const member of activeMembers.documents) {
  console.log(`\n━━━ ${member.email || 'N/A'} (${member.userId}) ━━━`);
  
  if (member.userId === OWNER_USER_ID) {
    console.log('  ⏭️  Propriétaire, skip');
    continue;
  }
  
  if (!member.userId || member.userId === 'pending') {
    console.log('  ⏭️  userId pending, skip');
    continue;
  }
  
  // Vérifier email Appwrite
  try {
    const user = await users.get(member.userId);
    console.log(`  📧 Email Appwrite: ${user.email}`);
    console.log(`  ✅ Vérifié: ${user.emailVerification}`);
  } catch (e) {
    console.log(`  ❌ User introuvable: ${e.message}`);
    continue;
  }
  
  // TENTATIVE 1 : API REST avec userId uniquement
  console.log('  🔧 Tentative REST API (userId only)...');
  try {
    const membership = await createMembershipREST(APPWRITE_TEAM_ID, member.userId);
    console.log(`  ✅ Membership créé: ${membership.$id}`);
    console.log(`  🔑 Secret: ${membership.secret.substring(0, 15)}...`);
    
    // Confirmation
    console.log('  🔐 Confirmation...');
    await confirmMembershipREST(
      APPWRITE_TEAM_ID, 
      membership.$id, 
      member.userId, 
      membership.secret
    );
    console.log('  ✅ Confirmé !');
    continue; // Succès, passer au suivant
  } catch (e) {
    console.log(`  ❌ REST userId failed: ${e.message}`);
  }
  
  // TENTATIVE 2 : Avec email explicite
  console.log('  🔧 Tentative REST API (email explicite)...');
  try {
    const user = await users.get(member.userId);
    const url = `${ENDPOINT}/teams/${APPWRITE_TEAM_ID}/memberships`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': PROJECT_ID,
        'X-Appwrite-Key': API_KEY,
      },
      body: JSON.stringify({
        roles: ['member'],
        url: 'https://cloud.appwrite.io',
        email: user.email,
        userId: user.$id
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
    }
    
    const membership = await response.json();
    console.log(`  ✅ Membership créé via email: ${membership.$id}`);
    
    await confirmMembershipREST(APPWRITE_TEAM_ID, membership.$id, member.userId, membership.secret);
    console.log('  ✅ Confirmé !');
    continue;
  } catch (e) {
    console.log(`  ❌ REST email failed: ${e.message}`);
  }
  
  console.log('  ⚠️  Toutes les méthodes REST ont échoué pour cet utilisateur');
}

// Vérification finale
console.log('\n\n━━━ Vérification finale ━━━');
try {
  const url = `${ENDPOINT}/teams/${APPWRITE_TEAM_ID}`;
  const response = await fetch(url, {
    headers: {
      'X-Appwrite-Project': PROJECT_ID,
      'X-Appwrite-Key': API_KEY,
    }
  });
  const team = await response.json();
  console.log(`✅ Team ${team.name}: ${team.total} membre(s)`);
  
  const membersUrl = `${ENDPOINT}/teams/${APPWRITE_TEAM_ID}/memberships`;
  const membersResponse = await fetch(membersUrl, {
    headers: {
      'X-Appwrite-Project': PROJECT_ID,
      'X-Appwrite-Key': API_KEY,
    }
  });
  const membersData = await membersResponse.json();
  membersData.memberships.forEach(m => {
    console.log(`  • ${m.userId} - ${m.userEmail || 'N/A'} - confirmé: ${m.confirm}`);
  });
} catch (e) {
  console.log(`❌ ${e.message}`);
}

console.log('\n✨ Terminé !');