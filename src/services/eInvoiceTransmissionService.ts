/**
 * ============================================================
 * 🏛️ SERVICE DE TRANSMISSION E-FACTURE - SIMULATION PPF
 * ============================================================
 * Simule la transmission des e-factures au Portail Public de
 * Facturation (PPF / Chorus Pro) et les réponses du client.
 *
 * Fonctionnalités :
 * - Transmission avec accusé technique (95% de succès)
 * - Réponse du destinataire simulée (90% d'acceptation)
 * - Enregistrement des événements dans `einvoice_events`
 *   (traçabilité légale 6 ans)
 * - Notifications email configurables par équipe
 * - Historique robuste avec fallbacks (index manquants)
 *
 * ⚠️ SCHÉMA einvoice_events (attributs OBLIGATOIRES) :
 *    teamId, userId, invoiceId, status, createdAt (datetime)
 *    → `createdAt` doit TOUJOURS être fourni (sinon rejet 400)
 * ============================================================
 */

import { databases, DATABASE_ID } from '../appwrite';
import { ID, Query } from 'appwrite';
import {
  notifyRejection,
  notifyAcceptance,
  notifyTransmission,
  notifyFailure,
} from './emailNotificationService';

// ============================================================
// 📐 TYPES
// ============================================================

export interface TransmissionResult {
  success: boolean;
  transmissionReference?: string;
  errorMessage?: string;
  xmlContent?: string;
  status?: 'accepted' | 'rejected' | 'transmitted';
}

interface NotificationConfig {
  email: string;
  notifyOnRejection: boolean;
  notifyOnAcceptance: boolean;
  notifyOnTransmission: boolean;
}

// ============================================================
// ⚙️ CONFIGURATION DE SIMULATION
// ============================================================

const SIMULATION_CONFIG = {
  TECHNICAL_ACK_DELAY: 1500,      // Délai d'accusé technique (ms)
  RECIPIENT_RESPONSE_DELAY: 3000, // Délai de réponse client (ms)
  SUCCESS_RATE: 95,               // % de succès technique
  ACCEPTANCE_RATE: 90,            // % d'acceptation client
};

const REJECTION_REASONS = [
  'SIRET destinataire invalide',
  'Adresse de facturation incomplète',
  'Numéro de TVA manquant',
  'Format XML non conforme',
  'Doublon détecté',
  'Montant incorrect selon le bon de commande',
];

// ============================================================
// 🔧 HELPERS INTERNES
// ============================================================

/**
 * Génère une référence de transmission unique (format PPF)
 */
const generateTransmissionReference = (): string => {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 9999999999).toString().padStart(10, '0');
  return `PPF-${year}-${random}`;
};

/**
 * Valide qu'une facture est prête à être transmise
 */
const validateForTransmission = (invoice: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (!invoice.isElectronic) errors.push("Cette facture n'est pas une e-facture.");
  if (invoice.transmissionStatus !== 'ready') errors.push(`Statut invalide : ${invoice.transmissionStatus}`);
  if (!invoice.xmlContent || invoice.xmlContent.length < 100) errors.push('XML manquant ou invalide.');
  if (!invoice.companySiret) errors.push('SIRET entreprise manquant.');
  return { valid: errors.length === 0, errors };
};

/**
 * ✅ Enregistre un événement dans einvoice_events.
 * ⚠️ IMPORTANT : l'attribut `createdAt` (datetime) est OBLIGATOIRE
 * dans le schéma de la collection → toujours fourni ici.
 */
const recordEvent = async (params: {
  teamId: string;
  userId: string;
  invoice: any;
  eventType: 'transmission' | 'transmission_failed' | 'recipient_response';
  status: string;
  transmissionReference?: string | null;
  errorMessage?: string | null;
  platform?: string | null;
}): Promise<void> => {
  try {
    await databases.createDocument(DATABASE_ID, 'einvoice_events', ID.unique(), {
      teamId: params.teamId,
      userId: params.userId,
      invoiceId: params.invoice.$id,
      invoiceNumber: params.invoice.invoiceNumber || '',
      eventType: params.eventType,
      platform: params.platform || params.invoice.einvoicePlatform || 'simulation',
      transmissionReference: params.transmissionReference || null,
      status: params.status,
      errorMessage: params.errorMessage || null,
      eventDate: new Date().toISOString(),
      createdAt: new Date().toISOString(), // ✅ ATTRIBUT OBLIGATOIRE (datetime)
      createdBy: params.userId,
    });
    console.log(`✅ Événement enregistré : ${params.eventType} → ${params.status}`);
  } catch (e: any) {
    console.warn('⚠️ Événement non enregistré:', e.message);
  }
};

/**
 * 📧 Charge l'email + préférences de notification d'une équipe.
 * Priorité :
 *  1. einvoice_settings.notificationEmail (email dédié)
 *  2. company_settings.email (via teamId)
 *  3. company_settings.email (via userId)
 */
const getNotificationConfig = async (teamId: string, userId: string): Promise<NotificationConfig> => {
  const config: NotificationConfig = {
    email: '',
    notifyOnRejection: true,
    notifyOnAcceptance: true,
    notifyOnTransmission: true,
  };

  // 1. einvoice_settings (email dédié + préférences)
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'einvoice_settings', [
      Query.equal('teamId', teamId),
      Query.limit(1),
    ]);
    if (res.documents.length > 0) {
      const doc = res.documents[0] as any;
      if (doc.notificationEmail && doc.notificationEmail.trim() !== '') {
        config.email = doc.notificationEmail.trim();
        console.log('📧 Email dédié trouvé:', config.email);
      }
      config.notifyOnRejection = doc.notifyOnRejection !== false;
      config.notifyOnAcceptance = doc.notifyOnAcceptance !== false;
      config.notifyOnTransmission = doc.notifyOnTransmission !== false;
      console.log('⚙️ Préférences notifications:', {
        notifyOnRejection: config.notifyOnRejection,
        notifyOnAcceptance: config.notifyOnAcceptance,
        notifyOnTransmission: config.notifyOnTransmission,
      });
    }
  } catch (e) {
    console.warn('Erreur chargement einvoice_settings:', e);
  }

  // 2. Fallback : company_settings (teamId)
  if (!config.email) {
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
        Query.equal('teamId', teamId),
        Query.limit(1),
      ]);
      if (res.documents.length > 0) {
        config.email = (res.documents[0] as any).email || '';
        console.log('📧 Email fallback (équipe):', config.email);
      }
    } catch (e) {
      console.warn('Erreur chargement company_settings:', e);
    }
  }

  // 3. Fallback : company_settings (userId)
  if (!config.email) {
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
        Query.equal('userId', userId),
        Query.limit(1),
      ]);
      if (res.documents.length > 0) {
        config.email = (res.documents[0] as any).email || '';
        console.log('📧 Email fallback (utilisateur):', config.email);
      }
    } catch (e) {
      console.warn('Erreur chargement company_settings (userId):', e);
    }
  }

  return config;
};

// ============================================================
// 📤 TRANSMISSION À LA PLATEFORME (SIMULATION)
// ============================================================

export const transmitToPPF = async (
  invoice: any,
  teamId: string,
  userId: string
): Promise<TransmissionResult> => {
  try {
    // 1. Validation avant transmission
    const validation = validateForTransmission(invoice);
    if (!validation.valid) {
      return { success: false, errorMessage: validation.errors.join(', ') };
    }

    // 2. Accusé technique simulé
    await new Promise(resolve => setTimeout(resolve, SIMULATION_CONFIG.TECHNICAL_ACK_DELAY));

    // 3. Échec technique simulé (5% des cas)
    const successRandom = Math.random() * 100;
    if (successRandom > SIMULATION_CONFIG.SUCCESS_RATE) {
      const errorMessage = 'Erreur technique simulée : plateforme indisponible (code 503)';

      // ✅ Événement tracé (statut rejected → affiché 🔴 dans la timeline)
      await recordEvent({
        teamId,
        userId,
        invoice,
        eventType: 'transmission_failed',
        status: 'rejected',
        errorMessage,
        transmissionReference: null,
      });

      // ✅ Notification email d'échec
      const config = await getNotificationConfig(teamId, userId);
      if (config.email) {
        await notifyFailure({
          toEmail: config.email,
          toName: invoice.companyName || 'Utilisateur',
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName || '',
          amount: invoice.total || 0,
          rejectionReason: errorMessage,
          companyName: invoice.companyName || '',
        }, teamId);
      }

      return { success: false, errorMessage };
    }

    // 4. Succès : référence de transmission
    const transmissionReference = generateTransmissionReference();

    await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
      transmissionStatus: 'transmitted',
      transmissionReference,
    });

    // ✅ Événement tracé
    await recordEvent({
      teamId,
      userId,
      invoice,
      eventType: 'transmission',
      status: 'transmitted',
      transmissionReference,
    });

    // ✅ Notification email de transmission
    const config = await getNotificationConfig(teamId, userId);
    if (config.email && config.notifyOnTransmission) {
      console.log('✅ Envoi notification transmission à:', config.email);
      await notifyTransmission({
        toEmail: config.email,
        toName: invoice.companyName || 'Utilisateur',
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName || '',
        amount: invoice.total || 0,
        platform: invoice.einvoicePlatform === 'ppf' ? 'PPF (Chorus Pro)' : 'PPF (Simulation)',
        transmissionReference,
        companyName: invoice.companyName || '',
      }, teamId);
    } else {
      console.log('⚠️ Notification transmission non envoyée:', {
        hasEmail: !!config.email,
        enabled: config.notifyOnTransmission,
      });
    }

    return { success: true, transmissionReference, status: 'transmitted' };
  } catch (error: any) {
    console.error('Erreur transmission PPF:', error);
    return { success: false, errorMessage: error.message };
  }
};

// ============================================================
// 📥 RÉPONSE DU DESTINATAIRE (SIMULATION)
// ============================================================

export const simulateRecipientResponse = async (
  invoice: any,
  teamId: string,
  userId: string,
  forceStatus?: 'accepted' | 'rejected'
): Promise<TransmissionResult> => {
  try {
    if (invoice.transmissionStatus !== 'transmitted') {
      return { success: false, errorMessage: "La facture doit être transmise d'abord." };
    }

    // Délai de traitement simulé
    await new Promise(resolve => setTimeout(resolve, SIMULATION_CONFIG.RECIPIENT_RESPONSE_DELAY));

    // Détermination du statut final
    let finalStatus: 'accepted' | 'rejected';
    let errorMessage: string | undefined;

    if (forceStatus) {
      finalStatus = forceStatus;
      if (forceStatus === 'rejected') {
        errorMessage = REJECTION_REASONS[Math.floor(Math.random() * REJECTION_REASONS.length)];
      }
    } else {
      const acceptanceRandom = Math.random() * 100;
      finalStatus = acceptanceRandom <= SIMULATION_CONFIG.ACCEPTANCE_RATE ? 'accepted' : 'rejected';
      if (finalStatus === 'rejected') {
        errorMessage = REJECTION_REASONS[Math.floor(Math.random() * REJECTION_REASONS.length)];
      }
    }

    // Mise à jour de la facture
    await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
      transmissionStatus: finalStatus,
      rejectionReason: errorMessage || null,
    });

    // ✅ Événement tracé (avec createdAt obligatoire)
    await recordEvent({
      teamId,
      userId,
      invoice,
      eventType: 'recipient_response',
      status: finalStatus,
      errorMessage: errorMessage || null,
      transmissionReference: invoice.transmissionReference || null,
    });

    // ✅ Notifications email selon le statut
    const config = await getNotificationConfig(teamId, userId);

    if (finalStatus === 'rejected') {
      if (config.email && config.notifyOnRejection) {
        console.log('❌ Envoi notification rejet à:', config.email);
        await notifyRejection({
          toEmail: config.email,
          toName: invoice.companyName || 'Utilisateur',
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName || '',
          amount: invoice.total || 0,
          rejectionReason: errorMessage,
          platform: invoice.einvoicePlatform === 'ppf' ? 'PPF (Chorus Pro)' : 'PPF (Simulation)',
          transmissionReference: invoice.transmissionReference,
          companyName: invoice.companyName || '',
        }, teamId);
      } else {
        console.log('⚠️ Notification rejet non envoyée:', {
          hasEmail: !!config.email,
          enabled: config.notifyOnRejection,
        });
      }
    } else {
      if (config.email && config.notifyOnAcceptance) {
        console.log('✅ Envoi notification acceptation à:', config.email);
        await notifyAcceptance({
          toEmail: config.email,
          toName: invoice.companyName || 'Utilisateur',
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName || '',
          amount: invoice.total || 0,
          transmissionReference: invoice.transmissionReference,
          companyName: invoice.companyName || '',
        }, teamId);
      } else {
        console.log('⚠️ Notification acceptation non envoyée:', {
          hasEmail: !!config.email,
          enabled: config.notifyOnAcceptance,
        });
      }
    }

    return {
      success: true,
      transmissionReference: invoice.transmissionReference,
      status: finalStatus,
      errorMessage,
    };
  } catch (error: any) {
    console.error('Erreur simulation réponse:', error);
    return { success: false, errorMessage: error.message };
  }
};

// ============================================================
// 📜 HISTORIQUE DES TRANSMISSIONS
// ============================================================

/**
 * Récupère l'historique complet des événements d'une e-facture.
 * Stratégie en 3 essais (robuste aux index manquants) :
 *  1. Requête indexée + tri serveur (idx_invoiceId_eventDate)
 *  2. Requête indexée simple + tri client (idx_invoiceId)
 *  3. Sans filtre + filtrage/tri client (ultime fallback)
 */
export const getTransmissionHistory = async (invoiceId: string, teamId: string): Promise<any[]> => {
  const filterAndSort = (docs: any[]) =>
    docs
      .filter((d: any) => d.invoiceId === invoiceId && (!teamId || d.teamId === teamId))
      .sort((a: any, b: any) =>
        new Date(b.eventDate || b.createdAt || 0).getTime() -
        new Date(a.eventDate || a.createdAt || 0).getTime()
      );

  // ✅ Essai 1 : requête indexée + ordre serveur
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'einvoice_events', [
      Query.equal('invoiceId', invoiceId),
      Query.orderDesc('eventDate'),
      Query.limit(100),
    ]);
    console.log(`📜 ${res.documents.length} événement(s) trouvé(s) pour ${invoiceId}`);
    return filterAndSort(res.documents);
  } catch (e: any) {
    console.warn('⚠️ Requête indexée + ordre échouée, fallback:', e.message);
  }

  // ✅ Essai 2 : requête indexée simple + tri client
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'einvoice_events', [
      Query.equal('invoiceId', invoiceId),
      Query.limit(100),
    ]);
    console.log(`📜 Fallback 2 : ${res.documents.length} événement(s) pour ${invoiceId}`);
    return filterAndSort(res.documents);
  } catch (e: any) {
    console.warn('⚠️ Requête indexée simple échouée, fallback final:', e.message);
  }

  // ✅ Essai 3 : sans filtre + filtrage client
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'einvoice_events', [
      Query.limit(500),
    ]);
    const filtered = filterAndSort(res.documents);
    console.log(`📜 Fallback 3 : ${filtered.length} événement(s) pour ${invoiceId}`);
    return filtered;
  } catch (e) {
    console.error('❌ Erreur récupération historique:', e);
    return [];
  }
};