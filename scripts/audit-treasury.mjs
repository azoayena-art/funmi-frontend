// scripts/audit-treasury.mjs — Audit multi-tenant & doublons de trésorerie
import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203')
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = process.env.DATABASE_ID || 'relancepro_db';
const MONTH = new Date().toISOString().slice(0, 7);

const fetchAll = async (coll) => {
  let docs = [], offset = 0;
  while (true) {
    const res = await db.listDocuments(DB, coll, [Query.limit(100), Query.offset(offset)]);
    docs.push(...res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
    if (offset > 5000) break;
  }
  return docs;
};

for (const coll of ['payments', 'expenses']) {
  console.log(`\n========== COLLECTION : ${coll} ==========`);
  const docs = await fetchAll(coll);
  if (docs.length === 0) { console.log('(vide)'); continue; }

  // ---- 1. Répartition par équipe ----
  const byTeam = {};
  docs.forEach(d => {
    const t = d.teamId || '⚠️ SANS teamId';
    byTeam[t] = byTeam[t] || { docs: 0, inTotal: 0, outTotal: 0, inMois: 0, outMois: 0 };
    const amt = d.amountEur || d.amount || 0;
    byTeam[t].docs++;
    if (coll === 'expenses') {
      byTeam[t].outTotal += amt;
      if ((d.date || '').startsWith(MONTH)) byTeam[t].outMois += amt;
    } else if (d.type === 'in') {
      byTeam[t].inTotal += amt;
      if ((d.date || '').startsWith(MONTH)) byTeam[t].inMois += amt;
    } else if (d.type === 'out') {
      byTeam[t].outTotal += amt;
      if ((d.date || '').startsWith(MONTH)) byTeam[t].outMois += amt;
    }
  });
  console.log(`--- Sommes par teamId (mois courant = ${MONTH}) ---`);
  console.table(byTeam);

  // ---- 2. Doublons suspects (même équipe+date+montant) ----
  const groups = {};
  docs.forEach(d => {
    const key = `${d.teamId}|${d.date}|${Math.round((d.amountEur || d.amount || 0) * 100)}|${d.linkedInvoiceId || d.linkedReceivedInvoiceId || ''}`;
    (groups[key] = groups[key] || []).push(d);
  });
  const dupes = Object.values(groups).filter(g => g.length > 1);
  console.log(`--- Doublons suspects : ${dupes.length} groupe(s) ---`);
  dupes.forEach(g => {
    g.forEach(d => console.log(`  • ${d.$id} | ${d.date} | ${d.amountEur || d.amount} | ${d.description || d.label} | linked=${d.linkedInvoiceId || d.linkedReceivedInvoiceId || 'null'}`));
  });

  // ---- 3. Permissions (fuite RLS ?) ----
  const risky = docs.filter(d => (d.$permissions || []).some(p => p.includes('"any"') || p.includes('"users"')));
  console.log(`--- Documents avec permissions TROP larges (any/users) : ${risky.length} ---`);
  risky.slice(0, 10).forEach(d => console.log(`  ⚠️ ${d.$id} → ${JSON.stringify(d.$permissions)}`));
}
console.log('\n✅ Audit terminé');