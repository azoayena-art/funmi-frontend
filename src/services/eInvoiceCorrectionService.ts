/**
 * ============================================================
 * 🔧 SERVICE DE CORRECTION ET RE-TRANSMISSION E-FACTURE
 * ============================================================
 * Gère la correction d'une e-facture rejetée et sa re-transmission.
 * ============================================================
 */

import { databases, DATABASE_ID } from '../appwrite';
import { transmitToPPF } from './eInvoiceTransmissionService';

export interface CorrectionResult {
  success: boolean;
  message?: string;
  newTransmissionReference?: string;
}

/**
 * Corrige et re-transmet une e-facture rejetée
 */
export const correctAndRetransmit = async (
  invoiceId: string,
  teamId: string,
  userId: string,
  corrections: {
    xmlContent?: string;
    clientName?: string;
    clientAddress?: string;
    clientEmail?: string;
    total?: number;
    notes?: string;
  }
): Promise<CorrectionResult> => {
  try {
    // 1. Vérifier que la facture est bien rejetée
    const invoice = await databases.getDocument(DATABASE_ID, 'invoices', invoiceId) as any;

    if (invoice.transmissionStatus !== 'rejected') {
      return {
        success: false,
        message: 'Seules les factures rejetées peuvent être corrigées et re-transmises.',
      };
    }

    // 2. Appliquer les corrections
    const updatePayload: any = {
      ...corrections,
      transmissionStatus: 'ready',
      lastRejectionReason: invoice.rejectionReason || '',
      correctedAt: new Date().toISOString(),
      correctedBy: userId,
      correctionCount: (invoice.correctionCount || 0) + 1,
    };

    await databases.updateDocument(DATABASE_ID, 'invoices', invoiceId, updatePayload);

    // 3. Journaliser la correction
    try {
      await databases.createDocument(DATABASE_ID, 'accounting_events', 'unique()', {
        teamId,
        data: JSON.stringify({
          type: 'einvoice_corrected',
          documentType: 'invoice',
          documentId: invoiceId,
          documentNumber: invoice.invoiceNumber,
          previousRejectionReason: invoice.rejectionReason,
          correctionsApplied: Object.keys(corrections),
          eventDate: new Date().toISOString(),
          createdBy: userId,
        }),
      });
    } catch (e) {
      console.warn('Événement correction non tracé:', e);
    }

    // 4. Re-transmettre à la plateforme
    const updatedInvoice = await databases.getDocument(DATABASE_ID, 'invoices', invoiceId) as any;
    const transmissionResult = await transmitToPPF(updatedInvoice, teamId, userId);

    if (!transmissionResult.success) {
      return {
        success: false,
        message: `Facture corrigée mais échec de re-transmission : ${transmissionResult.errorMessage}`,
      };
    }

    return {
      success: true,
      message: 'Facture corrigée et re-transmise avec succès.',
      newTransmissionReference: transmissionResult.transmissionReference,
    };
  } catch (e: any) {
    console.error('Erreur correction/re-transmission:', e);
    return {
      success: false,
      message: `Erreur : ${e.message}`,
    };
  }
};