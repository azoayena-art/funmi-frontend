// scripts/backfill-payments.mjs
// Migration idempotente des paiements existants vers la collection payments
// ✅ Compatible avec les attributs corrigés (certains optionnels avec défaut)
import { Client, Databases, ID, Query, Permission, Role } from 'node-appwrite';
import { Client, Databases, ID, Query, Permission, Role } from 'node-appwrite';

const ENDPOINT    = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203';
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';
const API_KEY     = process.env.APPWRITE_API_KEY;
const WITH_BANK   = process.argv.includes('--with-bank');
const DRY_RUN     = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('❌ Variable APPWRITE_API_KEY manquante.');
  console.error('   Tape d\'abord :  set APPWRITE_API_KEY=ta_cle_api');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
const METHOD_MAP = {
  'virement bancaire': 'bank_transfer', 'virement': 'bank_transfer',
  'chèque': 'check', 'cheque': 'check',
  'carte bancaire': 'credit_card', 'cb': 'credit_card',
  'prélèvement sepa': 'sepa_direct_debit', 'sepa': 'sepa_direct_debit',
  'espèces': 'cash', 'especes': 'cash',
  'paypal': 'paypal', 'stripe': 'stripe',
};
const normMethod = (m) => METHOD_MAP[(m || '').toLowerCase().trim()] || 'other';

// APRÈS (corrigé)
function docPerms(teamId, userId) {
  return [
    Permission.read(Role.any()),
}
async function listAll(collectionId, queries = []) {
  const out = [];
  let offset = 0;
  const LIMIT = 100;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, collectionId, [
      ...queries, Query.limit(LIMIT), Query.offset(offset)
    ]);
    out.push(...res.documents);
    if (res.documents.length < LIMIT) break;
    offset += LIMIT;
    if (offset > 10000) {
      console.warn(`   ⚠️ Garde-fou : arrêt à 10000 docs pour ${collectionId}`);
      break;
    }
  }
  return out;
}

const stats = {
  clientIn: 0,
  supplierOut: 0,
  skipped: 0,
  bankAccounts: 0,
  errors: 0,
  errorDetails: []
};

// ===============================================================
// MAIN
// ===============================================================
(async () => {
  console.log('🔄 BACKFILL des paiements existants');
  if (DRY_RUN) console.log('   🧪 Mode DRY-RUN : aucune écriture réelle\n');
  else console.log('');

  // ---------------------------------------------------------------
  // 1) Factures clients payées (invoices)
  // ---------------------------------------------------------------
  console.log('📥 [1/2] Factures clients payées...');

  let paidInvoices = [];
  try {
    paidInvoices = await listAll('invoices', [
      Query.equal('status', 'paid'),
      Query.isNotNull('paidAt'),
    ]);
    console.log(`   ${paidInvoices.length} facture(s) payée(s) trouvée(s)`);
  } catch (e) {
    console.warn(`   ⚠️ Impossible de lire invoices: ${e.message}`);
  }

  for (const inv of paidInvoices) {
    try {
      // Vérifier si déjà migré (idempotence)
      const existing = await databases.listDocuments(DATABASE_ID, 'payments', [
        Query.equal('linkedInvoiceId', inv.$id),
        Query.limit(1)
      ]);
      if (existing.total > 0) {
        stats.skipped++;
        continue;
      }

      const total = inv.total || 0;
      const subtotal = inv.subtotal || 0;
      const tax = inv.tax || 0;
      const vatRate = subtotal > 0 ? Math.round((tax / subtotal) * 100 * 100) / 100 : 0;

      const payload = {
        teamId: inv.teamId,
        userId: inv.userId || 'system',
        type: 'in',
        category: 'client_payment',
        amount: total,
        currencyCode: inv.currencyCode || 'EUR',
        exchangeRate: 1,
        amountEur: total,
        date: inv.paidAt,
        method: 'bank_transfer',
        description: `Paiement facture ${inv.invoiceNumber} - ${inv.clientName || 'client'}`,
        counterpartyName: inv.clientName || null,
        linkedInvoiceId: inv.$id,
        vatAmount: tax,
        vatRate: vatRate,
      };

      if (!DRY_RUN) {
        await databases.createDocument(
          DATABASE_ID,
          'payments',
          ID.unique(),
          payload,
          docPerms(inv.teamId, inv.userId)
        );
      }

      stats.clientIn++;
    } catch (e) {
      stats.errors++;
      stats.errorDetails.push(`invoice ${inv.$id}: ${e.message}`);
      console.error(`   ❌ invoice ${inv.$id}: ${e.message}`);
    }
  }

  console.log(`   ✅ ${stats.clientIn} encaissement(s) ${DRY_RUN ? '(simulé)' : 'créé(s)'}`);

  // ---------------------------------------------------------------
  // 2) Paiements fournisseurs (received_invoices.payments[])
  // ---------------------------------------------------------------
  console.log('\n📤 [2/2] Factures fournisseurs avec paiements...');

  let received = [];
  try {
    received = await listAll('received_invoices');
    console.log(`   ${received.length} facture(s) fournisseur(s) analysée(s)`);
  } catch (e) {
    console.warn(`   ⚠️ Impossible de lire received_invoices: ${e.message}`);
  }

  for (const ri of received) {
    let pays = [];
    try {
      if (typeof ri.payments === 'string' && ri.payments.trim()) {
        pays = JSON.parse(ri.payments);
      } else if (Array.isArray(ri.payments)) {
        pays = ri.payments;
      }
    } catch {
      pays = [];
    }
    if (!Array.isArray(pays) || pays.length === 0) continue;

    // Paiements déjà migrés pour cette facture
    const already = await databases.listDocuments(DATABASE_ID, 'payments', [
      Query.equal('linkedReceivedInvoiceId', ri.$id),
      Query.limit(100)
    ]);
    const alreadyKeys = new Set(already.documents.map(p => `${p.date}|${p.amount}`));

    const total = ri.total || 0;
    const tax = ri.tax || 0;

    for (const p of pays) {
      const key = `${p.date}|${p.amount}`;
      if (alreadyKeys.has(key)) {
        stats.skipped++;
        continue;
      }

      try {
        const amount = p.amount || 0;
        const vatAmount = total > 0 ? Math.round(amount * (tax / total) * 100) / 100 : 0;

        const payload = {
          teamId: ri.teamId,
          userId: ri.userId || 'system',
          type: 'out',
          category: 'supplier_payment',
          amount: amount,
          currencyCode: ri.currencyCode || 'EUR',
          exchangeRate: 1,
          amountEur: amount,
          date: p.date,
          method: normMethod(p.method),
          description: `Paiement facture ${ri.invoiceNumber} - ${ri.supplierName || 'fournisseur'}`,
          counterpartyName: ri.supplierName || null,
          counterpartySiret: ri.supplierSiret || null,
          linkedReceivedInvoiceId: ri.$id,
          reference: p.reference || null,
          vatAmount: vatAmount,
          vatRate: total > 0 ? Math.round((tax / total) * 100 * 100) / 100 : 0,
        };

        if (!DRY_RUN) {
          await databases.createDocument(
            DATABASE_ID,
            'payments',
            ID.unique(),
            payload,
            docPerms(ri.teamId, ri.userId)
          );
        }

        stats.supplierOut++;
      } catch (e) {
        stats.errors++;
        stats.errorDetails.push(`received ${ri.$id} / ${p.date}: ${e.message}`);
        console.error(`   ❌ received ${ri.$id} / ${p.date}: ${e.message}`);
      }
    }
  }

  console.log(`   ✅ ${stats.supplierOut} décaissement(s) ${DRY_RUN ? '(simulé)' : 'créé(s)'}`);

  // ---------------------------------------------------------------
  // 3) OPTION : comptes bancaires par défaut
  // ---------------------------------------------------------------
  if (WITH_BANK) {
    console.log('\n🏦 Création des comptes bancaires par défaut...');

    let teams = [];
    try {
      teams = await listAll('teams');
      console.log(`   ${teams.length} équipe(s) trouvée(s)`);
    } catch (e) {
      // Fallback : essayer 'company_settings' ou autre
      try {
        const settings = await listAll('company_settings');
        teams = settings.map(s => ({ $id: s.teamId, name: s.name || 'Équipe' }));
        console.log(`   ${teams.length} équipe(s) via company_settings`);
      } catch {
        console.warn(`   ⚠️ Impossible de lister les équipes`);
      }
    }

    for (const t of teams) {
      if (!t.$id) continue;
      try {
        const existing = await databases.listDocuments(DATABASE_ID, 'bank_accounts', [
          Query.equal('teamId', t.$id),
          Query.limit(1)
        ]);
        if (existing.total > 0) {
          stats.skipped++;
          continue;
        }

        if (!DRY_RUN) {
          await databases.createDocument(
            DATABASE_ID,
            'bank_accounts',
            ID.unique(),
            {
              teamId: t.$id,
              name: 'Compte principal',
              bankName: 'À compléter',
              currencyCode: 'EUR',
              openingDate: new Date().toISOString(),
            },
            docPerms(t.$id, null)
          );
        }

        stats.bankAccounts++;
      } catch (e) {
        stats.errors++;
        stats.errorDetails.push(`bank ${t.$id}: ${e.message}`);
        console.error(`   ❌ bank ${t.$id}: ${e.message}`);
      }
    }
    console.log(`   ✅ ${stats.bankAccounts} compte(s) ${DRY_RUN ? '(simulé)' : 'créé(s)'}`);
  }

  // ---------------------------------------------------------------
  // RÉCAPITULATIF
  // ---------------------------------------------------------------
  console.log('\n═══════════════════════════════════════');
  console.log('  RÉCAPITULATIF');
  console.log('═══════════════════════════════════════');
  console.log(`  📥 Encaissements migrés  : ${stats.clientIn}`);
  console.log(`  📤 Décaissements migrés  : ${stats.supplierOut}`);
  console.log(`  🏦 Comptes bancaires     : ${stats.bankAccounts}`);
  console.log(`  ⏭️  Déjà présents (skip)  : ${stats.skipped}`);
  console.log(`  ❌ Erreurs               : ${stats.errors}`);
  if (stats.errors > 0) {
    console.log('\n  Détail des erreurs :');
    stats.errorDetails.slice(0, 10).forEach(d => console.log(`     • ${d}`));
    if (stats.errorDetails.length > 10) {
      console.log(`     ... et ${stats.errorDetails.length - 10} autre(s)`);
    }
  }
  console.log('═══════════════════════════════════════');
  console.log(`\n🎉 PARTIE B TERMINÉE${DRY_RUN ? ' (DRY-RUN)' : ''}.`);
})().catch(e => {
  console.error('\n💥 Erreur fatale:', e?.message || e);
  process.exit(1);
});