/**
 * ============================================================
 * 📧 SERVICE DE NOTIFICATIONS EMAIL - CONFIGURATION DYNAMIQUE
 * ============================================================
 * Charge les paramètres EmailJS depuis Appwrite (par équipe).
 * Fallback vers les variables .env si non configuré.
 * ============================================================
 */

import emailjs from '@emailjs/browser';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';

// ============================================================
// 🔧 CONFIGURATION (fallback .env)
// ============================================================

const ENV_CONFIG = {
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID || '',
  templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '',
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '',
};

// ============================================================
// 📋 TYPES
// ============================================================

export interface EmailJSConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
  fromName: string;
  source: 'user' | 'env' | 'none';
}

export type NotificationType =
  | 'transmission_sent'
  | 'transmission_accepted'
  | 'transmission_rejected'
  | 'transmission_failed'
  | 'reminder_pending';

export interface EmailNotificationData {
  type: NotificationType;
  toEmail: string;
  toName: string;
  invoiceNumber: string;
  clientName: string;
  amount: number;
  currencySymbol?: string;
  rejectionReason?: string;
  platform?: string;
  transmissionReference?: string;
  companyName?: string;
  dueDate?: string;
}

// ============================================================
// 🗂️ CACHE (évite les appels Appwrite répétés)
// ============================================================

const configCache = new Map<string, EmailJSConfig>();

/**
 * Charge la configuration EmailJS pour une équipe
 * Priorité : Appwrite (user) > .env (fallback)
 */
export const loadEmailConfig = async (teamId?: string): Promise<EmailJSConfig> => {
  const cacheKey = teamId || 'global';
  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey)!;
  }

  let config: EmailJSConfig = {
    serviceId: ENV_CONFIG.serviceId,
    templateId: ENV_CONFIG.templateId,
    publicKey: ENV_CONFIG.publicKey,
    fromName: 'RelancePro',
    source: ENV_CONFIG.serviceId ? 'env' : 'none',
  };

  if (teamId) {
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'einvoice_settings', [
        Query.equal('teamId', teamId),
        Query.limit(1),
      ]);

      if (res.documents.length > 0) {
        const doc = res.documents[0] as any;
        if (doc.emailjsServiceId && doc.emailjsTemplateId && doc.emailjsPublicKey) {
          config = {
            serviceId: doc.emailjsServiceId,
            templateId: doc.emailjsTemplateId,
            publicKey: doc.emailjsPublicKey,
            fromName: doc.emailjsFromName || 'RelancePro',
            source: 'user',
          };
          console.log('📧 Config EmailJS chargée depuis Appwrite (utilisateur)');
        } else {
          console.log('📧 Config EmailJS fallback vers .env');
        }
      }
    } catch (e) {
      console.warn('⚠️ Erreur chargement config EmailJS:', e);
    }
  }

  configCache.set(cacheKey, config);
  return config;
};

/**
 * Invalide le cache (après sauvegarde des paramètres)
 */
export const invalidateEmailConfigCache = (teamId?: string) => {
  if (teamId) configCache.delete(teamId);
  else configCache.clear();
};

// ============================================================
// 🎨 TEMPLATES
// ============================================================

const EMAIL_SUBJECTS: Record<NotificationType, string> = {
  transmission_sent: '📤 Facture transmise - {invoice_number}',
  transmission_accepted: '✅ Facture acceptée - {invoice_number}',
  transmission_rejected: '❌ Facture REJETÉE - {invoice_number}',
  transmission_failed: '⚠️ Échec de transmission - {invoice_number}',
  reminder_pending: '⏰ Rappel - Facture en attente {invoice_number}',
};

const EMAIL_CONTENT: Record<NotificationType, (data: EmailNotificationData) => string> = {
  transmission_rejected: (data) => `
🚨 ALERTE : FACTURE REJETÉE

Bonjour ${data.toName},

⚠️ Votre facture ${data.invoiceNumber} a été REJETÉE par ${data.clientName || 'le client'}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DÉTAILS DE LA FACTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Numéro : ${data.invoiceNumber}
• Client : ${data.clientName}
• Montant : ${data.amount.toFixed(2)} ${data.currencySymbol || '€'}
• Plateforme : ${data.platform || 'PPF'}
• Référence : ${data.transmissionReference || 'N/A'}
• Date : ${new Date().toLocaleDateString('fr-FR')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ MOTIF DU REJET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.rejectionReason || 'Motif non spécifié par la plateforme'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 ACTIONS RECOMMANDÉES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Vérifiez les informations du client (SIRET, adresse)
2. Corrigez la facture dans RelancePro
3. Re-transmettez la facture corrigée
4. Contactez le client si nécessaire

Cordialement,
${data.companyName || 'RelancePro'}
  `.trim(),

  transmission_accepted: (data) => `
✅ FACTURE ACCEPTÉE

Bonjour ${data.toName},

🎉 Bonne nouvelle ! Votre facture ${data.invoiceNumber} a été ACCEPTÉE par ${data.clientName || 'le client'}.

• Numéro : ${data.invoiceNumber}
• Client : ${data.clientName}
• Montant : ${data.amount.toFixed(2)} ${data.currencySymbol || '€'}
• Référence : ${data.transmissionReference || 'N/A'}
• Date : ${new Date().toLocaleDateString('fr-FR')}

💡 Pensez à suivre le paiement dans RelancePro.

Cordialement,
${data.companyName || 'RelancePro'}
  `.trim(),

  transmission_sent: (data) => `
📤 FACTURE TRANSMISE

Bonjour ${data.toName},

Votre facture ${data.invoiceNumber} a été transmise avec succès à ${data.clientName || 'votre client'} via ${data.platform || 'PPF'}.

• Numéro : ${data.invoiceNumber}
• Montant : ${data.amount.toFixed(2)} ${data.currencySymbol || '€'}
• Référence : ${data.transmissionReference || 'N/A'}

Vous recevrez une notification dès que le client aura répondu.

Cordialement,
${data.companyName || 'RelancePro'}
  `.trim(),

  transmission_failed: (data) => `
⚠️ ÉCHEC DE TRANSMISSION

Bonjour ${data.toName},

❌ La transmission de la facture ${data.invoiceNumber} a ÉCHOUÉ.

• Numéro : ${data.invoiceNumber}
• Client : ${data.clientName}
• Erreur : ${data.rejectionReason || 'Erreur technique'}

🔧 ACTIONS :
1. Vérifiez votre connexion
2. Réessayez la transmission
3. Si le problème persiste, contactez le support

Cordialement,
${data.companyName || 'RelancePro'}
  `.trim(),

  reminder_pending: (data) => `
⏰ RAPPEL : FACTURE EN ATTENTE

Bonjour ${data.toName},

La facture ${data.invoiceNumber} est en attente de réponse du client depuis plusieurs jours.

• Numéro : ${data.invoiceNumber}
• Client : ${data.clientName}
• Montant : ${data.amount.toFixed(2)} ${data.currencySymbol || '€'}

💡 Pensez à relancer votre client.

Cordialement,
${data.companyName || 'RelancePro'}
  `.trim(),
};

// ============================================================
// 📧 FONCTION D'ENVOI
// ============================================================

export const sendEmailNotification = async (
  data: EmailNotificationData,
  teamId?: string
): Promise<{ success: boolean; error?: string }> => {
  const config = await loadEmailConfig(teamId);

  if (config.source === 'none') {
    console.warn('⚠️ EmailJS non configuré (ni Appwrite ni .env)');
    return { success: false, error: 'EmailJS non configuré' };
  }

  try {
    const subject = EMAIL_SUBJECTS[data.type].replace('{invoice_number}', data.invoiceNumber);
    const message = EMAIL_CONTENT[data.type](data);

    const templateParams = {
      to_email: data.toEmail,
      to_name: data.toName,
      subject,
      message,
      invoice_number: data.invoiceNumber,
      client_name: data.clientName,
      amount: data.amount.toFixed(2),
      rejection_reason: data.rejectionReason || '',
      platform: data.platform || 'PPF',
      transmission_reference: data.transmissionReference || '',
      date: new Date().toLocaleDateString('fr-FR'),
      company_name: data.companyName || config.fromName,
    };

    console.log(`📧 Envoi email [${config.source}] à:`, data.toEmail);

    const response = await emailjs.send(
      config.serviceId,
      config.templateId,
      templateParams,
      config.publicKey
    );

    if (response.status === 200) {
      console.log('✅ Email envoyé avec succès');
      return { success: true };
    }
    return { success: false, error: `Status: ${response.status}` };
  } catch (error: any) {
    console.error('❌ Erreur EmailJS:', error.text || error.message);
    return { success: false, error: error.text || error.message };
  }
};

// ============================================================
// 🔔 FONCTIONS SPÉCIFIQUES
// ============================================================

export const notifyRejection = async (data: Omit<EmailNotificationData, 'type'>, teamId?: string) => {
  return sendEmailNotification({ ...data, type: 'transmission_rejected' }, teamId);
};

export const notifyAcceptance = async (data: Omit<EmailNotificationData, 'type'>, teamId?: string) => {
  return sendEmailNotification({ ...data, type: 'transmission_accepted' }, teamId);
};

export const notifyTransmission = async (data: Omit<EmailNotificationData, 'type'>, teamId?: string) => {
  return sendEmailNotification({ ...data, type: 'transmission_sent' }, teamId);
};

export const notifyFailure = async (data: Omit<EmailNotificationData, 'type'>, teamId?: string) => {
  return sendEmailNotification({ ...data, type: 'transmission_failed' }, teamId);
};

// ============================================================
// ⚙️ TEST DE CONFIGURATION
// ============================================================

export const testEmailConfiguration = async (
  testEmail: string,
  customConfig?: { serviceId: string; templateId: string; publicKey: string },
  teamId?: string
): Promise<{ success: boolean; message: string; source?: string }> => {
  let config: EmailJSConfig;

  if (customConfig && customConfig.serviceId && customConfig.templateId && customConfig.publicKey) {
    config = { ...customConfig, fromName: 'RelancePro', source: 'user' };
  } else {
    config = await loadEmailConfig(teamId);
  }

  if (config.source === 'none') {
    return {
      success: false,
      message: 'EmailJS non configuré. Renseignez vos identifiants ci-dessus ou configurez les variables .env.',
    };
  }

  try {
    const response = await emailjs.send(
      config.serviceId,
      config.templateId,
      {
        to_email: testEmail,
        to_name: 'Test',
        subject: '🧪 Test de configuration RelancePro',
        message: `Ceci est un email de test.\n\nSource de configuration : ${config.source === 'user' ? 'Vos paramètres personnalisés' : 'Variables .env (défaut)'}\n\nLa configuration EmailJS fonctionne correctement !`,
        invoice_number: 'TEST-001',
        client_name: 'Test',
        amount: '0.00',
        rejection_reason: '',
        platform: 'TEST',
        transmission_reference: '',
        date: new Date().toLocaleDateString('fr-FR'),
        company_name: 'RelancePro',
      },
      config.publicKey
    );

    if (response.status === 200) {
      return {
        success: true,
        message: config.source === 'user'
          ? '✅ Vos paramètres EmailJS fonctionnent !'
          : '✅ Configuration par défaut (.env) fonctionnelle !',
        source: config.source,
      };
    }
    return { success: false, message: `Erreur inattendue (status ${response.status})` };
  } catch (error: any) {
    return {
      success: false,
      message: `Erreur : ${error.text || error.message}`,
    };
  }
};
// ============================================================
// 📨 ENVOI GÉNÉRIQUE (RELANCES)
// ============================================================

export const sendRawEmail = async (
  toEmail: string,
  subject: string,
  message: string,
  teamId?: string
): Promise<{ success: boolean; error?: string; source?: string }> => {
  const config = await loadEmailConfig(teamId);
  if (config.source === 'none') {
    return { success: false, error: 'EmailJS non configuré (ni paramètres équipe, ni .env)' };
  }
  try {
    const response = await emailjs.send(
      config.serviceId,
      config.templateId,
      {
        to_email: toEmail,
        to_name: toEmail.split('@')[0],
        subject,
        message,
        company_name: config.fromName || 'RelancePro',
      },
      config.publicKey
    );
    if (response.status === 200) return { success: true, source: config.source };
    return { success: false, error: `Statut EmailJS : ${response.status}` };
  } catch (error: any) {
    console.error('❌ Erreur sendRawEmail:', error?.text || error?.message);
    return { success: false, error: error?.text || error?.message };
  }
};