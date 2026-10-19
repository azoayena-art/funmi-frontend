/**
 * ============================================================
 * 🔔 SERVICE DE RELANCES AUTOMATIQUES
 * ============================================================
 * Détecte les factures en retard et propose des relances
 * à J+7, J+15, J+30 après l'échéance.
 * ============================================================
 */

import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';

export interface ReminderConfig {
  daysAfterDue: number;
  level: 'first' | 'second' | 'third';
  label: string;
  tone: 'info' | 'warning' | 'danger';
}

export const REMINDER_LEVELS: ReminderConfig[] = [
  { daysAfterDue: 7, level: 'first', label: 'Relance J+7', tone: 'info' },
  { daysAfterDue: 15, level: 'second', label: 'Relance J+15', tone: 'warning' },
  { daysAfterDue: 30, level: 'third', label: 'Relance J+30 (pré-contentieux)', tone: 'danger' },
];

export interface OverdueInvoice {
  $id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  dueDate: string;
  total: number;
  balance: number;
  daysOverdue: number;
  reminderLevel: ReminderConfig | null;
  lastReminderSent?: string;
  reminderCount: number;
}

/**
 * Calcule le nombre de jours de retard
 */
export const getDaysOverdue = (dueDate: string): number => {
  const diffMs = new Date().getTime() - new Date(dueDate).getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Détermine le niveau de relance selon les jours de retard
 */
export const getReminderLevel = (daysOverdue: number): ReminderConfig | null => {
  if (daysOverdue < 7) return null;
  if (daysOverdue >= 30) return REMINDER_LEVELS[2];
  if (daysOverdue >= 15) return REMINDER_LEVELS[1];
  if (daysOverdue >= 7) return REMINDER_LEVELS[0];
  return null;
};

/**
 * Récupère toutes les factures en retard avec leur niveau de relance
 */
export const getOverdueInvoices = async (teamId: string): Promise<OverdueInvoice[]> => {
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'invoices', [
      Query.equal('teamId', teamId),
      Query.equal('status', ['sent', 'near_due', 'overdue', 'partial']),
      Query.limit(2000),
    ]);

    const overdue: OverdueInvoice[] = [];

    res.documents.forEach((inv: any) => {
      if (!inv.dueDate) return;
      if (inv.balance <= 0) return;
      if (inv.status === 'paid' || inv.status === 'cancelled') return;

      const daysOverdue = getDaysOverdue(inv.dueDate);
      if (daysOverdue <= 0) return;

      const reminderLevel = getReminderLevel(daysOverdue);

      overdue.push({
        $id: inv.$id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.clientName || 'Client inconnu',
        clientEmail: inv.clientEmail,
        clientPhone: inv.clientPhone,
        dueDate: inv.dueDate,
        total: inv.total || 0,
        balance: inv.balance || 0,
        daysOverdue,
        reminderLevel,
        lastReminderSent: inv.lastReminderSent,
        reminderCount: inv.reminderCount || 0,
      });
    });

    return overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
  } catch (e) {
    console.error('Erreur récupération factures en retard:', e);
    return [];
  }
};

/**
 * Marque une relance comme envoyée
 */
export const markReminderSent = async (
  invoiceId: string,
  level: ReminderConfig
): Promise<boolean> => {
  try {
    const inv = await databases.getDocument(DATABASE_ID, 'invoices', invoiceId) as any;
    const newCount = (inv.reminderCount || 0) + 1;

    await databases.updateDocument(DATABASE_ID, 'invoices', invoiceId, {
      lastReminderSent: new Date().toISOString(),
      lastReminderLevel: level.level,
      reminderCount: newCount,
      status: 'overdue',
    });

    // Journaliser l'événement
    try {
      await databases.createDocument(DATABASE_ID, 'accounting_events', 'unique()', {
        teamId: inv.teamId,
        data: JSON.stringify({
          type: 'reminder_sent',
          documentType: 'invoice',
          documentId: invoiceId,
          documentNumber: inv.invoiceNumber,
          reminderLevel: level.level,
          reminderLabel: level.label,
          daysOverdue: getDaysOverdue(inv.dueDate),
          eventDate: new Date().toISOString(),
          createdBy: inv.userId,
        }),
      });
    } catch (e) {
      console.warn('Événement relance non tracé:', e);
    }

    return true;
  } catch (e) {
    console.error('Erreur marquage relance:', e);
    return false;
  }
};

/**
 * Génère le texte de relance selon le niveau
 */
export const generateReminderText = (
  invoice: OverdueInvoice,
  level: ReminderConfig,
  companyName: string
): string => {
  const dateStr = new Date(invoice.dueDate).toLocaleDateString('fr-FR');

  if (level.level === 'first') {
    return `
RELANCE N°1 - FACTURE ÉCHUE

Madame, Monsieur,

Sauf erreur ou omission de notre part, la facture ${invoice.invoiceNumber} d'un montant de ${invoice.balance.toFixed(2)} € TTC, arrivée à échéance le ${dateStr}, n'a pas encore été réglée.

Nous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais.

Si votre règlement a été effectué entre-temps, nous vous prions de ne pas tenir compte de ce rappel.

Cordialement,
${companyName}
    `.trim();
  }

  if (level.level === 'second') {
    return `
RELANCE N°2 - FACTURE IMPAYÉE

Madame, Monsieur,

Malgré notre précédente relance, la facture ${invoice.invoiceNumber} d'un montant de ${invoice.balance.toFixed(2)} € TTC, échue le ${dateStr}, demeure impayée à ce jour.

Nous vous demandons de procéder à son règlement sous 8 jours. Passé ce délai, nous serons contraints d'appliquer des pénalités de retard conformément aux articles L.441-10 et D.441-5 du Code de commerce.

Cordialement,
${companyName}
    `.trim();
  }

  return `
MISE EN DEMEURE - FACTURE IMPAYÉE

Madame, Monsieur,

Malgré nos deux précédentes relances, la facture ${invoice.invoiceNumber} d'un montant de ${invoice.balance.toFixed(2)} € TTC, échue le ${dateStr}, demeure impayée.

En application de l'article L.441-10 du Code de commerce, nous vous mettons en demeure de procéder au règlement sous 8 jours, majoré des pénalités de retard (3 fois le taux d'intérêt légal) et de l'indemnité forfaitaire de recouvrement de 40 €.

À défaut de règlement, nous nous réservons le droit d'engager une procédure de recouvrement contentieux.

Veuillez agréer, Madame, Monsieur, l'expression de nos salutations distinguées.

${companyName}
    `.trim();
};