// src/utils/zipUtils.ts
// Utilitaires de compression/décompression ZIP pour les sauvegardes

import JSZip from 'jszip';
import { toast } from 'sonner';

// ============================================================
// 📋 INTERFACES
// ============================================================

export interface BackupManifest {
  version: string;
  appVersion: string;
  createdAt: string;
  teamId: string;
  teamName?: string;
  dataTypes: string[];
  documentCount: number;
  totalSize: number;
}

export interface BackupFile {
  filename: string;
  content: string;
  type: 'json' | 'text';
}

// ============================================================
// 🔧 COMPRESSION
// ============================================================

/**
 * Crée un ZIP à partir d'un ensemble de fichiers
 */
export async function createBackupZip(
  files: BackupFile[],
  manifest: BackupManifest,
  options: {
    compression?: boolean;
    password?: string;
  } = {}
): Promise<Blob> {
  const zip = new JSZip();
  const { compression = true } = options;

  // Ajouter le manifeste
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Ajouter les fichiers de données
  for (const file of files) {
    const folder = file.filename.includes('/') 
      ? file.filename.split('/')[0] 
      : '';
    
    if (folder && !zip.folder(folder)) {
      zip.folder(folder);
    }
    
    zip.file(file.filename, file.content, {
      compression: compression ? 'DEFLATE' : 'STORE',
      compressionOptions: { level: 6 }
    });
  }

  // Ajouter un README
  const readme = generateReadme(manifest);
  zip.file('README.txt', readme);

  // Générer le blob ZIP
  return zip.generateAsync({
    type: 'blob',
    compression: compression ? 'DEFLATE' : 'STORE',
    compressionOptions: { level: 6 }
  });
}

/**
 * Génère le contenu du README
 */
function generateReadme(manifest: BackupManifest): string {
  return `
╔═══════════════════════════════════════════════════════════╗
║           SAUVEGARDE - ${manifest.teamName || 'Application'}           ║
╚═══════════════════════════════════════════════════════════╝

📅 Créé le : ${new Date(manifest.createdAt).toLocaleString('fr-FR')}
📦 Version : ${manifest.version}
🏷️  App : ${manifest.appVersion}
👥 Équipe : ${manifest.teamId}

📊 Contenu :
${manifest.dataTypes.map(type => `  • ${type}`).join('\n')}

📈 Statistiques :
  • Documents : ${manifest.documentCount}
  • Taille totale : ${(manifest.totalSize / 1024 / 1024).toFixed(2)} Mo

⚠️  IMPORTANT :
  • Ne modifiez PAS ce fichier ZIP
  • Conservez-le dans un endroit sûr
  • Pour restaurer : utilisez l'utilitaire de restauration
    dans l'application

🔄 Restauration :
  1. Ouvrez l'application
  2. Allez dans "Utilitaires" → "Sauvegardes"
  3. Section "Restaurer depuis un fichier"
  4. Sélectionnez ce fichier ZIP
  5. Confirmez la restauration

📞 Support :
  En cas de problème, contactez votre administrateur.

---
Généré automatiquement par l'application
${new Date().getFullYear()} - Tous droits réservés
`;
}

// ============================================================
// 📂 DÉCOMPRESSION
// ============================================================

/**
 * Lit un fichier ZIP et extrait son contenu
 */
export async function extractBackupZip(
  file: File | Blob
): Promise<{
  manifest: BackupManifest | null;
  files: Map<string, string>;
}> {
  const zip = await JSZip.loadAsync(file);
  const files = new Map<string, string>();
  let manifest: BackupManifest | null = null;

  // Parcourir tous les fichiers du ZIP
  const fileEntries = Object.entries(zip.files);
  
  for (const [filename, zipEntry] of fileEntries) {
    // Ignorer les dossiers
    if (zipEntry.dir) continue;

    // Lire le contenu
    const content = await zipEntry.async('string');
    files.set(filename, content);

    // Extraire le manifeste
    if (filename === 'manifest.json') {
      try {
        manifest = JSON.parse(content) as BackupManifest;
      } catch (e) {
        console.warn('⚠️ Manifeste corrompu:', e);
      }
    }
  }

  return { manifest, files };
}

/**
 * Valide qu'un fichier ZIP est une sauvegarde valide
 */
export function validateBackupZip(
  manifest: BackupManifest | null
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manifest) {
    errors.push('Aucun manifeste trouvé dans le ZIP');
    return { valid: false, errors };
  }

  // Vérifier la version
  if (!manifest.version) {
    errors.push('Version de sauvegarde manquante');
  }

  // Vérifier la date
  if (!manifest.createdAt || isNaN(new Date(manifest.createdAt).getTime())) {
    errors.push('Date de création invalide');
  }

  // Vérifier les types de données
  if (!manifest.dataTypes || manifest.dataTypes.length === 0) {
    errors.push('Aucun type de données défini');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Calcule la taille d'un blob en format lisible
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Génère un nom de fichier de sauvegarde
 */
export function generateBackupFilename(prefix: string = 'backup'): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  
  return `${prefix}-${date}_${time}.zip`;
}

/**
 * Extrait les métadonnées d'un nom de fichier de sauvegarde
 */
export function parseBackupFilename(filename: string): {
  date: Date | null;
  type: string;
} {
  // Format attendu : backup-YYYY-MM-DD_HH-MM-SS.zip
  const match = filename.match(/(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
  
  if (!match) {
    return { date: null, type: 'unknown' };
  }
  
  const dateStr = `${match[1]}T${match[2].replace(/-/g, ':')}`;
  const date = new Date(dateStr);
  
  return {
    date: isNaN(date.getTime()) ? null : date,
    type: filename.startsWith('backup-auto') ? 'auto' : 'manual'
  };
}

// ============================================================
// 🔍 UTILITAIRES
// ============================================================

/**
 * Estime la taille des données avant compression
 */
export function estimateDataSize(data: Record<string, any[]>): number {
  let totalSize = 0;
  
  for (const [key, items] of Object.entries(data)) {
    const jsonStr = JSON.stringify(items);
    totalSize += jsonStr.length;
  }
  
  return totalSize;
}

/**
 * Compresse une chaîne JSON avec indentation minimale
 */
export function compressJson(data: any): string {
  return JSON.stringify(data);
}

/**
 * Décompresse une chaîne JSON
 */
export function decompressJson<T>(jsonStr: string): T | null {
  try {
    return JSON.parse(jsonStr) as T;
  } catch (e) {
    console.error('❌ Erreur décompression JSON:', e);
    return null;
  }
}