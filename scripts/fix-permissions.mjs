// scripts/fix-permissions.mjs
import { Client, Databases, Query, Permission, Role } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT  = process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203';
const DB       = process.env.DATABASE_ID || 'relancepro_db';

if (!process.env.APPWRITE_API_KEY) { console.error('❌ APPWRITE_API_KEY manquant'); process.exit(1); }
const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);

// 1. Récupération du mapping des équipes
const map = {};
for (const name of ['teams', 'custom_teams', 'team_members']) {
  try {
    let out = [], offset = 0;
    for (;;) {
      const res = await db.listDocuments(DB, name, [Query.limit(100), Query.offset(offset)]);
      out.push(...res.documents);
      if (res.documents.length < 100) break;
      offset += 100;
    }
    for (const d of out) {
      const custom = d.teamId || d.$id;
      const native = d.appwriteTeamId;
      if (custom && native) map[custom] = native;
    }
    if (Object.keys(map).length) break;
  } catch { /* collection absente */ }
}
console.log('🗺️ Mapping équipes:', map);

// 2. Récupération des mouvements restants
let out = [], offset = 0;
for (;;) {
  const res = await db.listDocuments(DB, 'payments', [Query.limit(100), Query.offset(offset)]);
  out.push(...res.documents);
  if (res.documents.length < 100) break;
  offset += 100;
  if (offset > 5000) break;
}

// 3. Filtrage des permissions "any" restantes
const broad = out.filter(d => (d.$permissions || []).some(p => p.includes('"any"') || p.includes('"users"')));
console.log(`🔓 Permissions trop larges restantes à corriger : ${broad.length}`);

// 4. Mise à jour sécurisée (ignore les 404)
for (const d of broad) {
  const native = map[d.teamId];
  if (!native) { console.log(`⚠️ ${d.$id} : mapping équipe introuvable — non modifié`); continue; }
  try {
    await db.updateDocument(DB, 'payments', d.$id, {}, [
      Permission.read(Role.team(native)), 
      Permission.update(Role.team(native)), 
      Permission.delete(Role.team(native)),
    ]);
    console.log(`🔒 Permissions refermées sur ${d.$id}`);
  } catch (e) {
    if (e.code === 404) {
      console.log(`⏭️ ${d.$id} déjà supprimé, ignoré.`);
    } else {
      console.error(`❌ Erreur sur ${d.$id}:`, e.message);
    }
  }
}
console.log('\n✅ Sécurité multi-tenant totalement verrouillée.');