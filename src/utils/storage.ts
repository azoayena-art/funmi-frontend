// src/utils/storage.ts — Version propre et minimale
import { storage } from '../appwrite';

// 🗂️ Vos buckets réels (d'après Appwrite Console)
export const BUCKET_CANDIDATES = [
  'justifications',    // ✅ Principal pour les justificatifs
  'expense-receipts',  // ✅ Reçus de dépenses
  'documents',         // ✅ Documents génériques
  'company_logos',     // ✅ Logos
];

export const DEFAULT_BUCKET = 'justifications';

// Mapping type → bucket
export const BUCKET_MAP: Record<string, string> = {
  expense_justifications: 'justifications',
  received_invoices: 'documents',
  invoices: 'documents',
  company_logos: 'company_logos',
  payments: 'justifications',
};

/**
 * URL de prévisualisation
 */
export function getFilePreviewUrl(
  bucketId: string | undefined | null,
  fileId: string | undefined | null
): string | null {
  if (!fileId) return null;
  
  const bucket = bucketId && BUCKET_MAP[bucketId] 
    ? BUCKET_MAP[bucketId] 
    : (bucketId || DEFAULT_BUCKET);
  
  try {
    return storage.getFilePreview(bucket, fileId).toString();
  } catch {
    return null;
  }
}

/**
 * URL de téléchargement
 */
export function getFileDownloadUrl(
  bucketId: string | undefined | null,
  fileId: string | undefined | null
): string | null {
  if (!fileId) return null;
  
  const bucket = bucketId && BUCKET_MAP[bucketId] 
    ? BUCKET_MAP[bucketId] 
    : (bucketId || DEFAULT_BUCKET);
  
  try {
    return storage.getFileDownload(bucket, fileId).toString();
  } catch {
    return null;
  }
}

/**
 * Vérifier existence (avec fallback multi-buckets)
 */
export async function checkFileExists(
  bucketId: string | undefined | null,
  fileId: string
): Promise<{ exists: boolean; actualBucketId?: string }> {
  if (!fileId) return { exists: false };
  
  const bucketsToTry = [
    bucketId && BUCKET_MAP[bucketId] ? BUCKET_MAP[bucketId] : bucketId,
    ...BUCKET_CANDIDATES,
  ].filter(Boolean) as string[];
  
  // Dédupliquer
  const unique = Array.from(new Set(bucketsToTry));
  
  for (const bucket of unique) {
    try {
      await storage.getFile(bucket, fileId);
      return { exists: true, actualBucketId: bucket };
    } catch (error: any) {
      if (error.code === 404) continue;
    }
  }
  
  return { exists: false };
}

/**
 * Suppression robuste
 */
export async function safeDeleteFile(
  bucketId: string | undefined | null,
  fileId: string
): Promise<boolean> {
  if (!fileId) return false;
  
  const bucketsToTry = [
    bucketId,
    ...BUCKET_CANDIDATES,
  ].filter(Boolean) as string[];
  
  const unique = Array.from(new Set(bucketsToTry));
  
  for (const bucket of unique) {
    try {
      await storage.deleteFile(bucket, fileId);
      return true;
    } catch (error: any) {
      if (error.code === 404) continue;
    }
  }
  
  return false;
}