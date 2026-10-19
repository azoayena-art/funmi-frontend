// scripts/create-treasury-collections.mjs
// Création idempotente du module Trésorerie
// ✅ CORRIGÉ : tous les attributs avec valeur par défaut sont OPTIONNELS
import { Client, Databases } from 'node-appwrite';

const ENDPOINT    = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203';
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';
const API_KEY     = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('❌ Variable APPWRITE_API_KEY manquante.');
  console.error('   Tape d\'abord :  set APPWRITE_API_KEY=ta_cle_api');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isConflict = (e) => e?.code === 409 || /already exists/i.test(e?.message || '');

async function ensureCollection(id, name) {
  try {
    await databases.getCollection(DATABASE_ID, id);
    console.log(`⏭️  Collection "${id}" existe déjà`);
    return false;
  } catch {
    await databases.createCollection(DATABASE_ID, id, name, [], true);
    console.log(`✅ Collection "${id}" créée`);
    return true;
  }
}

async function attr(label, fn) {
  try {
    await fn();
    console.log(`   ➕ ${label}`);
  } catch (e) {
    if (isConflict(e)) {
      console.log(`   ➖ ${label} (déjà présent)`);
    } else {
      console.error(`   ❌ ${label}: ${e?.message || e}`);
      throw e;
    }
  }
  await sleep(200);
}

async function waitAttributesAvailable(collId) {
  for (let i = 0; i < 60; i++) {
    const res = await databases.listAttributes(DATABASE_ID, collId);
    const pending = res.attributes.filter(a => a.status === 'processing');
    const stuck   = res.attributes.filter(a => a.status === 'stuck' || a.status === 'failed');
    if (stuck.length > 0) {
      console.warn(`   ⚠️ Attributs bloqués: ${stuck.map(a => `${a.key}(${a.status})`).join(', ')}`);
      return false;
    }
    if (pending.length === 0) return true;
    await sleep(2000);
  }
  console.warn('   ⚠️ Timeout attente attributs');
  return false;
}

async function idx(label, fn) {
  try {
    await fn();
    console.log(`   🔗 ${label}`);
  } catch (e) {
    if (isConflict(e)) console.log(`   ➖ ${label} (déjà présent)`);
    else {
      console.error(`   ❌ Index ${label}: ${e?.message || e}`);
      throw e;
    }
  }
  await sleep(200);
}

// ---------------------------------------------------------------
// Énumérations
// ---------------------------------------------------------------
const CATEGORY = [
  'client_payment','client_advance','client_refund',
  'supplier_payment','supplier_advance','supplier_refund',
  'salary','social_charges','tax_payment','subscription','rent',
  'bank_fee','insurance','fuel','travel','marketing','equipment',
  'loan_repayment','loan_received','capital_injection','dividend',
  'petty_cash','other_in','other_out'
];
const METHOD = ['bank_transfer','check','credit_card','sepa_direct_debit','cash','paypal','stripe','other'];
const FREQ   = ['monthly','quarterly','yearly'];

// ===============================================================
// 📥 1) payments
// ===============================================================
async function buildPayments() {
  console.log('\n📥 [1/4] payments');
  const C = 'payments';
  await ensureCollection(C, 'Paiements & Mouvements');

  // === STRINGS REQUIS (pas de défaut) ===
  await attr('teamId',      () => databases.createStringAttribute(DATABASE_ID, C, 'teamId', 50, true));
  await attr('userId',      () => databases.createStringAttribute(DATABASE_ID, C, 'userId', 50, true));
  await attr('description', () => databases.createStringAttribute(DATABASE_ID, C, 'description', 500, true));

  // === STRINGS OPTIONNELS ===
  await attr('bankAccountId',           () => databases.createStringAttribute(DATABASE_ID, C, 'bankAccountId', 50, false));
  await attr('reference',               () => databases.createStringAttribute(DATABASE_ID, C, 'reference', 100, false));
  await attr('counterpartyName',        () => databases.createStringAttribute(DATABASE_ID, C, 'counterpartyName', 200, false));
  await attr('counterpartySiret',       () => databases.createStringAttribute(DATABASE_ID, C, 'counterpartySiret', 14, false));
  await attr('linkedInvoiceId',         () => databases.createStringAttribute(DATABASE_ID, C, 'linkedInvoiceId', 50, false));
  await attr('linkedReceivedInvoiceId', () => databases.createStringAttribute(DATABASE_ID, C, 'linkedReceivedInvoiceId', 50, false));
  await attr('linkedExpenseId',         () => databases.createStringAttribute(DATABASE_ID, C, 'linkedExpenseId', 50, false));
  await attr('linkedQuoteId',           () => databases.createStringAttribute(DATABASE_ID, C, 'linkedQuoteId', 50, false));
  await attr('attachmentFileId',        () => databases.createStringAttribute(DATABASE_ID, C, 'attachmentFileId', 50, false));
  await attr('reconciliationId',        () => databases.createStringAttribute(DATABASE_ID, C, 'reconciliationId', 50, false));
  await attr('notes',                   () => databases.createStringAttribute(DATABASE_ID, C, 'notes', 2000, false));

  // ✅ currencyCode : OPTIONNEL avec défaut
  await attr('currencyCode', () => databases.createStringAttribute(DATABASE_ID, C, 'currencyCode', 3, false, 'EUR'));

  // === ENUMS REQUIS (pas de défaut) ===
  await attr('type',     () => databases.createEnumAttribute(DATABASE_ID, C, 'type', ['in','out'], true));
  await attr('category', () => databases.createEnumAttribute(DATABASE_ID, C, 'category', CATEGORY, true));

  // ✅ method : OPTIONNEL avec défaut
  await attr('method', () => databases.createEnumAttribute(DATABASE_ID, C, 'method', METHOD, false, 'other'));

  // ✅ recurringFrequency : OPTIONNEL
  await attr('recurringFrequency', () => databases.createEnumAttribute(DATABASE_ID, C, 'recurringFrequency', FREQ, false));

  // === FLOATS REQUIS (pas de défaut) ===
  await attr('amount',    () => databases.createFloatAttribute(DATABASE_ID, C, 'amount',    true,  0, null, null));
  await attr('amountEur', () => databases.createFloatAttribute(DATABASE_ID, C, 'amountEur', true,  0, null, null));

  // === FLOATS OPTIONNELS ===
  await attr('exchangeRate', () => databases.createFloatAttribute(DATABASE_ID, C, 'exchangeRate', false, 0, null, 1));
  await attr('vatAmount',    () => databases.createFloatAttribute(DATABASE_ID, C, 'vatAmount',    false, 0, null, 0));
  await attr('vatRate',      () => databases.createFloatAttribute(DATABASE_ID, C, 'vatRate',      false, 0, 100,  0));

  // === DATETIME ===
  await attr('date',         () => databases.createDatetimeAttribute(DATABASE_ID, C, 'date', true));
  await attr('valueDate',    () => databases.createDatetimeAttribute(DATABASE_ID, C, 'valueDate', false));
  await attr('reconciledAt', () => databases.createDatetimeAttribute(DATABASE_ID, C, 'reconciledAt', false));

  // ✅ BOOLÉENS : OPTIONNELS avec défaut (Appwrite refuse required+default)
  await attr('isReconciled', () => databases.createBooleanAttribute(DATABASE_ID, C, 'isReconciled', false, false));
  await attr('isRecurring',  () => databases.createBooleanAttribute(DATABASE_ID, C, 'isRecurring',  false, false));
  await attr('isArchived',   () => databases.createBooleanAttribute(DATABASE_ID, C, 'isArchived',   false, false));

  console.log('   ⏳ Attente disponibilité des attributs...');
  await waitAttributesAvailable(C);

  await idx('idx_team_date',       () => databases.createIndex(DATABASE_ID, C, 'idx_team_date',       'key', ['teamId','date'], ['ASC','DESC']));
  await idx('idx_team_type',       () => databases.createIndex(DATABASE_ID, C, 'idx_team_type',       'key', ['teamId','type'], ['ASC','ASC']));
  await idx('idx_team_category',   () => databases.createIndex(DATABASE_ID, C, 'idx_team_category',   'key', ['teamId','category'], ['ASC','ASC']));
  await idx('idx_team_reconciled', () => databases.createIndex(DATABASE_ID, C, 'idx_team_reconciled', 'key', ['teamId','isReconciled'], ['ASC','ASC']));
  await idx('idx_linked_invoice',  () => databases.createIndex(DATABASE_ID, C, 'idx_linked_invoice',  'key', ['linkedInvoiceId'], ['ASC']));
  await idx('idx_linked_received', () => databases.createIndex(DATABASE_ID, C, 'idx_linked_received', 'key', ['linkedReceivedInvoiceId'], ['ASC']));
}

// ===============================================================
// 💸 2) expenses
// ===============================================================
async function buildExpenses() {
  console.log('\n💸 [2/4] expenses');
  const C = 'expenses';
  await ensureCollection(C, 'Dépenses Directes');

  // === STRINGS REQUIS ===
  await attr('teamId',   () => databases.createStringAttribute(DATABASE_ID, C, 'teamId', 50, true));
  await attr('userId',   () => databases.createStringAttribute(DATABASE_ID, C, 'userId', 50, true));
  await attr('category', () => databases.createStringAttribute(DATABASE_ID, C, 'category', 50, true));
  await attr('label',    () => databases.createStringAttribute(DATABASE_ID, C, 'label', 200, true));

  // === STRINGS OPTIONNELS ===
  await attr('supplierName',     () => databases.createStringAttribute(DATABASE_ID, C, 'supplierName', 200, false));
  await attr('supplierSiret',    () => databases.createStringAttribute(DATABASE_ID, C, 'supplierSiret', 14, false));
  await attr('reference',        () => databases.createStringAttribute(DATABASE_ID, C, 'reference', 100, false));
  await attr('attachmentFileId', () => databases.createStringAttribute(DATABASE_ID, C, 'attachmentFileId', 50, false));
  await attr('accountingCode',   () => databases.createStringAttribute(DATABASE_ID, C, 'accountingCode', 20, false));
  await attr('paymentId',        () => databases.createStringAttribute(DATABASE_ID, C, 'paymentId', 50, false));
  await attr('notes',            () => databases.createStringAttribute(DATABASE_ID, C, 'notes', 2000, false));

  // ✅ currencyCode OPTIONNEL
  await attr('currencyCode', () => databases.createStringAttribute(DATABASE_ID, C, 'currencyCode', 3, false, 'EUR'));

  // ✅ method OPTIONNEL
  await attr('method', () => databases.createEnumAttribute(DATABASE_ID, C, 'method', METHOD, false, 'other'));

  // ✅ recurringFrequency OPTIONNEL
  await attr('recurringFrequency', () => databases.createEnumAttribute(DATABASE_ID, C, 'recurringFrequency', FREQ, false));

  // === FLOATS REQUIS ===
  await attr('amount',   () => databases.createFloatAttribute(DATABASE_ID, C, 'amount',   true, 0, null, null));
  await attr('amountHt', () => databases.createFloatAttribute(DATABASE_ID, C, 'amountHt', true, 0, null, null));

  // === FLOATS OPTIONNELS ===
  await attr('vatRate',   () => databases.createFloatAttribute(DATABASE_ID, C, 'vatRate',   false, 0, 100, 20));
  await attr('vatAmount', () => databases.createFloatAttribute(DATABASE_ID, C, 'vatAmount', false, 0, null,  0));

  // === DATETIME ===
  await attr('date',             () => databases.createDatetimeAttribute(DATABASE_ID, C, 'date', true));
  await attr('recurringEndDate', () => databases.createDatetimeAttribute(DATABASE_ID, C, 'recurringEndDate', false));

  // ✅ BOOLÉENS OPTIONNELS
  await attr('isDeductible', () => databases.createBooleanAttribute(DATABASE_ID, C, 'isDeductible', false, true));
  await attr('isRecurring',  () => databases.createBooleanAttribute(DATABASE_ID, C, 'isRecurring',  false, false));
  await attr('isArchived',   () => databases.createBooleanAttribute(DATABASE_ID, C, 'isArchived',   false, false));

  console.log('   ⏳ Attente disponibilité des attributs...');
  await waitAttributesAvailable(C);

  await idx('idx_team_date',     () => databases.createIndex(DATABASE_ID, C, 'idx_team_date',     'key', ['teamId','date'], ['ASC','DESC']));
  await idx('idx_team_category', () => databases.createIndex(DATABASE_ID, C, 'idx_team_category', 'key', ['teamId','category'], ['ASC','ASC']));
  await idx('idx_team_payment',  () => databases.createIndex(DATABASE_ID, C, 'idx_team_payment',  'key', ['paymentId'], ['ASC']));
}

// ===============================================================
// 🏦 3) bank_accounts
// ===============================================================
async function buildBankAccounts() {
  console.log('\n🏦 [3/4] bank_accounts');
  const C = 'bank_accounts';
  await ensureCollection(C, 'Comptes Bancaires');

  // === STRINGS REQUIS ===
  await attr('teamId',   () => databases.createStringAttribute(DATABASE_ID, C, 'teamId', 50, true));
  await attr('name',     () => databases.createStringAttribute(DATABASE_ID, C, 'name', 100, true));
  await attr('bankName', () => databases.createStringAttribute(DATABASE_ID, C, 'bankName', 100, true));

  // === STRINGS OPTIONNELS ===
  await attr('iban',  () => databases.createStringAttribute(DATABASE_ID, C, 'iban', 255, false));
  await attr('bic',   () => databases.createStringAttribute(DATABASE_ID, C, 'bic', 100, false));
  await attr('notes', () => databases.createStringAttribute(DATABASE_ID, C, 'notes', 500, false));

  // ✅ currencyCode OPTIONNEL
  await attr('currencyCode', () => databases.createStringAttribute(DATABASE_ID, C, 'currencyCode', 3, false, 'EUR'));

  // ✅ color OPTIONNEL
  await attr('color', () => databases.createStringAttribute(DATABASE_ID, C, 'color', 7, false, '#8b5cf6'));

  // ✅ FLOATS OPTIONNELS (avec défaut)
  await attr('openingBalance', () => databases.createFloatAttribute(DATABASE_ID, C, 'openingBalance', false, null, null, 0));
  await attr('currentBalance', () => databases.createFloatAttribute(DATABASE_ID, C, 'currentBalance', false, null, null, 0));

  // === DATETIME ===
  await attr('openingDate', () => databases.createDatetimeAttribute(DATABASE_ID, C, 'openingDate', true));
  await attr('lastSyncAt',  () => databases.createDatetimeAttribute(DATABASE_ID, C, 'lastSyncAt', false));

  // ✅ BOOLÉENS OPTIONNELS
  await attr('isDefault', () => databases.createBooleanAttribute(DATABASE_ID, C, 'isDefault', false, false));
  await attr('isActive',  () => databases.createBooleanAttribute(DATABASE_ID, C, 'isActive',  false, true));

  console.log('   ⏳ Attente disponibilité des attributs...');
  await waitAttributesAvailable(C);

  await idx('idx_team_active', () => databases.createIndex(DATABASE_ID, C, 'idx_team_active', 'key', ['teamId','isActive'], ['ASC','ASC']));
}

// ===============================================================
// 🔗 4) reconciliations
// ===============================================================
async function buildReconciliations() {
  console.log('\n🔗 [4/4] reconciliations');
  const C = 'reconciliations';
  await ensureCollection(C, 'Lettrages Bancaires');

  // === STRINGS REQUIS ===
  await attr('teamId',            () => databases.createStringAttribute(DATABASE_ID, C, 'teamId', 50, true));
  await attr('userId',            () => databases.createStringAttribute(DATABASE_ID, C, 'userId', 50, true));
  await attr('bankAccountId',     () => databases.createStringAttribute(DATABASE_ID, C, 'bankAccountId', 50, true));
  await attr('bankTransactionId', () => databases.createStringAttribute(DATABASE_ID, C, 'bankTransactionId', 100, true));
  await attr('paymentId',         () => databases.createStringAttribute(DATABASE_ID, C, 'paymentId', 50, true));

  // === STRINGS OPTIONNELS ===
  await attr('bankLabel', () => databases.createStringAttribute(DATABASE_ID, C, 'bankLabel', 500, false));

  // ✅ matchType OPTIONNEL
  await attr('matchType', () => databases.createEnumAttribute(DATABASE_ID, C, 'matchType', ['auto','manual','suggested'], false, 'manual'));

  // === FLOATS ===
  await attr('bankAmount',      () => databases.createFloatAttribute(DATABASE_ID, C, 'bankAmount',      true,  null, null, null));
  await attr('matchConfidence', () => databases.createFloatAttribute(DATABASE_ID, C, 'matchConfidence', false, 0, 1, 1));

  // === DATETIME ===
  await attr('bankDate',     () => databases.createDatetimeAttribute(DATABASE_ID, C, 'bankDate', true));
  await attr('reconciledAt', () => databases.createDatetimeAttribute(DATABASE_ID, C, 'reconciledAt', true));

  // ✅ BOOLÉEN OPTIONNEL
  await attr('isUnmatched', () => databases.createBooleanAttribute(DATABASE_ID, C, 'isUnmatched', false, false));

  console.log('   ⏳ Attente disponibilité des attributs...');
  await waitAttributesAvailable(C);

  await idx('idx_team_bank', () => databases.createIndex(DATABASE_ID, C, 'idx_team_bank', 'key', ['teamId','bankAccountId'], ['ASC','ASC']));
  await idx('idx_payment',   () => databases.createIndex(DATABASE_ID, C, 'idx_payment',   'key', ['paymentId'], ['ASC']));
}

// ===============================================================
(async () => {
  console.log('🏗️  Création du module Trésorerie');
  console.log(`   Endpoint : ${ENDPOINT}`);
  console.log(`   Projet   : ${PROJECT_ID}`);
  console.log(`   Base     : ${DATABASE_ID}`);

  await buildPayments();
  await buildExpenses();
  await buildBankAccounts();
  await buildReconciliations();

  console.log('\n🎉 PARTIE A TERMINÉE — 4 collections prêtes.');
  console.log('   Vérifie dans Appwrite Console → Databases → ' + DATABASE_ID);
})().catch(e => {
  console.error('\n💥 Erreur fatale:', e?.message || e);
  process.exit(1);
});