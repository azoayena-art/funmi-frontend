// src/utils/backupService.ts
// Service principal de sauvegarde et restauration des données (VERSION CORRIGÉE)

import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID } from 'appwrite';
import { toast } from 'sonner';
import {
  createBackupZip,
  extractBackupZip,
  validateBackupZip,
  generateBackupFilename,
  formatFileSize,
  compressJson,
  decompressJson,
  type BackupManifest,
  type BackupFile
} from './zipUtils';
import {
  writeBackupFile,
  downloadBackupFile,
  detectFileSystemSupport,
  type BackupFileInfo
} from './fileSystemAccess';

// ============================================================
// 📋 INTERFACES
// ============================================================

export interface BackupOptions {
  includePDFs: boolean;
  encrypt: boolean;
  password?: string;
  teamId: string;
  teamName?: string;
}

export interface BackupResult {
  success: boolean;
  filename?: string;
  size?: number;
  documentCount?: number;
  error?: string;
  path?: string;
}

export interface RestorePreview {
  valid: boolean;
  manifest: BackupManifest | null;
  collections: Array<{
    name: string;
    count: number;
    sampleFields: string[];
  }>;
  warnings: string[];
  errors: string[];
}

export interface RestoreOptions {
  mode: 'replace' | 'merge';
  dryRun: boolean;
  teamId: string;
}

export interface RestoreResult {
  success: boolean;
  restored: number;
  updated: number;
  skipped: number;
  errors: string[];
  duration: number;
}

// ============================================================
// 📚 CONFIGURATION DES COLLECTIONS
// ============================================================

const COLLECTIONS_CONFIG = [
  { 
    id: 'invoices', 
    folder: 'billing', 
    label: 'Factures',
    uniqueFields: ['invoiceNumber'] // ✅ Attributs uniques à gérer
  },
  { 
    id: 'quotes', 
    folder: 'billing', 
    label: 'Devis',
    uniqueFields: ['quoteNumber']
  },
  { 
    id: 'clients', 
    folder: 'billing', 
    label: 'Clients',
    uniqueFields: ['email']
  },
  { 
    id: 'payments', 
    folder: 'treasury', 
    label: 'Opérations trésorerie',
    uniqueFields: []
  },
  { 
    id: 'expenses', 
    folder: 'treasury', 
    label: 'Dépenses',
    uniqueFields: []
  },
  { 
    id: 'company_settings', 
    folder: 'company', 
    label: 'Paramètres entreprise',
    uniqueFields: []
  },
  { 
    id: 'account_mapping', 
    folder: 'company', 
    label: 'Plan comptable',
    uniqueFields: []
  },
];

// Champs système à exclure lors de l'export
const SYSTEM_FIELDS = [
  '$id', '$collectionId', '$databaseId', '$createdAt', '$updatedAt',
  '$permissions', '$tenant', '$sequence'
];

// ============================================================
// 📤 EXPORT DES DONNÉES
// ============================================================

/**
 * Récupère tous les documents d'une collection avec pagination
 */
async function fetchAllDocuments(
  collectionId: string,
  teamId: string
): Promise<any[]> {
  const documents: any[] = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await databases.listDocuments(DATABASE_ID, collectionId, [
        Query.equal('teamId', teamId),
        Query.limit(limit),
        Query.offset(offset)
      ]);

      documents.push(...response.documents);
      
      offset += limit;
      hasMore = response.documents.length === limit;
      
      if (offset > 10000) {
        console.warn(`⚠️ Limite de 10000 documents atteinte pour ${collectionId}`);
        break;
      }
    } catch (e) {
      console.error(`❌ Erreur fetch ${collectionId}:`, e);
      hasMore = false;
    }
  }

  return documents;
}

/**
 * Nettoie un document pour l'export (conserve $id pour restauration)
 */
function cleanDocumentForExport(doc: any): any {
  const cleaned: any = {
    _originalId: doc.$id, // ✅ Sauvegarder l'ID original
  };
  
  for (const [key, value] of Object.entries(doc)) {
    if (!SYSTEM_FIELDS.includes(key)) {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
}

/**
 * Exporte toutes les données de l'équipe
 */
export async function exportAllData(
  teamId: string,
  options: BackupOptions
): Promise<{
  files: BackupFile[];
  manifest: BackupManifest;
  totalDocuments: number;
}> {
  const files: BackupFile[] = [];
  const dataTypes: string[] = [];
  let totalDocuments = 0;
  let totalSize = 0;

  for (const config of COLLECTIONS_CONFIG) {
    try {
      const documents = await fetchAllDocuments(config.id, teamId);
      
      if (documents.length > 0) {
        const cleanedDocs = documents.map(cleanDocumentForExport);
        
        const filename = `${config.folder}/${config.id}.json`;
        const content = compressJson(cleanedDocs);
        
        files.push({
          filename,
          content,
          type: 'json'
        });
        
        dataTypes.push(`${config.label} (${documents.length})`);
        totalDocuments += documents.length;
        totalSize += content.length;
      }
    } catch (e) {
      console.warn(`⚠️ Collection ${config.id} non exportée:`, e);
    }
  }

  const manifest: BackupManifest = {
    version: '1.0',
    appVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    teamId,
    teamName: options.teamName,
    dataTypes,
    documentCount: totalDocuments,
    totalSize
  };

  return { files, manifest, totalDocuments };
}

// ============================================================
// 💾 CRÉATION DE LA SAUVEGARDE
// ============================================================

/**
 * Crée une sauvegarde complète
 */
export async function createBackup(
  directoryHandle: FileSystemDirectoryHandle | null,
  options: BackupOptions
): Promise<BackupResult> {
  const startTime = Date.now();

  try {
    const { files, manifest, totalDocuments } = await exportAllData(
      options.teamId,
      options
    );

    if (files.length === 0) {
      return {
        success: false,
        error: 'Aucune donnée à sauvegarder'
      };
    }

    const zipBlob = await createBackupZip(files, manifest, {
      compression: true,
      password: options.encrypt ? options.password : undefined
    });

    const filename = generateBackupFilename('backup');

    const support = detectFileSystemSupport();
    
    if (support.supported && directoryHandle) {
      const writeResult = await writeBackupFile(directoryHandle, filename, zipBlob);
      
      if (!writeResult.success) {
        return {
          success: false,
          error: writeResult.error
        };
      }

      return {
        success: true,
        filename,
        size: zipBlob.size,
        documentCount: totalDocuments,
        path: writeResult.path
      };
    } else {
      downloadBackupFile(zipBlob, filename);
      
      return {
        success: true,
        filename,
        size: zipBlob.size,
        documentCount: totalDocuments,
        path: 'Téléchargements'
      };
    }
  } catch (e: any) {
    console.error('❌ Erreur création sauvegarde:', e);
    return {
      success: false,
      error: e.message || 'Erreur inconnue lors de la sauvegarde'
    };
  }
}

// ============================================================
// 📥 RESTAURATION DES DONNÉES (VERSION CORRIGÉE)
// ============================================================

/**
 * Prévisualise une restauration (mode Dry Run)
 */
export async function previewRestore(
  file: File | Blob
): Promise<RestorePreview> {
  try {
    const { manifest, files } = await extractBackupZip(file);

    const validation = validateBackupZip(manifest);
    
    if (!validation.valid) {
      return {
        valid: false,
        manifest,
        collections: [],
        warnings: [],
        errors: validation.errors
      };
    }

    const collections: RestorePreview['collections'] = [];
    const warnings: string[] = [];

    for (const config of COLLECTIONS_CONFIG) {
      const filename = `${config.folder}/${config.id}.json`;
      const content = files.get(filename);
      
      if (content) {
        const documents = decompressJson<any[]>(content);
        
        if (documents && Array.isArray(documents)) {
          const sampleFields = documents.length > 0
            ? Object.keys(documents[0]).slice(0, 5)
            : [];
          
          collections.push({
            name: config.label,
            count: documents.length,
            sampleFields
          });
        }
      }
    }

    if (!manifest!.teamId) {
      warnings.push('Aucun teamId dans le manifeste');
    }

    return {
      valid: true,
      manifest,
      collections,
      warnings,
      errors: []
    };
  } catch (e: any) {
    return {
      valid: false,
      manifest: null,
      collections: [],
      warnings: [],
      errors: [e.message || 'Erreur lors de la lecture du fichier']
    };
  }
}

/**
 * Nettoie un document pour l'import (prépare pour Appwrite)
 */
function cleanDocumentForImport(doc: any, teamId: string): any {
  const cleaned: any = { ...doc };
  
  cleaned.teamId = teamId;
  
  // Supprimer les champs système résiduels
  for (const field of SYSTEM_FIELDS) {
    delete cleaned[field];
  }
  
  return cleaned;
}

/**
 * ✅ NOUVEAU : Supprime TOUS les documents d'une collection avec retries
 */
async function deleteAllDocuments(
  collectionId: string,
  teamId: string,
  maxRetries: number = 3
): Promise<{ success: boolean; deleted: number; errors: string[] }> {
  let totalDeleted = 0;
  const errors: string[] = [];
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🗑️ Tentative ${attempt}/${maxRetries} de suppression pour ${collectionId}`);
      
      let hasMore = true;
      let iterationCount = 0;
      
      while (hasMore && iterationCount < 50) { // Sécurité anti-boucle infinie
        const response = await databases.listDocuments(DATABASE_ID, collectionId, [
          Query.equal('teamId', teamId),
          Query.limit(100)
        ]);

        if (response.documents.length === 0) {
          hasMore = false;
          break;
        }

        // Supprimer chaque document
        for (const doc of response.documents) {
          try {
            await databases.deleteDocument(DATABASE_ID, collectionId, doc.$id);
            totalDeleted++;
          } catch (e: any) {
            errors.push(`${collectionId} - Document ${doc.$id}: ${e.message}`);
          }
        }

        if (response.documents.length < 100) {
          hasMore = false;
        }
        
        iterationCount++;
      }
      
      // Vérifier que la collection est bien vide
      const checkResponse = await databases.listDocuments(DATABASE_ID, collectionId, [
        Query.equal('teamId', teamId),
        Query.limit(1)
      ]);
      
      if (checkResponse.documents.length === 0) {
        console.log(`✅ Collection ${collectionId} vidée avec succès (${totalDeleted} documents)`);
        return { success: true, deleted: totalDeleted, errors: [] };
      } else {
        console.warn(`⚠️ Collection ${collectionId} pas complètement vide, nouvelle tentative...`);
      }
      
    } catch (e: any) {
      console.error(`❌ Erreur suppression ${collectionId} (tentative ${attempt}):`, e);
      
      if (attempt === maxRetries) {
        errors.push(`${collectionId} - Échec après ${maxRetries} tentatives: ${e.message}`);
        return { success: false, deleted: totalDeleted, errors };
      }
      
      // Attendre avant de réessayer
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  
  return { success: false, deleted: totalDeleted, errors };
}

/**
 * ✅ NOUVEAU : Met à jour un document existant au lieu de le créer
 */
async function updateExistingDocument(
  collectionId: string,
  documentId: string,
  data: any
): Promise<boolean> {
  try {
    await databases.updateDocument(DATABASE_ID, collectionId, documentId, data);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * ✅ CORRIGÉ : Restaure une sauvegarde avec gestion robuste des conflits
 */
export async function restoreBackup(
  file: File | Blob,
  options: RestoreOptions
): Promise<RestoreResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let restored = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // 1. Extraire le ZIP
    const { manifest, files } = await extractBackupZip(file);

    // 2. Valider
    const validation = validateBackupZip(manifest);
    if (!validation.valid) {
      return {
        success: false,
        restored: 0,
        updated: 0,
        skipped: 0,
        errors: validation.errors,
        duration: 0
      };
    }

    // 3. Mode Dry Run
    if (options.dryRun) {
      return {
        success: true,
        restored: manifest!.documentCount,
        updated: 0,
        skipped: 0,
        errors: [],
        duration: Date.now() - startTime
      };
    }

    // 4. Restaurer chaque collection
    for (const config of COLLECTIONS_CONFIG) {
      const filename = `${config.folder}/${config.id}.json`;
      const content = files.get(filename);
      
      if (!content) continue;

      const documents = decompressJson<any[]>(content);
      if (!documents || !Array.isArray(documents)) continue;

      console.log(`📥 Restauration de ${config.label} (${documents.length} documents)`);

      // Mode remplacement : supprimer TOUS les documents existants
      if (options.mode === 'replace') {
        const deleteResult = await deleteAllDocuments(config.id, options.teamId);
        
        if (!deleteResult.success) {
          errors.push(`⚠️ Suppression incomplète pour ${config.label}: ${deleteResult.deleted} supprimés`);
          console.warn(`⚠️ Suppression incomplète, certains documents peuvent exister`);
        } else {
          console.log(`✅ ${deleteResult.deleted} documents supprimés de ${config.label}`);
        }
        
        // ✅ Attendre un peu pour s'assurer de la cohérence
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Importer les documents
      for (const doc of documents) {
        try {
          const cleanedDoc = cleanDocumentForImport(doc, options.teamId);
          
          // ✅ Utiliser l'ID original du backup
          const originalId = doc._originalId || doc.$id || ID.unique();
          
          try {
            // Tenter de créer le document avec l'ID original
            await databases.createDocument(
              DATABASE_ID,
              config.id,
              originalId,
              cleanedDoc
            );
            
            restored++;
          } catch (createError: any) {
            // Si création échoue (document existe déjà), tenter une mise à jour
            if (createError.message.includes('unique attribute constraint') || 
                createError.message.includes('already exists')) {
              
              console.log(`⚠️ Document ${originalId} existe déjà, mise à jour...`);
              
              const updateSuccess = await updateExistingDocument(
                config.id,
                originalId,
                cleanedDoc
              );
              
              if (updateSuccess) {
                updated++;
              } else {
                skipped++;
                errors.push(`${config.label} - Document ${originalId}: mise à jour échouée`);
              }
            } else {
              // Autre erreur
              skipped++;
              errors.push(`${config.label} - Document ${originalId}: ${createError.message}`);
            }
          }
        } catch (e: any) {
          skipped++;
          errors.push(`${config.label} - Erreur générale: ${e.message}`);
        }
      }
    }

    const success = errors.length === 0;
    const duration = Date.now() - startTime;
    
    console.log(`✅ Restauration terminée en ${(duration / 1000).toFixed(1)}s`);
    console.log(`   • Restaurés: ${restored}`);
    console.log(`   • Mis à jour: ${updated}`);
    console.log(`   • Ignorés: ${skipped}`);
    if (errors.length > 0) {
      console.log(`   • Erreurs: ${errors.length}`);
    }

    return {
      success,
      restored,
      updated,
      skipped,
      errors,
      duration
    };
  } catch (e: any) {
    return {
      success: false,
      restored,
      updated,
      skipped,
      errors: [...errors, e.message || 'Erreur inconnue lors de la restauration'],
      duration: Date.now() - startTime
    };
  }
}

// ============================================================
// 📊 STATISTIQUES ET UTILITAIRES
// ============================================================

/**
 * Obtient les statistiques actuelles des données
 */
export async function getDataStatistics(
  teamId: string
): Promise<Array<{ collection: string; count: number }>> {
  const stats: Array<{ collection: string; count: number }> = [];

  for (const config of COLLECTIONS_CONFIG) {
    try {
      const response = await databases.listDocuments(DATABASE_ID, config.id, [
        Query.equal('teamId', teamId),
        Query.limit(1)
      ]);
      
      stats.push({
        collection: config.label,
        count: response.total
      });
    } catch (e) {
      stats.push({
        collection: config.label,
        count: 0
      });
    }
  }

  return stats;
}

/**
 * Vérifie si une restauration est possible
 */
export function canRestore(
  preview: RestorePreview,
  currentTeamId: string
): { allowed: boolean; reason: string } {
  if (!preview.valid) {
    return { allowed: false, reason: 'Fichier de sauvegarde invalide' };
  }

  if (!preview.manifest) {
    return { allowed: false, reason: 'Manifeste manquant' };
  }

  if (preview.manifest.teamId !== currentTeamId) {
    return {
      allowed: false,
      reason: 'Cette sauvegarde appartient à une autre équipe'
    };
  }

  if (preview.collections.length === 0) {
    return { allowed: false, reason: 'Aucune donnée dans la sauvegarde' };
  }

  return { allowed: true, reason: '' };
}

/**
 * Formate le résumé d'une sauvegarde pour l'affichage
 */
export function formatBackupSummary(
  manifest: BackupManifest
): string {
  const date = new Date(manifest.createdAt).toLocaleString('fr-FR');
  const size = formatFileSize(manifest.totalSize);
  
  return `${date} • ${manifest.documentCount} documents • ${size}`;
}