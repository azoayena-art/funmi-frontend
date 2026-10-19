// src/hooks/useBackup.ts
// Hook React pour la gestion complète des sauvegardes

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTeam } from '../context/TeamContext';
import {
  detectFileSystemSupport,
  selectBackupDirectory,
  getSavedDirectoryHandle,
  verifyDirectoryPermission,
  listBackupFiles,
  deleteBackupFile,
  cleanupOldBackups,
  readBackupFile,
  formatLastModified,
  type BackupFileInfo,
  type FileSystemSupport
} from '../utils/fileSystemAccess';
import {
  createBackup,
  previewRestore,
  restoreBackup,
  getDataStatistics,
  canRestore,
  type BackupOptions,
  type BackupResult,
  type RestorePreview,
  type RestoreOptions,
  type RestoreResult
} from '../utils/backupService';

// ============================================================
// 📋 INTERFACES
// ============================================================

export interface BackupConfig {
  autoEnabled: boolean;
  autoMode: 'app-open' | 'server';
  autoFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  autoHour: number;
  retention: number;
  includePDFs: boolean;
  encrypt: boolean;
}

export interface BackupState {
  directoryHandle: FileSystemDirectoryHandle | null;
  directoryName: string | null;
  directoryValid: boolean;
  support: FileSystemSupport;
  config: BackupConfig;
  backups: BackupFileInfo[];
  lastBackup: BackupFileInfo | null;
  loading: boolean;
  backingUp: boolean;
  restoring: boolean;
  preview: RestorePreview | null;
  stats: Array<{ collection: string; count: number }>;
}

// ============================================================
// ⚙️ CONFIGURATION PAR DÉFAUT
// ============================================================

const DEFAULT_CONFIG: BackupConfig = {
  autoEnabled: false,
  autoMode: 'app-open',
  autoFrequency: 'daily',
  autoHour: 3,
  retention: 10,
  includePDFs: false,
  encrypt: false
};

const CONFIG_STORAGE_KEY = 'backup-utility-config';

// ============================================================
// 🎯 HOOK PRINCIPAL
// ============================================================

export function useBackup() {
  const { customTeamId } = useTeam();
  const [state, setState] = useState<BackupState>({
    directoryHandle: null,
    directoryName: null,
    directoryValid: false,
    support: detectFileSystemSupport(),
    config: DEFAULT_CONFIG,
    backups: [],
    lastBackup: null,
    loading: true,
    backingUp: false,
    restoring: false,
    preview: null,
    stats: []
  });

  const schedulerRef = useRef<NodeJS.Timeout | null>(null);
  const lastAutoBackupRef = useRef<number>(0);

  // ============================================================
  // 💾 PERSISTANCE DE LA CONFIGURATION
  // ============================================================

  /**
   * Charge la configuration depuis localStorage
   */
  const loadConfig = useCallback((): BackupConfig => {
    try {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('⚠️ Impossible de charger la config:', e);
    }
    return DEFAULT_CONFIG;
  }, []);

  /**
   * Sauvegarde la configuration dans localStorage
   */
  const saveConfig = useCallback((config: BackupConfig) => {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('⚠️ Impossible de sauvegarder la config:', e);
    }
  }, []);

  // ============================================================
  // 🔄 INITIALISATION
  // ============================================================

  useEffect(() => {
    const initialize = async () => {
      setState(prev => ({ ...prev, loading: true }));

      try {
        // 1. Charger la configuration
        const config = loadConfig();

        // 2. Récupérer le handle du dossier sauvegardé
        let directoryHandle: FileSystemDirectoryHandle | null = null;
        let directoryName: string | null = null;
        let directoryValid = false;

        if (state.support.supported) {
          directoryHandle = await getSavedDirectoryHandle();
          
          if (directoryHandle) {
            directoryName = directoryHandle.name;
            directoryValid = await verifyDirectoryPermission(directoryHandle);
          }
        }

        // 3. Charger la liste des sauvegardes
        let backups: BackupFileInfo[] = [];
        if (directoryHandle && directoryValid) {
          backups = await listBackupFiles(directoryHandle);
        }

        // 4. Charger les statistiques des données
        let stats: Array<{ collection: string; count: number }> = [];
        if (customTeamId) {
          stats = await getDataStatistics(customTeamId);
        }

        setState(prev => ({
          ...prev,
          config,
          directoryHandle,
          directoryName,
          directoryValid,
          backups,
          lastBackup: backups.length > 0 ? backups[0] : null,
          stats,
          loading: false
        }));
      } catch (e) {
        console.error('❌ Erreur initialisation backup:', e);
        setState(prev => ({ ...prev, loading: false }));
      }
    };

    if (customTeamId) {
      initialize();
    }
  }, [customTeamId, state.support.supported, loadConfig]);

  // ============================================================
  // 📂 GESTION DU DOSSIER
  // ============================================================

  /**
   * Sélectionne un nouveau dossier de sauvegarde
   */
  const selectDirectory = useCallback(async (): Promise<boolean> => {
    if (!state.support.supported) {
      toast.info(
        `${state.support.browser} ne supporte pas l'écriture directe. ` +
        `Les sauvegardes seront téléchargées.`
      );
      return true;
    }

    try {
      const handle = await selectBackupDirectory();
      
      if (!handle) {
        return false; // Utilisateur a annulé
      }

      // Vérifier la validité du dossier
      const backups = await listBackupFiles(handle);

      setState(prev => ({
        ...prev,
        directoryHandle: handle,
        directoryName: handle.name,
        directoryValid: true,
        backups,
        lastBackup: backups.length > 0 ? backups[0] : null
      }));

      toast.success(`📂 Dossier "${handle.name}" sélectionné`);
      return true;
    } catch (e: any) {
      toast.error(`Erreur sélection dossier : ${e.message}`);
      return false;
    }
  }, [state.support]);

  /**
   * Déconnecte le dossier actuel
   */
  const disconnectDirectory = useCallback(async () => {
    setState(prev => ({
      ...prev,
      directoryHandle: null,
      directoryName: null,
      directoryValid: false,
      backups: [],
      lastBackup: null
    }));

    toast.info('Dossier de sauvegarde déconnecté');
  }, []);

  // ============================================================
  // 💾 SAUVEGARDE MANUELLE
  // ============================================================

  /**
   * Crée une sauvegarde manuelle
   */
  const createManualBackup = useCallback(async (
    options?: Partial<BackupOptions>
  ): Promise<BackupResult> => {
    if (!customTeamId) {
      return { success: false, error: 'Équipe non chargée' };
    }

    setState(prev => ({ ...prev, backingUp: true }));

    try {
      const backupOptions: BackupOptions = {
        includePDFs: state.config.includePDFs,
        encrypt: state.config.encrypt,
        teamId: customTeamId,
        ...options
      };

      const result = await createBackup(state.directoryHandle, backupOptions);

      if (result.success) {
        // Rafraîchir la liste des sauvegardes
        if (state.directoryHandle && state.directoryValid) {
          const backups = await listBackupFiles(state.directoryHandle);
          
          setState(prev => ({
            ...prev,
            backups,
            lastBackup: backups.length > 0 ? backups[0] : null
          }));
        }

        toast.success(
          `✅ Sauvegarde créée : ${result.filename}`,
          {
            description: `${result.documentCount} documents • ${formatFileSize(result.size || 0)}`
          }
        );

        // Nettoyage automatique des anciennes sauvegardes
        if (state.directoryHandle && state.directoryValid) {
          const deleted = await cleanupOldBackups(
            state.directoryHandle,
            state.config.retention
          );
          if (deleted > 0) {
            toast.info(`${deleted} ancienne(s) sauvegarde(s) supprimée(s)`);
          }
        }
      } else {
        toast.error(`❌ Erreur sauvegarde : ${result.error}`);
      }

      return result;
    } catch (e: any) {
      toast.error(`❌ Erreur sauvegarde : ${e.message}`);
      return { success: false, error: e.message };
    } finally {
      setState(prev => ({ ...prev, backingUp: false }));
    }
  }, [customTeamId, state.directoryHandle, state.directoryValid, state.config]);

  // ============================================================
  // ⏰ SAUVEGARDE AUTOMATIQUE
  // ============================================================

  /**
   * Démarre le scheduler de sauvegarde automatique
   */
  const startScheduler = useCallback(() => {
    // Arrêter le scheduler existant
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }

    // Vérifier si la sauvegarde auto est activée
    if (!state.config.autoEnabled || state.config.autoMode !== 'app-open') {
      return;
    }

    // Calculer l'intervalle en millisecondes
    const intervals: Record<string, number> = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000
    };

    const interval = intervals[state.config.autoFrequency] || intervals.daily;

    // Démarrer le scheduler
    schedulerRef.current = setInterval(async () => {
      const now = Date.now();
      const lastBackup = lastAutoBackupRef.current;
      
      // Vérifier si assez de temps s'est écoulé depuis la dernière sauvegarde
      if (now - lastBackup >= interval) {
        console.log('⏰ Sauvegarde automatique déclenchée');
        lastAutoBackupRef.current = now;
        
        const result = await createManualBackup();
        
        if (result.success) {
          toast.success('💾 Sauvegarde automatique effectuée', {
            description: result.filename
          });
        }
      }
    }, 60 * 1000); // Vérifier toutes les minutes

    console.log('⏰ Scheduler de sauvegarde démarré');
  }, [state.config.autoEnabled, state.config.autoMode, state.config.autoFrequency, createManualBackup]);

  /**
   * Arrête le scheduler
   */
  const stopScheduler = useCallback(() => {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
      console.log('⏰ Scheduler de sauvegarde arrêté');
    }
  }, []);

  // Démarrer/arrêter le scheduler selon la config
  useEffect(() => {
    if (state.config.autoEnabled && state.config.autoMode === 'app-open') {
      startScheduler();
    } else {
      stopScheduler();
    }

    return () => stopScheduler();
  }, [state.config.autoEnabled, state.config.autoMode, startScheduler, stopScheduler]);

  // ============================================================
  // 🔄 RESTAURATION
  // ============================================================

  /**
   * Prévisualise une restauration depuis un fichier
   */
  const previewRestoreFromFile = useCallback(async (
    file: File
  ): Promise<RestorePreview | null> => {
    setState(prev => ({ ...prev, loading: true }));

    try {
      const preview = await previewRestore(file);
      
      setState(prev => ({
        ...prev,
        preview,
        loading: false
      }));

      return preview;
    } catch (e: any) {
      toast.error(`Erreur prévisualisation : ${e.message}`);
      setState(prev => ({ ...prev, loading: false }));
      return null;
    }
  }, []);

  /**
   * Restaure une sauvegarde depuis un fichier
   */
  const restoreFromFile = useCallback(async (
    file: File,
    options?: Partial<RestoreOptions>
  ): Promise<RestoreResult> => {
    if (!customTeamId) {
      return {
        success: false,
        restored: 0,
        skipped: 0,
        errors: ['Équipe non chargée'],
        duration: 0
      };
    }

    setState(prev => ({ ...prev, restoring: true }));

    try {
      // Prévisualiser d'abord
      const preview = await previewRestore(file);
      
      if (!preview.valid) {
        const result: RestoreResult = {
          success: false,
          restored: 0,
          skipped: 0,
          errors: preview.errors,
          duration: 0
        };
        setState(prev => ({ ...prev, restoring: false }));
        return result;
      }

      // Vérifier la compatibilité
      const check = canRestore(preview, customTeamId);
      if (!check.allowed) {
        const result: RestoreResult = {
          success: false,
          restored: 0,
          skipped: 0,
          errors: [check.reason],
          duration: 0
        };
        setState(prev => ({ ...prev, restoring: false }));
        return result;
      }

      // Restaurer
      const restoreOptions: RestoreOptions = {
        mode: 'replace',
        dryRun: false,
        teamId: customTeamId,
        ...options
      };

      const result = await restoreBackup(file, restoreOptions);

      if (result.success) {
        toast.success('✅ Restauration terminée', {
          description: `${result.restored} documents restaurés en ${(result.duration / 1000).toFixed(1)}s`
        });

        // Rafraîchir les statistiques
        const stats = await getDataStatistics(customTeamId);
        setState(prev => ({ ...prev, stats, preview: null }));
      } else {
        toast.error('❌ Erreur lors de la restauration', {
          description: result.errors.slice(0, 3).join(', ')
        });
      }

      return result;
    } catch (e: any) {
      toast.error(`❌ Erreur restauration : ${e.message}`);
      return {
        success: false,
        restored: 0,
        skipped: 0,
        errors: [e.message],
        duration: 0
      };
    } finally {
      setState(prev => ({ ...prev, restoring: false }));
    }
  }, [customTeamId]);

  /**
   * Restaure une sauvegarde depuis l'historique
   */
  const restoreFromHistory = useCallback(async (
    filename: string
  ): Promise<RestoreResult> => {
    if (!state.directoryHandle || !state.directoryValid) {
      return {
        success: false,
        restored: 0,
        skipped: 0,
        errors: ['Dossier de sauvegarde non accessible'],
        duration: 0
      };
    }

    try {
      const file = await readBackupFile(state.directoryHandle, filename);
      
      if (!file) {
        return {
          success: false,
          restored: 0,
          skipped: 0,
          errors: ['Fichier introuvable'],
          duration: 0
        };
      }

      return await restoreFromFile(file);
    } catch (e: any) {
      return {
        success: false,
        restored: 0,
        skipped: 0,
        errors: [e.message],
        duration: 0
      };
    }
  }, [state.directoryHandle, state.directoryValid, restoreFromFile]);

  /**
   * Annule la prévisualisation
   */
  const cancelPreview = useCallback(() => {
    setState(prev => ({ ...prev, preview: null }));
  }, []);

  // ============================================================
  // 🗑️ GESTION DES SAUVEGARDES
  // ============================================================

  /**
   * Supprime une sauvegarde de l'historique
   */
  const deleteBackup = useCallback(async (
    filename: string
  ): Promise<boolean> => {
    if (!state.directoryHandle || !state.directoryValid) {
      toast.error('Dossier de sauvegarde non accessible');
      return false;
    }

    try {
      const success = await deleteBackupFile(state.directoryHandle, filename);
      
      if (success) {
        const backups = await listBackupFiles(state.directoryHandle);
        
        setState(prev => ({
          ...prev,
          backups,
          lastBackup: backups.length > 0 ? backups[0] : null
        }));

        toast.success(`🗑️ Sauvegarde supprimée : ${filename}`);
        return true;
      }
      
      return false;
    } catch (e: any) {
      toast.error(`Erreur suppression : ${e.message}`);
      return false;
    }
  }, [state.directoryHandle, state.directoryValid]);

  /**
   * Rafraîchit la liste des sauvegardes
   */
  const refreshBackups = useCallback(async () => {
    if (!state.directoryHandle || !state.directoryValid) {
      return;
    }

    try {
      const backups = await listBackupFiles(state.directoryHandle);
      
      setState(prev => ({
        ...prev,
        backups,
        lastBackup: backups.length > 0 ? backups[0] : null
      }));
    } catch (e) {
      console.warn('⚠️ Erreur rafraîchissement sauvegardes:', e);
    }
  }, [state.directoryHandle, state.directoryValid]);

  // ============================================================
  // ⚙️ CONFIGURATION
  // ============================================================

  /**
   * Met à jour la configuration
   */
  const updateConfig = useCallback((updates: Partial<BackupConfig>) => {
    setState(prev => {
      const newConfig = { ...prev.config, ...updates };
      saveConfig(newConfig);
      
      return {
        ...prev,
        config: newConfig
      };
    });
  }, [saveConfig]);

  /**
   * Active/désactive la sauvegarde automatique
   */
  const toggleAutoBackup = useCallback((enabled: boolean) => {
    updateConfig({ autoEnabled: enabled });
    
    if (enabled) {
      toast.success('⏰ Sauvegarde automatique activée');
    } else {
      toast.info('⏰ Sauvegarde automatique désactivée');
    }
  }, [updateConfig]);

  // ============================================================
  // 📊 CALCULS DÉRIVÉS
  // ============================================================

  /**
   * Prochaine sauvegarde automatique estimée
   */
  const nextAutoBackup = useCallback((): Date | null => {
    if (!state.config.autoEnabled || state.config.autoMode !== 'app-open') {
      return null;
    }

    const intervals: Record<string, number> = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000
    };

    const interval = intervals[state.config.autoFrequency] || intervals.daily;
    const lastTime = lastAutoBackupRef.current || Date.now();
    
    return new Date(lastTime + interval);
  }, [state.config]);

  /**
   * Taille totale des sauvegardes
   */
  const totalBackupSize = state.backups.reduce((sum, b) => sum + b.size, 0);

  // ============================================================
  // 📤 RETURN
  // ============================================================

  return {
    // États
    ...state,
    nextAutoBackup: nextAutoBackup(),
    totalBackupSize,

    // Actions
    selectDirectory,
    disconnectDirectory,
    createManualBackup,
    previewRestoreFromFile,
    restoreFromFile,
    restoreFromHistory,
    cancelPreview,
    deleteBackup,
    refreshBackups,
    updateConfig,
    toggleAutoBackup
  };
}

// ============================================================
// 🔧 UTILITAIRE EXPORTÉ
// ============================================================

/**
 * Formate la taille en format lisible
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Formate la fréquence de sauvegarde automatique
 */
export function formatFrequency(frequency: string): string {
  const labels: Record<string, string> = {
    hourly: 'Toutes les heures',
    daily: 'Quotidienne',
    weekly: 'Hebdomadaire',
    monthly: 'Mensuelle'
  };
  return labels[frequency] || frequency;
}

/**
 * Formate le mode de sauvegarde automatique
 */
export function formatAutoMode(mode: string): string {
  return mode === 'app-open'
    ? 'Quand l\'app est ouverte'
    : '24/7 (serveur)';
}