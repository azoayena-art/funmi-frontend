// scripts/reconcile-payments.mjs
// 🎯 payments = miroir exact des paiements de factures + mouvements manuels
import { Client, Databases, Query, Permission, Role } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT  = process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203';
const DB       = process.env.DATABASE_ID || 'relancepro_db';
const RUN      = process.argv.includes('--run');
const CREATE   = process.argv.includes('--create-missing');

if (!process.env.APPWRITE_API_KEY) { console.error('❌ APPWRITE_API_KEY manquant'); process.exit(1); }
const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);

const cents = n => Math.round((Number(n) || 0) * 100);
const day = d => String(d || '').slice(0, 10);

const fetchAll = async (coll) => {
  let out = [], offset = 0;
  for (;;) {
    const res = await db.listDocuments(DB, coll, [Query.limit(100), Query.offset(offset)]);
    out.push(...res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
    if (offset > 5000) break;
  }
  return out;
};

const [payments, clientInvs, supplierInvs] = await Promise.all([
  fetchAll('payments'), fetchAll('invoices'), fetchAll('received_invoices'),
]);

// ---------- Mapping customTeamId -> teamId natif Appwrite ----------
const map = {};
for (const pair of (process.env.TEAM_MAP || '').split(';').filter(Boolean)) {
  const [c, n] = pair.split('='); if (c && n) map[c] = n;
}
if (!Object.keys(map).length) {
  for (const name of ['teams', 'custom_teams', 'team_members']) {
    try {
      for (const d of await fetchAll(name)) {
        const custom = d.teamId || d.$id;
        const native = d.appwriteTeamId;
        if (custom && native) map[custom] = native;
      }
      if (Object.keys(map).length) break;
    } catch { /* collection absente */ }
  }
}
console.log('🗺️ Mapping équipes:', map);

// ---------- Paiements attendus (source de vérité = JSON payments des factures) ----------
const INVOICE_CATEGORIES = new Set(['client_payment', 'client_advance', 'supplier_payment', 'supplier_advance']);
const expected = new Map();
const addExpected = (inv, type) => {
  let pays = [];
  try { pays = typeof inv.payments === 'string' ? JSON.parse(inv.payments || '[]') : (inv.payments || []); } catch { pays = []; }
  for (const p of pays) {
    const key = `${inv.teamId}|${type}|${day(p.date)}|${cents(p.amount)}`;
    if (!expected.has(key)) expected.set(key, {
      key, consumed: false, teamId: inv.teamId, type, date: day(p.date), cents: cents(p.amount),
      linkField: type === 'in' ? 'linkedInvoiceId' : 'linkedReceivedInvoiceId', linkId: inv.$id,
    });
  }
};
clientInvs.forEach(i => addExpected(i, 'in'));
supplierInvs.forEach(i => addExpected(i, 'out'));

// ---------- Classification des documents payments ----------
const toDelete = [], toRelink = [];
for (const doc of payments) {
  if (!INVOICE_CATEGORIES.has(doc.category)) continue; // mouvements manuels : intouchables
  const key = `${doc.teamId}|${doc.type}|${day(doc.date)}|${cents(doc.amountEur ?? doc.amount)}`;
  const exp = expected.get(key);
  if (exp && !exp.consumed) {
    exp.consumed = true;
    if (!doc[exp.linkField]) toRelink.push({ doc, exp });
  } else {
    toDelete.push(doc); // doublon ou orphelin
  }
}
const missing = [...expected.values()].filter(e => !e.consumed);
const broad = payments.filter(d => (d.$permissions || []).some(p => p.includes('"any"') || p.includes('"users"')));

console.log(`\n🧾 ${payments.length} mouvements • ${expected.size} paiements attendus depuis les factures`);
console.log(`🗑️  Doublons/orphelins à supprimer : ${toDelete.length}`);
toDelete.forEach(d => console.log(`   - ${d.$id} | ${day(d.date)} | ${d.amountEur ?? d.amount} | ${d.description}`));
console.log(`🔗 Documents à relier à leur facture : ${toRelink.length}`);
console.log(`⚠️  Paiements de factures sans mouvement : ${missing.length}`);
missing.forEach(m => console.log(`   + ${m.teamId} | ${m.type} | ${m.date} | ${m.cents / 100}`));
console.log(`🔓 Permissions trop larges à refermer : ${broad.length}`);

if (!RUN) { console.log('\nℹ️  DRY-RUN : relancez avec --run pour appliquer (et --create-missing pour recréer les manquants).'); process.exit(0); }

// ---------- Application ----------
for (const d of toDelete) { await db.deleteDocument(DB, 'payments', d.$id); console.log(`✅ Supprimé ${d.$id}`); }
for (const { doc, exp } of toRelink) {
  await db.updateDocument(DB, 'payments', doc.$id, { [exp.linkField]: exp.linkId });
  console.log(`✅ Relié ${doc.$id} → ${exp.linkId}`);
}
if (CREATE) {
  for (const m of missing) {
    const native = map[m.teamId];
    const perms = native ? [Permission.read(Role.team(native)), Permission.update(Role.team(native)), Permission.delete(Role.team(native))] : undefined;
    await db.createDocument(DB, 'payments', { 
      teamId: m.teamId, type: m.type,
      category: m.type === 'in' ? 'client_payment' : 'supplier_payment',
      amount: m.cents / 100, currencyCode: 'EUR', exchangeRate: 1, amountEur: m.cents / 100,
      date: m.date, method: 'other',
      description: `Régularisation paiement facture`,
      [m.linkField]: m.linkId,
      vatAmount: 0, vatRate: 0, isReconciled: false, isRecurring: false, isArchived: false,
    }, perms);
    console.log(`✅ Créé mouvement manquant ${m.date} • ${m.cents / 100}`);
  }
}
for (const d of broad) {
  const native = map[d.teamId];
  if (!native) { console.log(`⚠️ ${d.$id} : mapping équipe introuvable (TEAM_MAP=custom=native) — non modifié`); continue; }
  await db.updateDocument(DB, 'payments', d.$id, {}, [
    Permission.read(Role.team(native)), Permission.update(Role.team(native)), Permission.delete(Role.team(native)),
  ]);
  console.log(`🔒 Permissions refermées sur ${d.$id}`);
}
console.log('\n🎉 Réconciliation terminée. Rechargez /treasury.');