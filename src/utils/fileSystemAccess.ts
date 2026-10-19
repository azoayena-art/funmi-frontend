// src/utils/fileSystemAccess.ts
// Gestion de l'accès au système de fichiers pour les sauvegardes
// Supporte Chrome/Edge (File System Access API) + fallback Firefox/Safari

// ============================================================
// 📋 INTERFACES
// ============================================================

export interface BackupFileInfo {
  name: string;
  size: number;
  lastModified: Date;
  type: 'manual' | 'auto' | 'unknown';
}

export interface FileSystemSupport {
  supported: boolean;
  browser: string;
  message: string;
}

// ============================================================
// 🔍 DÉTECTION DU SUPPORT
// ============================================================

/**
 * Détecte si le navigateur supporte l'API File System Access
 */
export function detectFileSystemSupport(): FileSystemSupport {
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Détection du navigateur
  let browser = 'Inconnu';
  if (userAgent.includes('edg/')) browser = 'Edge';
  else if (userAgent.includes('chrome')) browser = 'Chrome';
  else if (userAgent.includes('firefox')) browser = 'Firefox';
  else if (userAgent.includes('safari')) browser = 'Safari';
  else if (userAgent.includes('opera')) browser = 'Opera';

  // Vérification de l'API
  const supported = 
    'showDirectoryPicker' in window && 
    'FileSystemDirectoryHandle' in window;

  const message = supported
    ? `✅ ${browser} : écriture directe dans le dossier choisi`
    : `⚠️ ${browser} : téléchargement automatique (déplacez le fichier ensuite)`;

  return { supported, browser, message };
}

// ============================================================
// 💾 PERSISTANCE DU HANDLE (IndexedDB)
// ============================================================

const DB_NAME = 'BackupUtilityDB';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const HANDLE_KEY = 'backupDirectory';

/**
 * Ouvre la base IndexedDB pour stocker le handle du dossier
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Sauvegarde le handle du dossier dans IndexedDB
 */
export async function saveDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    store.put(handle, HANDLE_KEY);
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    db.close();
  } catch (e) {
    console.warn('⚠️ Impossible de sauvegarder le handle:', e);
  }
}

/**
 * Récupère le handle du dossier depuis IndexedDB
 */
export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(HANDLE_KEY);
    
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    
    db.close();
    return handle;
  } catch (e) {
    console.warn('⚠️ Impossible de récupérer le handle:', e);
    return null;
  }
}

/**
 * Supprime le handle sauvegardé
 */
export async function clearSavedDirectoryHandle(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    store.delete(HANDLE_KEY);
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    db.close();
  } catch (e) {
    console.warn('⚠️ Impossible de supprimer le handle:', e);
  }
}

// ============================================================
// 📂 SÉLECTION DU DOSSIER
// ============================================================

/**
 * Demande à l'utilisateur de choisir un dossier de sauvegarde
 */
export async function selectBackupDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    // Vérification du support
    if (!('showDirectoryPicker' in window)) {
      return null;
    }

    // @ts-ignore - API non standardisée dans tous les TypeScript
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    });

    // Sauvegarder le handle pour les sessions futures
    await saveDirectoryHandle(handle);
    
    return handle;
  } catch (e: any) {
    // L'utilisateur a annulé la sélection
    if (e.name === 'AbortError') {
      return null;
    }
    console.error('❌ Erreur sélection dossier:', e);
    throw e;
  }
}

/**
 * Vérifie et demande les permissions pour un handle existant
 */
export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    // Vérifier les permissions actuelles
    const options = { mode: 'readwrite' as const };
    
    // @ts-ignore
    const permission = await handle.queryPermission(options);
    
    if (permission === 'granted') {
      return true;
    }
    
    // Demander la permission
    // @ts-ignore
    const newPermission = await handle.requestPermission(options);
    return newPermission === 'granted';
  } catch (e) {
    console.warn('⚠️ Erreur vérification permissions:', e);
    return false;
  }
}

// ============================================================
// ✍️ ÉCRITURE DE FICHIERS
// ============================================================

/**
 * Écrit un fichier ZIP dans le dossier de sauvegarde
 */
export async function writeBackupFile(
  handle: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    // Vérifier les permissions
    const hasPermission = await verifyDirectoryPermission(handle);
    if (!hasPermission) {
      return {
        success: false,
        error: 'Permission refusée. Veuillez sélectionner à nouveau le dossier.'
      };
    }

    // Créer ou remplacer le fichier
    // @ts-ignore
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    
    // Écrire le contenu
    // @ts-ignore
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    return {
      success: true,
      path: `${handle.name}/${filename}`
    };
  } catch (e: any) {
    console.error('❌ Erreur écriture fichier:', e);
    return {
      success: false,
      error: e.message || 'Erreur inconnue lors de l\'écriture'
    };
  }
}

/**
 * Fallback : télécharge le fichier via le navigateur
 */
export function downloadBackupFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  
  // Nettoyage
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

// ============================================================
// 📖 LECTURE DE FICHIERS
// ============================================================

/**
 * Lit un fichier depuis le dossier de sauvegarde
 */
export async function readBackupFile(
  handle: FileSystemDirectoryHandle,
  filename: string
): Promise<Blob | null> {
  try {
    const hasPermission = await verifyDirectoryPermission(handle);
    if (!hasPermission) {
      return null;
    }

    // @ts-ignore
    const fileHandle = await handle.getFileHandle(filename);
    // @ts-ignore
    const file = await fileHandle.getFile();
    
    return file;
  } catch (e) {
    console.error('❌ Erreur lecture fichier:', e);
    return null;
  }
}

// ============================================================
// 📋 LISTE ET GESTION DES SAUVEGARDES
// ============================================================

/**
 * Liste toutes les sauvegardes dans le dossier
 */
export async function listBackupFiles(
  handle: FileSystemDirectoryHandle
): Promise<BackupFileInfo[]> {
  const backups: BackupFileInfo[] = [];
  
  try {
    const hasPermission = await verifyDirectoryPermission(handle);
    if (!hasPermission) {
      return backups;
    }

    // @ts-ignore
    for await (const entry of handle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.zip')) {
        // @ts-ignore
        const file = await entry.getFile();
        
        // Déterminer le type de sauvegarde
        let type: 'manual' | 'auto' | 'unknown' = 'unknown';
        if (entry.name.includes('auto')) type = 'auto';
        else if (entry.name.includes('backup')) type = 'manual';
        
        backups.push({
          name: entry.name,
          size: file.size,
          lastModified: new Date(file.lastModified),
          type
        });
      }
    }

    // Trier par date décroissante
    backups.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    
    return backups;
  } catch (e) {
    console.error('❌ Erreur liste sauvegardes:', e);
    return backups;
  }
}

/**
 * Supprime une sauvegarde du dossier
 */
export async function deleteBackupFile(
  handle: FileSystemDirectoryHandle,
  filename: string
): Promise<boolean> {
  try {
    const hasPermission = await verifyDirectoryPermission(handle);
    if (!hasPermission) {
      return false;
    }

    // @ts-ignore
    await handle.removeEntry(filename);
    return true;
  } catch (e) {
    console.error('❌ Erreur suppression fichier:', e);
    return false;
  }
}

/**
 * Nettoie les anciennes sauvegardes selon la rétention
 */
export async function cleanupOldBackups(
  handle: FileSystemDirectoryHandle,
  maxBackups: number
): Promise<number> {
  try {
    const backups = await listBackupFiles(handle);
    
    if (backups.length <= maxBackups) {
      return 0;
    }

    // Supprimer les plus anciennes
    const toDelete = backups.slice(maxBackups);
    let deleted = 0;
    
    for (const backup of toDelete) {
      const success = await deleteBackupFile(handle, backup.name);
      if (success) deleted++;
    }
    
    return deleted;
  } catch (e) {
    console.error('❌ Erreur nettoyage sauvegardes:', e);
    return 0;
  }
}

// ============================================================
// 🔍 UTILITAIRES
// ============================================================

/**
 * Vérifie si un dossier est accessible et valide pour les sauvegardes
 */
export async function validateBackupDirectory(
  handle: FileSystemDirectoryHandle
): Promise<{ valid: boolean; message: string }> {
  try {
    const hasPermission = await verifyDirectoryPermission(handle);
    if (!hasPermission) {
      return {
        valid: false,
        message: 'Permission refusée pour ce dossier'
      };
    }

    // Tester l'écriture avec un fichier temporaire
    const testFilename = `.backup-test-${Date.now()}.tmp`;
    
    // @ts-ignore
    const fileHandle = await handle.getFileHandle(testFilename, { create: true });
    // @ts-ignore
    const writable = await fileHandle.createWritable();
    await writable.write('test');
    await writable.close();
    
    // Supprimer le fichier de test
    // @ts-ignore
    await handle.removeEntry(testFilename);

    return {
      valid: true,
      message: `Dossier "${handle.name}" prêt pour les sauvegardes`
    };
  } catch (e: any) {
    return {
      valid: false,
      message: `Dossier inaccessible : ${e.message}`
    };
  }
}

/**
 * Obtient le chemin lisible du dossier (limité par la sécurité navigateur)
 */
export function getDirectoryPath(handle: FileSystemDirectoryHandle): string {
  // Note : les navigateurs ne permettent pas d'obtenir le chemin complet
  // pour des raisons de sécurité. On retourne juste le nom du dossier.
  return handle.name;
}

/**
 * Formate la date de dernière modification
 */
export function formatLastModified(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}