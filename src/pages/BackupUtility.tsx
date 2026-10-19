// src/pages/BackupUtility.tsx
// Page Utilitaire : Sauvegardes & Restaurations

import { useState, useRef, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { useBackup, formatFileSize, formatFrequency, formatAutoMode } from '../hooks/useBackup';
import { useTeam } from '../context/TeamContext';
import {
  Save, FolderOpen, Clock, History, Upload, Download,
  Trash2, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  HardDrive, Shield, Zap, Calendar, Settings, Eye,
  ChevronRight, FileArchive, Database, AlertCircle
} from 'lucide-react';
import {
  PageHeader, Card, Badge, Modal, ConfirmDialog,
  Input, Select, Toggle, Alert, EmptyState, ProgressBar
} from '../components/ui/SharedUI';

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function BackupUtility() {
  const backup = useBackup();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [backupProgress, setBackupProgress] = useState(0);

  // ============================================================
  // 📂 GESTION DU DOSSIER
  // ============================================================

  const handleSelectDirectory = async () => {
    await backup.selectDirectory();
  };

  // ============================================================
  // 💾 SAUVEGARDE MANUELLE
  // ============================================================

  const handleManualBackup = async () => {
    setBackupProgress(10);
    
    const result = await backup.createManualBackup({
      includePDFs: backup.config.includePDFs,
      encrypt: backup.config.encrypt
    });

    if (result.success) {
      setBackupProgress(100);
      setTimeout(() => setBackupProgress(0), 2000);
    } else {
      setBackupProgress(0);
    }
  };

  // ============================================================
  // 🔄 RESTAURATION
  // ============================================================

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      alert('❌ Veuillez sélectionner un fichier ZIP');
      return;
    }

    setSelectedFile(file);
    await backup.previewRestoreFromFile(file);
  };

  const handleRestore = async () => {
    if (!selectedFile) return;

    setShowRestoreConfirm(false);
    await backup.restoreFromFile(selectedFile, { mode: 'replace', dryRun: false });
    setSelectedFile(null);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRestoreFromHistory = async (filename: string) => {
    await backup.restoreFromHistory(filename);
  };

  // ============================================================
  // 🗑️ SUPPRESSION
  // ============================================================

  const handleDeleteBackup = async (filename: string) => {
    await backup.deleteBackup(filename);
    setShowDeleteConfirm(null);
  };

  // ============================================================
  // ⚙️ CONFIGURATION
  // ============================================================

  const handleConfigChange = (key: string, value: any) => {
    backup.updateConfig({ [key]: value });
  };

  // ============================================================
  // 📊 CALCULS DÉRIVÉS
  // ============================================================

  const canBackup = backup.directoryValid || !backup.support.supported;
  const totalSize = backup.totalBackupSize;
  const nextBackup = backup.nextAutoBackup;

  // ============================================================
  // 🎨 RENDU
  // ============================================================

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Save}
          iconColor="indigo"
          title="Sauvegardes & Restaurations"
          description="Gérez vos sauvegardes locales de données"
        />

        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          
          {/* ============================================================ */}
          {/* 📂 SECTION 1 : EMPLACEMENT DU DOSSIER */}
          {/* ============================================================ */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                  <FolderOpen size={20} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Emplacement de sauvegarde
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {backup.support.message}
                  </p>
                </div>
              </div>
              {backup.directoryValid && (
                <Badge tone="emerald">Connecté</Badge>
              )}
            </div>

            {backup.directoryName ? (
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <HardDrive size={18} className="text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      📁 {backup.directoryName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {backup.backups.length} sauvegarde(s) • {formatFileSize(totalSize)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectDirectory}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                  >
                    Changer
                  </button>
                  <button
                    onClick={backup.disconnectDirectory}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Déconnecter
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <HardDrive size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  {backup.support.supported
                    ? 'Sélectionnez un dossier pour vos sauvegardes'
                    : 'Les sauvegardes seront téléchargées automatiquement'}
                </p>
                {backup.support.supported && (
                  <button
                    onClick={handleSelectDirectory}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <FolderOpen size={16} />
                    Choisir un dossier
                  </button>
                )}
              </div>
            )}
          </Card>

          {/* ============================================================ */}
          {/* 💾 SECTION 2 : SAUVEGARDE MANUELLE */}
          {/* ============================================================ */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <Save size={20} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  Sauvegarde manuelle
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Créez une sauvegarde instantanée de vos données
                </p>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-3 mb-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileArchive size={16} className="text-slate-400" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Inclure les fichiers PDF
                  </span>
                </div>
                <Toggle
                  checked={backup.config.includePDFs}
                  onChange={(checked) => handleConfigChange('includePDFs', checked)}
                />
              </div>
              {backup.config.includePDFs && (
                <p className="text-xs text-amber-600 dark:text-amber-400 ml-6">
                  ⚠️ Augmente la taille de la sauvegarde (~50 Mo)
                </p>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-slate-400" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Chiffrer avec mot de passe
                  </span>
                </div>
                <Toggle
                  checked={backup.config.encrypt}
                  onChange={(checked) => handleConfigChange('encrypt', checked)}
                />
              </div>
            </div>

            {/* Statistiques actuelles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {backup.stats.map((stat, idx) => (
                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-center">
                  <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                    {stat.count}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {stat.collection}
                  </p>
                </div>
              ))}
            </div>

            {/* Bouton de sauvegarde */}
            <button
              onClick={handleManualBackup}
              disabled={backup.backingUp || !canBackup}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              {backup.backingUp ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Sauvegarde en cours...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Créer une sauvegarde
                </>
              )}
            </button>

            {/* Barre de progression */}
            {backupProgress > 0 && (
              <div className="mt-4">
                <ProgressBar value={backupProgress} color="emerald" />
              </div>
            )}

            {/* Dernière sauvegarde */}
            {backup.lastBackup && (
              <div className="mt-4 flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm text-emerald-700 dark:text-emerald-300">
                    Dernière sauvegarde : {backup.lastBackup.name}
                  </span>
                </div>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  {formatFileSize(backup.lastBackup.size)}
                </span>
              </div>
            )}
          </Card>

          {/* ============================================================ */}
          {/* ⏰ SECTION 3 : SAUVEGARDE AUTOMATIQUE */}
          {/* ============================================================ */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <Clock size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Sauvegarde automatique
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Sauvegardes planifiées selon vos préférences
                  </p>
                </div>
              </div>
              <Toggle
                checked={backup.config.autoEnabled}
                onChange={(checked) => backup.toggleAutoBackup(checked)}
              />
            </div>

            {backup.config.autoEnabled && (
              <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                {/* Mode */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Mode de fonctionnement
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                      <input
                        type="radio"
                        name="autoMode"
                        checked={backup.config.autoMode === 'app-open'}
                        onChange={() => handleConfigChange('autoMode', 'app-open')}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          Quand l'app est ouverte
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Sauvegarde pendant que vous utilisez l'application
                        </p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 transition-colors opacity-50">
                      <input
                        type="radio"
                        name="autoMode"
                        checked={backup.config.autoMode === 'server'}
                        onChange={() => handleConfigChange('autoMode', 'server')}
                        className="w-4 h-4 text-blue-600"
                        disabled
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          24/7 même app fermée
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Nécessite Appwrite Function (à venir)
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Fréquence */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Fréquence
                    </label>
                    <Select
                      value={backup.config.autoFrequency}
                      onChange={(e) => handleConfigChange('autoFrequency', e.target.value)}
                    >
                      <option value="hourly">Toutes les heures</option>
                      <option value="daily">Quotidienne</option>
                      <option value="weekly">Hebdomadaire</option>
                      <option value="monthly">Mensuelle</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Rétention (nb max)
                    </label>
                    <Select
                      value={String(backup.config.retention)}
                      onChange={(e) => handleConfigChange('retention', parseInt(e.target.value))}
                    >
                      <option value="5">5 sauvegardes</option>
                      <option value="10">10 sauvegardes</option>
                      <option value="20">20 sauvegardes</option>
                      <option value="50">50 sauvegardes</option>
                    </Select>
                  </div>
                </div>

                {/* Prochaine sauvegarde */}
                {nextBackup && (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <Calendar size={16} className="text-blue-600 dark:text-blue-400" />
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      Prochaine sauvegarde : {nextBackup.toLocaleString('fr-FR')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ============================================================ */}
          {/* 📜 SECTION 4 : HISTORIQUE */}
          {/* ============================================================ */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
                  <History size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Historique des sauvegardes
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {backup.backups.length} sauvegarde(s) • {formatFileSize(totalSize)}
                  </p>
                </div>
              </div>
              <button
                onClick={backup.refreshBackups}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                title="Actualiser"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {backup.backups.length === 0 ? (
              <EmptyState
                icon={History}
                title="Aucune sauvegarde"
                description="Créez votre première sauvegarde ci-dessus"
                tone="indigo"
              />
            ) : (
              <div className="space-y-2">
                {backup.backups.map((bkp, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileArchive size={20} className="text-purple-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {bkp.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatFileSize(bkp.size)} • {formatLastModified(bkp.lastModified)}
                        </p>
                      </div>
                      <Badge tone={bkp.type === 'auto' ? 'blue' : 'emerald'}>
                        {bkp.type === 'auto' ? 'Auto' : 'Manuel'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleRestoreFromHistory(bkp.name)}
                        className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        title="Restaurer"
                      >
                        <Upload size={16} />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(bkp.name)}
                        className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ============================================================ */}
          {/* 🔄 SECTION 5 : RESTAURATION */}
          {/* ============================================================ */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  Restaurer depuis un fichier
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ⚠️ Cette action remplacera toutes vos données actuelles
                </p>
              </div>
            </div>

            <Alert tone="warning" icon={AlertCircle} title="Attention">
              <p className="text-sm">
                La restauration <strong>remplacera définitivement</strong> vos données actuelles.
                Assurez-vous d'avoir une sauvegarde récente avant de continuer.
              </p>
            </Alert>

            <div className="mt-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={backup.restoring}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={18} />
                Choisir un fichier ZIP
              </button>
            </div>

            {selectedFile && backup.preview && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <h4 className="font-medium text-slate-900 dark:text-white mb-3">
                  📦 Prévisualisation : {selectedFile.name}
                </h4>
                
                {backup.preview.valid ? (
                  <>
                    <div className="space-y-2 mb-4">
                      {backup.preview.collections.map((col, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">
                            {col.name}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                            {col.count} documents
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {backup.preview.warnings.length > 0 && (
                      <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        {backup.preview.warnings.map((warn, idx) => (
                          <p key={idx} className="text-xs text-amber-700 dark:text-amber-300">
                            ⚠️ {warn}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowRestoreConfirm(true)}
                        className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                      >
                        Restaurer
                      </button>
                      <button
                        onClick={() => {
                          backup.cancelPreview();
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                      >
                        Annuler
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                      ❌ Fichier invalide
                    </p>
                    {backup.preview.errors.map((err, idx) => (
                      <p key={idx} className="text-xs text-red-600 dark:text-red-400">
                        • {err}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ============================================================ */}
          {/* ℹ️ INFORMATIONS */}
          {/* ============================================================ */}
          <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200 dark:border-indigo-800">
            <div className="flex items-start gap-3">
              <Database size={20} className="text-indigo-600 dark:text-indigo-400 mt-0.5" />
              <div>
                <h4 className="font-medium text-indigo-900 dark:text-indigo-200 mb-2">
                  À propos des sauvegardes
                </h4>
                <ul className="space-y-1 text-sm text-indigo-700 dark:text-indigo-300">
                  <li>• Les sauvegardes contiennent toutes vos données (factures, devis, paiements...)</li>
                  <li>• Conservez vos fichiers ZIP dans un endroit sûr (disque externe, cloud...)</li>
                  <li>• Testez régulièrement la restauration pour vérifier l'intégrité</li>
                  <li>• Les fichiers PDF sont exclus par défaut pour réduire la taille</li>
                </ul>
              </div>
            </div>
          </Card>
        </main>

        {/* ============================================================ */}
        {/* 🔐 MODAL DE CONFIRMATION DE RESTAURATION */}
        {/* ============================================================ */}
        <ConfirmDialog
          open={showRestoreConfirm}
          onClose={() => setShowRestoreConfirm(false)}
          onConfirm={handleRestore}
          title="⚠️ Confirmer la restauration"
          description={
            <div className="space-y-3">
              <p className="text-slate-600 dark:text-slate-400">
                Cette action va <strong className="text-red-600">remplacer définitivement</strong> toutes vos données actuelles par celles de la sauvegarde.
              </p>
              {backup.preview && (
                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                    Contenu de la sauvegarde :
                  </p>
                  {backup.preview.collections.map((col, idx) => (
                    <p key={idx} className="text-xs text-slate-600 dark:text-slate-400">
                      • {col.name} : {col.count} documents
                    </p>
                  ))}
                </div>
              )}
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ Cette action est irréversible !
              </p>
            </div>
          }
          confirmLabel="Oui, restaurer"
          cancelLabel="Annuler"
          tone="danger"
          loading={backup.restoring}
        />

        {/* ============================================================ */}
        {/* 🗑️ MODAL DE CONFIRMATION DE SUPPRESSION */}
        {/* ============================================================ */}
        <ConfirmDialog
          open={!!showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(null)}
          onConfirm={() => showDeleteConfirm && handleDeleteBackup(showDeleteConfirm)}
          title="Supprimer cette sauvegarde ?"
          description={
            <p className="text-slate-600 dark:text-slate-400">
              Le fichier <strong>{showDeleteConfirm}</strong> sera définitivement supprimé.
              Cette action est irréversible.
            </p>
          }
          confirmLabel="Supprimer"
          cancelLabel="Annuler"
          tone="danger"
        />
      </div>
    </Sidebar>
  );
}

// ============================================================
// 🔧 HELPERS
// ============================================================

function formatLastModified(date: Date): string {
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
    year: 'numeric'
  });
}