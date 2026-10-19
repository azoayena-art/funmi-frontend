// ============================================================
// ⚙️ CONFIG APPWRITE — API REST DIRECTE (sans SDK node-appwrite)
// ============================================================

const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.DATABASE_ID || process.env.APPWRITE_DATABASE_ID || 'relancepro_db';

const apiHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Appwrite-Project': PROJECT_ID,
  'X-Appwrite-Key': API_KEY,
});

// Helpers de requêtes (méthodes officielles Appwrite uniquement)
const Q = {
  equal: (attr, val) => JSON.stringify({ method: 'equal', attribute: attr, values: Array.isArray(val) ? val : [val] }),
  orderDesc: (attr) => JSON.stringify({ method: 'orderDesc', attribute: attr, values: [] }),
  limit: (n) => JSON.stringify({ method: 'limit', values: [n] }),
};

async function listDocuments(collectionId, queries = []) {
  const params = new URLSearchParams();
  queries.forEach((qq) => params.append('queries[]', qq));
  const url = `${ENDPOINT}/databases/${DATABASE_ID}/collections/${collectionId}/documents?${params.toString()}`;
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`Appwrite list ${collectionId} ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.documents || [];
}

async function createDocument(collectionId, data, permissions = []) {
  const res = await fetch(`${ENDPOINT}/databases/${DATABASE_ID}/collections/${collectionId}/documents`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ documentId: 'unique()', data, permissions }),
  });
  if (!res.ok) throw new Error(`Appwrite create ${collectionId} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ============================================================
// 🎯 TEMPLATES (identiques à Reminders.tsx)
// ============================================================

const quoteTemplates = {
  1: `Bonjour {clientName},\n\nJe me permets de revenir vers vous concernant le devis n°{number} que je vous ai transmis le {date} pour un montant de {amount}.\n\nAvez-vous pu en prendre connaissance ? Je reste à votre entière disposition pour répondre à vos questions ou ajuster l'offre selon vos besoins.\n\nVous pouvez consulter et accepter le devis en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  2: `Bonjour {clientName},\n\nJe fais suite à mon précédent message concernant le devis n°{number} d'un montant de {amount}, transmis le {date}.\n\nJe n'ai pas reçu de retour de votre part et je souhaitais m'assurer que vous aviez bien reçu notre proposition.\n\nVous pouvez consulter et accepter le devis en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  3: `Bonjour {clientName},\n\nJe me permets de vous recontacter une dernière fois concernant le devis n°{number} d'un montant de {amount}.\n\nNotre offre arrive à expiration prochainement. Sans retour de votre part sous 7 jours, nous considérerons cette offre comme caduque.\n\nVous pouvez consulter et accepter le devis en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
};

const invoiceTemplates = {
  1: `Bonjour {clientName},\n\nSauf erreur ou omission de notre part, la facture n°{number} d'un montant de {amount}, arrivée à échéance le {date}, n'a pas encore été réglée.\n\nNous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.\n\nVous pouvez consulter et régler la facture en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  2: `Bonjour {clientName},\n\nMalgré notre précédente relance, nous constatons que la facture n°{number} d'un montant de {amount}, échue le {date}, n'a toujours pas été réglée.\n\nNous vous prions de bien vouloir procéder au règlement sous 8 jours.\n\nVous pouvez consulter et régler la facture en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  3: `MISE EN DEMEURE DE PAYER\n\n{clientName},\n\nMalgré nos multiples relances, la facture n°{number} d'un montant de {amount}, échue le {date}, demeure impayée à ce jour.\n\nPar la présente, nous vous mettons en demeure de procéder au règlement intégral de cette somme sous 8 jours.\n\nVous pouvez consulter et régler la facture en ligne via ce lien :\n{link}\n\n{companyName}`,
};

// ============================================================
// 🛠️ HELPERS
// ============================================================

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const formatCurrency = (amount, symbol = '€') => `${round2(amount).toFixed(2)} ${symbol}`;

const buildMessage = (type, level, vars) => {
  const templates = type === 'quote' ? quoteTemplates : invoiceTemplates;
  const template = templates[level] || templates[1];
  return template
    .replace(/{clientName}/g, vars.clientName)
    .replace(/{number}/g, vars.number)
    .replace(/{amount}/g, vars.amount)
    .replace(/{date}/g, vars.date)
    .replace(/{link}/g, vars.link)
    .replace(/{companyName}/g, vars.companyName);
};

const isWeekend = () => {
  const day = new Date().getDay();
  return day === 0 || day === 6;
};

// ============================================================
// 📧 ENVOI EMAILJS (API REST) — try/catch complet
// ============================================================

import crypto from 'crypto';

async function sendEmail(to, subject, message, companyName) {
  try {
    // ✅ Variables EXACTES correspondant à votre template EmailJS
    const templateParams = {
      to_email: to,
      to_name: to.split('@')[0],
      reply_to: 'noreply@relancepro.com', // ou votre email de réponse
      message: message,
      from_name: companyName || 'RelancePro',
    };

    const requestBody = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      template_params: templateParams,
    };

    // 🔐 Strict mode : accessToken = private key
    if (process.env.EMAILJS_PRIVATE_KEY) {
      requestBody.accessToken = process.env.EMAILJS_PRIVATE_KEY;
    }

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`EmailJS ${response.status}: ${text}`);
    }
    return true;
  } catch (e) {
    const cause = e?.cause ? `${e.cause.code || ''} ${e.cause.message || ''}`.trim() : '';
    throw new Error(`EmailJS fetch échec: ${e.message}${cause ? ' | cause: ' + cause : ''}`);
  }
}
// ============================================================
// 💾 TRAÇABILITÉ DANS FOLLOWUPS
// ============================================================

async function recordFollowup(teamId, type, targetId, number, clientName, level, message, email) {
  const now = new Date().toISOString();
  const teamRole = `team:${teamId}`;
  await createDocument('followups', {
    scheduledAt: now,
    teamId,
    userId: 'system-cron',
    targetType: type,
    targetId,
    relatedNumber: number,
    clientName,
    level: String(level),
    followupType: 'relance_auto',
    channel: 'email',
    sentAt: now,
    status: 'sent',
    message,
    recipientEmail: email || '',
  }, [
    `read("${teamRole}")`,
    `update("${teamRole}")`,
    `delete("${teamRole}")`,
  ]);
}

// ============================================================
// 🚀 MAIN (CRON) — try/catch global
// ============================================================

export default async function ({ req, res, log, error }) {
  try {
    log('🚀 Démarrage du cron auto-reminders (EmailJS, REST pur)');

    // 🛑 Week-end (sauf mode test ALLOW_WEEKEND=true)
    if (isWeekend() && process.env.ALLOW_WEEKEND !== 'true') {
      log('📅 Week-end détecté — aucune relance envoyée.');
      return res.json({ skipped: true, reason: 'weekend' });
    }
    if (isWeekend()) {
      log('⚠️ MODE TEST : week-end autorisé via ALLOW_WEEKEND');
    }

    // ✅ Vérifications de configuration
    if (!PROJECT_ID || !API_KEY) {
      error('❌ Variables APPWRITE_PROJECT_ID / APPWRITE_API_KEY manquantes');
      return res.json({ error: 'Config Appwrite manquante' });
    }
    if (!process.env.EMAILJS_SERVICE_ID || !process.env.EMAILJS_TEMPLATE_ID || !process.env.EMAILJS_PUBLIC_KEY) {
      error('❌ Variables EmailJS manquantes (EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_PUBLIC_KEY)');
      return res.json({ error: 'EmailJS non configuré' });
    }

    const BASE_URL = process.env.BASE_URL || 'https://votre-domaine.com';
    const teams = await listDocuments('teams', [Q.limit(100)]);
    let totalSent = 0;
    let totalFailed = 0;
    const report = [];

    for (const team of teams) {
      const teamId = team.$id;
      log(`\n=== Équipe ${teamId} ===`);

      let quotes = [];
      let invoices = [];
      let followups = [];
      try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const [qRes, iRes, fRes] = await Promise.all([
          listDocuments('quotes', [Q.equal('teamId', teamId), Q.limit(500)]),
          listDocuments('invoices', [Q.equal('teamId', teamId), Q.limit(500)]),
          // ✅ PAS de requête range : orderDesc + filtrage 24h côté code
          listDocuments('followups', [Q.equal('teamId', teamId), Q.orderDesc('$createdAt'), Q.limit(200)]),
        ]);
        quotes = qRes;
        invoices = iRes;
        followups = fRes.filter((f) => f.sentAt >= since24h);
      } catch (e) {
        error(`Erreur chargement équipe ${teamId}: ${e.message}`);
        continue;
      }

      // Nom de l'entreprise (signature des emails)
      let companyName = 'Votre entreprise';
      try {
        const sRes = await listDocuments('company_settings', [Q.equal('userId', team.ownerId || ''), Q.limit(1)]);
        if (sRes.length > 0) companyName = sRes[0].name || companyName;
      } catch (e) { /* ignore */ }

      // Anti-doublon : déjà relancé dans les dernières 24h
      const sentRecently = new Set(followups.map((f) => `${f.targetType}:${f.targetId}`));
      const today = new Date();

      // ---------- DEVIS ----------
      for (const quote of quotes) {
        if (quote.status !== 'Envoyé' || !quote.clientEmail) continue;
        const issueDate = new Date(quote.issueDate || '');
        const daysSinceSent = Math.floor((today - issueDate) / (1000 * 60 * 60 * 24));
        const validityDate = quote.validityDate ? new Date(quote.validityDate) : null;
        const daysUntilExpiry = validityDate ? Math.floor((validityDate - today) / (1000 * 60 * 60 * 24)) : null;

        let level = null;
        if (daysUntilExpiry !== null && daysUntilExpiry < 0) level = 3;
        else if (daysUntilExpiry !== null && daysUntilExpiry <= 3) level = 2;
        else if (daysSinceSent >= 15) level = 3;
        else if (daysSinceSent >= 7) level = 2;
        else if (daysSinceSent >= 3) level = 1;
        if (!level) continue;

        const key = `quote:${quote.$id}`;
        if (sentRecently.has(key)) continue;

        const message = buildMessage('quote', level, {
          clientName: quote.clientName,
          number: quote.quoteNumber,
          amount: formatCurrency(quote.total || 0),
          date: issueDate.toLocaleDateString('fr-FR'),
          link: quote.clientToken ? `${BASE_URL}/v/${quote.clientToken}` : '[Lien non disponible]',
          companyName,
        });

        try {
          await sendEmail(quote.clientEmail, `Relance - Devis n°${quote.quoteNumber}`, message, companyName);
          await recordFollowup(teamId, 'quote', quote.$id, quote.quoteNumber, quote.clientName, level, message, quote.clientEmail);
          sentRecently.add(key);
          totalSent++;
          report.push({ type: 'quote', number: quote.quoteNumber, level });
          log(`✅ Devis ${quote.quoteNumber} relancé (niveau ${level})`);
        } catch (e) {
          error(`❌ Échec devis ${quote.quoteNumber}: ${e.message}`);
          totalFailed++;
        }
      }

      // ---------- FACTURES ----------
      for (const invoice of invoices) {
        if (['paid', 'cancelled'].includes(invoice.status)) continue;
        if (invoice.type === 'credit' || !invoice.clientEmail) continue;
        const balance = invoice.balance ?? invoice.total ?? 0;
        if (balance <= 0) continue;

        let level = null;
        let subjectPrefix = 'Facture';

        // E-Factures transmises sans réponse
        if (invoice.isElectronic && invoice.transmissionStatus === 'transmitted') {
          const transmittedDate = new Date(invoice.$updatedAt || invoice.issueDate || '');
          const days = Math.floor((today - transmittedDate) / (1000 * 60 * 60 * 24));
          if (days >= 7) level = 2;
          else if (days >= 3) level = 1;
          if (level) subjectPrefix = 'E-Facture';
        }

        // Factures classiques en retard
        if (!level && invoice.dueDate) {
          const daysOverdue = Math.floor((today - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));
          if (daysOverdue >= 30) level = 3;
          else if (daysOverdue >= 15) level = 2;
          else if (daysOverdue > 0) level = 1;
        }
        if (!level) continue;

        const key = `invoice:${invoice.$id}`;
        if (sentRecently.has(key)) continue;

        const message = buildMessage('invoice', level, {
          clientName: invoice.clientName,
          number: invoice.invoiceNumber,
          amount: formatCurrency(balance),
          date: new Date(invoice.dueDate || invoice.issueDate || '').toLocaleDateString('fr-FR'),
          link: invoice.clientToken ? `${BASE_URL}/f/${invoice.clientToken}` : '[Lien non disponible]',
          companyName,
        });

        try {
          await sendEmail(invoice.clientEmail, `Relance - ${subjectPrefix} n°${invoice.invoiceNumber}`, message, companyName);
          await recordFollowup(teamId, 'invoice', invoice.$id, invoice.invoiceNumber, invoice.clientName, level, message, invoice.clientEmail);
          sentRecently.add(key);
          totalSent++;
          report.push({ type: subjectPrefix.toLowerCase(), number: invoice.invoiceNumber, level });
          log(`✅ ${subjectPrefix} ${invoice.invoiceNumber} relancée (niveau ${level})`);
        } catch (e) {
          error(`❌ Échec ${subjectPrefix} ${invoice.invoiceNumber}: ${e.message}`);
          totalFailed++;
        }
      }
    }

    log(`\n🎯 BILAN : ${totalSent} envoyée(s), ${totalFailed} échec(s)`);
    return res.json({
      success: true,
      sent: totalSent,
      failed: totalFailed,
      details: report,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    const cause = err?.cause ? `${err.cause.code || ''} ${err.cause.message || ''}`.trim() : '';
    error(`💥 Erreur fatale: ${err.message}${cause ? ' | cause: ' + cause : ''}`);
    return res.json({ success: false, fatal: err.message, cause: cause || null });
  }
}