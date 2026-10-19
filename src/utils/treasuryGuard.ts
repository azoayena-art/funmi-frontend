// src/utils/treasuryGuard.ts
import { databases, DATABASE_ID } from '../appwrite';
import { ID, Permission, Role } from 'appwrite';

interface TreasuryMovementInput {
  teamId: string;
  appwriteTeamId: string;
  userId: string;
  type: 'in' | 'out';
  category: string;
  amount: number;
  date: string;
  method: string;
  description?: string;
  label?: string;
  counterpartyName?: string | null;
  reference?: string | null;
  vatAmount?: number;
  vatRate?: number;
  isRecurring?: boolean;
  recurringFrequency?: string | null;
  source?: string;
  accountNumber?: string;
  accountLabel?: string;
}

export async function createTreasuryMovement(input: TreasuryMovementInput) {
  try {
    const perms = [
      Permission.read(Role.team(input.appwriteTeamId)),
      Permission.update(Role.team(input.appwriteTeamId)),
      Permission.delete(Role.team(input.appwriteTeamId)),
    ];

    // ✅ Construire le label à afficher
    const categoryLabel = input.label || input.description || input.category;

    // 🔍 DEBUG
    console.log('💾 Création payment:', {
      source: input.source || 'manual',
      label: categoryLabel,
      amount: input.amount,
      accountNumber: input.accountNumber,
      counterpartyName: input.counterpartyName,
    });

    const doc = await databases.createDocument(
      DATABASE_ID,
      'payments',
      ID.unique(),
      {
        teamId: input.teamId,
        userId: input.userId,
        type: input.type,
        category: input.category,
        amount: input.amount,
        amountEur: input.amount,
        date: input.date,
        method: input.method,
        description: input.description || '',
        label: categoryLabel,
        // ✅ UNIQUEMENT counterpartyName (counterparty SUPPRIMÉ)
        counterpartyName: input.counterpartyName || '',
        reference: input.reference || '',
        vatAmount: input.vatAmount || 0,
        vatRate: input.vatRate || 0,
        isRecurring: input.isRecurring || false,
        recurringFrequency: input.recurringFrequency || null,
        source: input.source || 'manual',
        accountNumber: input.accountNumber || '',
        accountLabel: input.accountLabel || '',
        isArchived: false,
      },
      perms
    );

    return { success: true, created: true, document: doc };
  } catch (error: any) {
    console.error('❌ Erreur createTreasuryMovement:', error);
    return { success: false, error: error.message, created: false };
  }
}