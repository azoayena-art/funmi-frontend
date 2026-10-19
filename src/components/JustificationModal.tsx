// src/components/JustificationModal.tsx — Version finale avec preview PDF natif
// ✅ CORRIGÉ : PDF s'ouvrent correctement via window.open() (viewer natif)
// ✅ CORRIGÉ : Images en aperçu inline
// ✅ NOUVEAU : Détection automatique des fichiers inaccessibles
// ✅ NOUVEAU : Bouton "Remplacer" pour les entrées orphelines
// ✅ NOUVEAU : Gestion robuste des erreurs 401 (orphelins)

import { useState, useEffect, useCallback, useRef } from 'react';
import { databases, storage, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { getFilePreviewUrl } from '../utils/storage';
import { toast } from 'sonner';
import Modal from './ui/Modal';
import { EmptyState } from './ui/SharedUI';
import {
  Paperclip, Upload, Eye, Trash2, FileText, Image as ImageIcon,
  AlertTriangle, CheckCircle2, Loader2, Receipt, AlertCircle,
  X, Clock, Info, Wallet, Download, RefreshCw,
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite';
import { getTeamPermissions } from '../utils/rowLevelPermissions';

// 🗂️ Buckets à tester
const BUCKET_CANDIDATES = ['justifications', 'expense-receipts', 'documents', 'company_logos'];
export const JUSTIFICATIONS_BUCKET_ID = BUCKET_CANDIDATES[0];
const MAX_SIZE_MB = 10;
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export interface JustifiableExpense {
  type: 'supplier_invoice' | 'supplier_payment' | 'refund' | 'other' | 'cash_operation';
  id: string;
  number: string;
  label: string;
  amount: number;
  date?: string;
}

type ValidationStatus = 'pending' | 'validated' | 'rejected';

interface JustificationDoc {
  $id: string;
  teamId: string;
  expenseType: string;
  expenseId: string;
  expenseNumber: string;
  fileId: string;
  bucketId?: string;
  fileHash?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  amount: number;
  uploadedBy: string;
  uploadedAt: string;
  validationStatus?: ValidationStatus;
  validatedBy?: string;
  validatedAt?: string;
  rejectionReason?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  expense: JustifiableExpense | null;
  onJustificationChanged?: () => void;
}

const EXPENSE_TYPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  supplier_invoice: { label: 'Facture fournisseur', icon: Receipt, color: 'text-amber-600' },
  supplier_payment: { label: 'Paiement fournisseur', icon: Wallet, color: 'text-rose-600' },
  refund: { label: 'Remboursement', icon: Receipt, color: 'text-blue-600' },
  other: { label: 'Autre dépense', icon: FileText, color: 'text-slate-600' },
  cash_operation: { label: 'Opération de trésorerie', icon: Wallet, color: 'text-indigo-600' },
};

const computeSHA256 = async (file: File): Promise<string> => {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
};

const safeGetTeamPermissions = (appwriteTeamId: string | null | undefined): string[] => {
  try {
    if (!appwriteTeamId) return [];
    return getTeamPermissions(appwriteTeamId);
  } catch (e) {
    console.warn('⚠️ getTeamPermissions fallback:', e);
    return [];
  }
};

/**
 * 🎯 Vérifie si un fichier est accessible (teste plusieurs buckets)
 */
async function checkFileAccessibility(
  fileId: string,
  preferredBucket?: string
): Promise<{ accessible: boolean; bucketId?: string; url?: string; errorCode?: number }> {
  if (!fileId) return { accessible: false };

  const bucketsToTry = preferredBucket
    ? [preferredBucket, ...BUCKET_CANDIDATES.filter(b => b !== preferredBucket)]
    : BUCKET_CANDIDATES;

  for (const bucketId of bucketsToTry) {
    try {
      await storage.getFile(bucketId, fileId);
      // ✅ getFileView() sert le fichier ORIGINAL avec le bon Content-Type
      // → PDFs s'affichent dans le viewer natif
      // → Images s'affichent directement
      const url = storage.getFileView(bucketId, fileId);
      return { accessible: true, bucketId, url: url.toString() };
    } catch (error: any) {
      if (error.code === 404) continue;
      if (error.code === 401) {
        console.warn(`⚠️ Permission refusée pour ${bucketId}/${fileId}`);
        return { accessible: false, errorCode: 401 };
      }
      console.warn(`⚠️ Erreur bucket ${bucketId}:`, error.message);
    }
  }

  return { accessible: false, errorCode: 404 };
}
export default function JustificationModal({ open, onClose, expense, onJustificationChanged }: Props) {
  const { user } = useAuth();
  const { customTeamId, appwriteTeamId } = useTeam();
  const [justifications, setJustifications] = useState<JustificationDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());
  const [inlinePreview, setInlinePreview] = useState<{ url: string; name: string; type: string } | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && expense) {
      console.log('🔍 JustificationModal ouvert:', { type: expense.type, id: expense.id });
    }
  }, [open, expense]);

  /**
   * ✅ Chargement avec détection AUTOMATIQUE des orphelins
   */
  const loadJustifications = useCallback(async () => {
    if (!expense || !customTeamId) return;
    setLoading(true);
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
        Query.equal('teamId', customTeamId),
        Query.equal('expenseId', expense.id),
        Query.orderDesc('uploadedAt'),
        Query.limit(100),
      ]);

      const docs = res.documents as unknown as JustificationDoc[];
      const newOrphans = new Set<string>();

      for (const doc of docs) {
        const result = await checkFileAccessibility(doc.fileId, doc.bucketId);
        if (!result.accessible) {
          newOrphans.add(doc.$id);
          console.warn(`⚠️ Orphelin détecté: ${doc.fileName} (fileId: ${doc.fileId})`);
        } else if (result.bucketId && result.bucketId !== doc.bucketId) {
          try {
            await databases.updateDocument(
              DATABASE_ID,
              'expense_justifications',
              doc.$id,
              { bucketId: result.bucketId },
              safeGetTeamPermissions(appwriteTeamId)
            );
            doc.bucketId = result.bucketId;
            console.log(`🔄 bucketId corrigé: ${doc.fileName} → ${result.bucketId}`);
          } catch {}
        }
      }

      setJustifications(docs);
      setOrphanIds(newOrphans);

      if (newOrphans.size > 0) {
        console.log(`⚠️ ${newOrphans.size} fichier(s) orphelin(s) détecté(s) automatiquement`);
      }
    } catch (e) {
      console.warn('⚠️ Justificatifs non chargés:', e);
      setJustifications([]);
    } finally {
      setLoading(false);
    }
  }, [expense, customTeamId, appwriteTeamId]);

  useEffect(() => {
    if (open) loadJustifications();
    else {
      setJustifications([]);
      setOrphanIds(new Set());
      if (inlinePreview) {
        URL.revokeObjectURL(inlinePreview.url);
        setInlinePreview(null);
      }
    }
  }, [open, loadJustifications]);

  const handleFiles = async (files: FileList | File[]) => {
    if (!expense || !customTeamId || !user || !appwriteTeamId) {
      toast.error('Session invalide');
      return;
    }

    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    let ok = 0, ko = 0, duplicates = 0;

    const filePermissions = [
      Permission.read(Role.any()),
      Permission.update(Role.team(appwriteTeamId)),
      Permission.delete(Role.team(appwriteTeamId)),
    ];

    const dbPermissions = safeGetTeamPermissions(appwriteTeamId);

    let uploadBucket = JUSTIFICATIONS_BUCKET_ID;
    try {
      await storage.getBucket(uploadBucket);
    } catch (err: any) {
      for (const candidate of BUCKET_CANDIDATES) {
        try {
          await storage.getBucket(candidate);
          uploadBucket = candidate;
          break;
        } catch {}
      }
    }

    for (const file of list) {
      try {
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          toast.error(`${file.name} : trop lourd`);
          ko++;
          continue;
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
          toast.error(`${file.name} : format non supporté`);
          ko++;
          continue;
        }

        const fileHash = await computeSHA256(file);

        if (fileHash) {
          const existingDocs = await databases.listDocuments(
            DATABASE_ID,
            'expense_justifications',
            [Query.equal('teamId', customTeamId), Query.equal('fileHash', fileHash), Query.limit(1)]
          );
          if (existingDocs.documents.length > 0) {
            duplicates++;
            continue;
          }
        }

        const uploaded = await storage.createFile(
          uploadBucket,
          ID.unique(),
          file,
          filePermissions
        );

        console.log('✅ Fichier uploadé:', { fileId: uploaded.$id, bucketId: uploadBucket });

        const docData: any = {
          teamId: customTeamId,
          expenseType: expense.type,
          expenseId: expense.id,
          expenseNumber: expense.number,
          fileId: uploaded.$id,
          bucketId: uploadBucket,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          amount: expense.amount || 0,
          uploadedBy: user.$id,
          uploadedAt: new Date().toISOString(),
          validationStatus: 'pending',
        };
        if (fileHash) docData.fileHash = fileHash;

        await databases.createDocument(
          DATABASE_ID,
          'expense_justifications',
          ID.unique(),
          docData,
          dbPermissions
        );
        ok++;
      } catch (e: any) {
        console.error('❌ Upload justificatif:', e);
        toast.error(`Erreur upload ${file.name}`, { description: e.message });
        ko++;
      }
    }

    setUploading(false);

    if (ok > 0) {
      toast.success(`${ok} justificatif(s) importé(s)`, {
        description: 'Vérifiez puis validez',
      });
      loadJustifications();
      onJustificationChanged?.();
    }
    if (duplicates > 0) toast.warning(`${duplicates} doublon(s)`);
    if (ko > 0) toast.warning(`${ko} refusé(s)`);
  };

  /**
   * 🔄 REMPLACEMENT d'un fichier orphelin
   */
  const handleReplaceFile = async (files: FileList | File[]) => {
    if (!replaceTargetId || !expense || !customTeamId || !user || !appwriteTeamId) return;

    const file = files[0];
    if (!file) return;

    setUploading(true);

    try {
      const filePermissions = [
        Permission.read(Role.any()),
        Permission.update(Role.team(appwriteTeamId)),
        Permission.delete(Role.team(appwriteTeamId)),
      ];

      const uploaded = await storage.createFile(
        JUSTIFICATIONS_BUCKET_ID,
        ID.unique(),
        file,
        filePermissions
      );

      const fileHash = await computeSHA256(file);

      const updateData: any = {
        fileId: uploaded.$id,
        bucketId: JUSTIFICATIONS_BUCKET_ID,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedBy: user.$id,
        uploadedAt: new Date().toISOString(),
        validationStatus: 'pending',
      };
      if (fileHash) updateData.fileHash = fileHash;

      await databases.updateDocument(
        DATABASE_ID,
        'expense_justifications',
        replaceTargetId,
        updateData,
        safeGetTeamPermissions(appwriteTeamId)
      );

      toast.success('✅ Fichier remplacé avec succès', {
        description: file.name,
      });

      setReplaceTargetId(null);
      loadJustifications();
      onJustificationChanged?.();
    } catch (e: any) {
      console.error('❌ Remplacement échoué:', e);
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleValidateJustification = async (j: JustificationDoc) => {
    if (!user || !customTeamId || !appwriteTeamId) return;
    if (j.teamId !== customTeamId) {
      toast.error('⚠️ Accès refusé');
      return;
    }

    if (!confirm(
      `Confirmer que ce justificatif est valide pour "${expense?.label}" ?\n\n` +
      `Vous attestez avoir vérifié : tiers, montant et cohérence.`
    )) return;

    setValidating(j.$id);

    try {
      await databases.updateDocument(
        DATABASE_ID,
        'expense_justifications',
        j.$id,
        {
          validationStatus: 'validated',
          validatedBy: user.$id,
          validatedAt: new Date().toISOString(),
        },
        safeGetTeamPermissions(appwriteTeamId)
      );

      toast.success('✅ Justificatif validé', {
        description: `Validé par ${user.name || user.email} le ${new Date().toLocaleDateString('fr-FR')}`,
      });

      loadJustifications();
      onJustificationChanged?.();
    } catch (e: any) {
      toast.error(`Erreur validation : ${e.message}`);
    } finally {
      setValidating(null);
    }
  };

  const handleRejectJustification = async (j: JustificationDoc) => {
    if (!user || !customTeamId || !appwriteTeamId) return;
    if (j.teamId !== customTeamId) {
      toast.error('⚠️ Accès refusé');
      return;
    }

    const reason = prompt('Motif du rejet (optionnel mais recommandé) :');
    if (reason === null) return;

    setValidating(j.$id);

    try {
      await databases.updateDocument(
        DATABASE_ID,
        'expense_justifications',
        j.$id,
        {
          validationStatus: 'rejected',
          validatedBy: user.$id,
          validatedAt: new Date().toISOString(),
          rejectionReason: reason || '',
        },
        safeGetTeamPermissions(appwriteTeamId)
      );

      toast.warning('Justificatif rejeté', { description: reason || 'Aucun motif' });

      loadJustifications();
      onJustificationChanged?.();
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setValidating(null);
    }
  };

  /**
   * ✅ PRÉVISUALISATION DIRECTE via window.open()
   * ✅ PDFs s'ouvrent dans le viewer natif du navigateur
   * ✅ Images s'ouvrent dans une modale inline
   */
  const handlePreview = async (j: JustificationDoc) => {
    setPreviewing(j.$id);

    try {
      const result = await checkFileAccessibility(j.fileId, j.bucketId);

      if (!result.accessible || !result.url) {
        setOrphanIds(prev => new Set(prev).add(j.$id));
        if (result.errorCode === 401) {
          toast.error('🔒 Accès refusé au fichier', {
            description: `Permissions insuffisantes pour "${j.fileName}". Remplacez le fichier.`,
            duration: 8000,
          });
        } else {
          toast.error('📁 Fichier introuvable', {
            description: `"${j.fileName}" n'existe plus. Remplacez ou supprimez.`,
            duration: 8000,
          });
        }
        return;
      }

      // Mise à jour bucketId si différent
      if (result.bucketId !== j.bucketId) {
        try {
          await databases.updateDocument(
            DATABASE_ID,
            'expense_justifications',
            j.$id,
            { bucketId: result.bucketId },
            safeGetTeamPermissions(appwriteTeamId)
          );
        } catch {}
      }

      // ✅ IMAGE : Aperçu inline dans modale (fetch blob)
      if (j.fileType.startsWith('image/')) {
        try {
          const response = await fetch(result.url, {
            credentials: 'include',
            mode: 'cors',
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          setInlinePreview({ url: blobUrl, name: j.fileName, type: j.fileType });
        } catch (error: any) {
          console.error('❌ Erreur aperçu image:', error);
          // Fallback : ouvrir dans nouvel onglet
          window.open(result.url, '_blank', 'noopener,noreferrer');
        }
      } 
      // ✅ PDF et autres : Ouvrir directement dans nouvel onglet (viewer natif)
      else {
        const newWindow = window.open(result.url, '_blank', 'noopener,noreferrer');
        
        if (!newWindow || newWindow.closed) {
          // Popup bloqué → téléchargement
          toast.info('Popup bloqué par le navigateur — téléchargement direct', {
            description: j.fileName,
          });
          
          const link = document.createElement('a');
          link.href = result.url;
          link.download = j.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    } catch (error: any) {
      console.error('❌ Erreur preview:', error);
      setOrphanIds(prev => new Set(prev).add(j.$id));
      toast.error('Erreur de prévisualisation', {
        description: error.message || 'Impossible de charger le fichier',
        duration: 8000,
      });
    } finally {
      setPreviewing(null);
    }
  };

  /**
   * ✅ TÉLÉCHARGEMENT DIRECT via URL Appwrite
   */
  const handleDownload = async (j: JustificationDoc) => {
    setPreviewing(j.$id);

    try {
      const result = await checkFileAccessibility(j.fileId, j.bucketId);

      if (!result.accessible || !result.url) {
        toast.error('📁 Fichier introuvable');
        setOrphanIds(prev => new Set(prev).add(j.$id));
        return;
      }

      // ✅ Téléchargement direct via URL Appwrite
      const link = document.createElement('a');
      link.href = result.url;
      link.download = j.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Téléchargement démarré', { description: j.fileName });
    } catch (error: any) {
      toast.error('Erreur de téléchargement', { description: error.message });
      setOrphanIds(prev => new Set(prev).add(j.$id));
    } finally {
      setPreviewing(null);
    }
  };

  const handleDelete = async (j: JustificationDoc) => {
    if (!confirm(`Supprimer le justificatif "${j.fileName}" ?`)) return;
    if (j.teamId !== customTeamId) {
      toast.error('⚠️ Accès refusé');
      return;
    }

    try {
      await databases.deleteDocument(DATABASE_ID, 'expense_justifications', j.$id);

      const bucketsToTry = j.bucketId
        ? [j.bucketId, ...BUCKET_CANDIDATES.filter(b => b !== j.bucketId)]
        : BUCKET_CANDIDATES;

      let deletedFromStorage = false;
      for (const bucketId of bucketsToTry) {
        try {
          await storage.deleteFile(bucketId, j.fileId);
          deletedFromStorage = true;
          break;
        } catch (err: any) {
          if (err.code !== 404) console.warn(`⚠️ Suppression ${bucketId}:`, err.message);
        }
      }

      toast.success('Justificatif supprimé', {
        description: deletedFromStorage ? 'Entrée et fichier supprimés' : 'Entrée supprimée',
      });
      loadJustifications();
      onJustificationChanged?.();
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  const handleCleanupOrphans = async () => {
    if (orphanIds.size === 0) return;
    if (!confirm(`Supprimer ${orphanIds.size} entrée(s) orpheline(s) ?`)) return;

    let deleted = 0;
    for (const id of orphanIds) {
      try {
        await databases.deleteDocument(DATABASE_ID, 'expense_justifications', id);
        deleted++;
      } catch {}
    }

    toast.success(`${deleted} entrée(s) orpheline(s) supprimée(s)`);
    loadJustifications();
    onJustificationChanged?.();
  };

  const closeInlinePreview = () => {
    if (inlinePreview) {
      URL.revokeObjectURL(inlinePreview.url);
      setInlinePreview(null);
    }
  };

  const fmtSize = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`;
  const isImage = (t: string) => t.startsWith('image/');

  const validatedCount = justifications.filter(j => j.validationStatus === 'validated').length;
  const pendingCount = justifications.filter(j => j.validationStatus === 'pending' || !j.validationStatus).length;
  const rejectedCount = justifications.filter(j => j.validationStatus === 'rejected').length;
  const orphanCount = orphanIds.size;

  const expenseTypeInfo = EXPENSE_TYPE_LABELS[expense?.type || 'other'] || EXPENSE_TYPE_LABELS.other;
  const TypeIcon = expenseTypeInfo.icon;

  return (
    <>
      <Modal
        open={open && !!expense}
        onClose={onClose}
        title={`📎 Justificatifs — ${expense?.number || ''}`}
        icon={<Paperclip className="text-emerald-600" size={20} />}
        maxWidth="sm:max-w-2xl"
      >
        {expense && (
          <div className="space-y-4">
            {/* Résumé */}
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 dark:bg-slate-700 ${expenseTypeInfo.color}`}>
                  <TypeIcon size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{expense.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">{expenseTypeInfo.label}</span> • {expense.number}
                    {expense.date ? ` • ${new Date(expense.date).toLocaleDateString('fr-FR')}` : ''}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{expense.amount.toFixed(2)} €</p>
                {validatedCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 size={11} /> {validatedCount} validé(s)
                  </span>
                ) : justifications.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    <Clock size={11} /> {pendingCount} à valider
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                    <AlertTriangle size={11} /> Sans justificatif
                  </span>
                )}
              </div>
            </div>

            {/* Alerte orphelins */}
            {orphanCount > 0 && (
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] text-rose-800 dark:text-rose-200">
                      <p className="font-semibold mb-0.5">
                        {orphanCount} fichier(s) inaccessible(s)
                      </p>
                      <p className="text-rose-700 dark:text-rose-300">
                        Fichiers supprimés ou permissions invalides. Remplacez-les ou nettoyez.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleCleanupOrphans}
                    className="shrink-0 px-3 py-1.5 text-[11px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={11} />
                    Nettoyer tout
                  </button>
                </div>
              </div>
            )}

            {/* Workflow */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-2">
              <Info size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-blue-800 dark:text-blue-200 space-y-0.5">
                <p><strong>Workflow de validation :</strong></p>
                <p>1. 📤 Importez le justificatif</p>
                <p>2. 👁️ Ouvrez pour vérifier les informations</p>
                <p>3. ✅ Cliquez sur "Valider" pour confirmer</p>
              </div>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
              />
              <input
                ref={replaceInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleReplaceFile(e.target.files);
                  e.target.value = '';
                }}
              />
              {uploading ? (
                <>
                  <Loader2 size={24} className="mx-auto text-emerald-600 animate-spin mb-2" />
                  <p className="text-sm text-slate-600 dark:text-slate-300">Upload en cours...</p>
                </>
              ) : (
                <>
                  <Upload size={24} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Glissez ou cliquez pour ajouter un justificatif</p>
                  <p className="text-xs text-slate-500 mt-1">PDF, PNG, JPG — {MAX_SIZE_MB} Mo max</p>
                </>
              )}
            </div>

            {/* Liste */}
            {loading ? (
              <div className="text-center py-6 text-sm text-slate-500 animate-pulse">Chargement et vérification...</div>
            ) : justifications.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="Aucun justificatif"
                description={expense.type === 'cash_operation'
                  ? "Ajoutez le reçu ou la facture pour cette opération."
                  : "Ajoutez le reçu ou la facture fournisseur."
                }
                tone="emerald"
              />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {justifications.map((j) => {
                  const status = j.validationStatus || 'pending';
                  const isValidating = validating === j.$id;
                  const isPreviewLoading = previewing === j.$id;
                  const isOrphan = orphanIds.has(j.$id);

                  return (
                    <div
                      key={j.$id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                        isOrphan
                          ? 'bg-rose-50/50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'
                          : status === 'validated'
                          ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                          : status === 'rejected'
                          ? 'bg-rose-50/50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isOrphan ? 'bg-rose-100 dark:bg-rose-900/40' : 'bg-slate-100 dark:bg-slate-700'
                      }`}>
                        {isOrphan ? (
                          <AlertTriangle size={16} className="text-rose-600" />
                        ) : isImage(j.fileType) ? (
                          <ImageIcon size={16} className="text-emerald-600" />
                        ) : (
                          <FileText size={16} className="text-rose-600" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{j.fileName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {fmtSize(j.fileSize)} • {new Date(j.uploadedAt).toLocaleDateString('fr-FR')}
                          {j.bucketId && !isOrphan && (
                            <span className="ml-1 text-slate-400 dark:text-slate-500">
                              • <code className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1 rounded">{j.bucketId}</code>
                            </span>
                          )}
                        </p>

                        {isOrphan ? (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle size={10} className="text-rose-600" />
                            <span className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold">
                              Fichier inaccessible — Remplacez ou supprimez
                            </span>
                          </div>
                        ) : status === 'validated' ? (
                          <div className="flex items-center gap-1 mt-1">
                            <CheckCircle2 size={10} className="text-emerald-600 dark:text-emerald-400" />
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold">
                              Validé {j.validatedAt && `le ${new Date(j.validatedAt).toLocaleDateString('fr-FR')}`}
                            </span>
                          </div>
                        ) : status === 'rejected' ? (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <X size={10} className="text-rose-600 dark:text-rose-400" />
                            <span className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold">Rejeté</span>
                            {j.rejectionReason && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-1">— {j.rejectionReason}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mt-1">
                            <Clock size={10} className="text-amber-600 dark:text-amber-400" />
                            <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold">À valider</span>
                          </div>
                        )}
                      </div>

                      {status === 'pending' && !isOrphan && (
                        <>
                          <button
                            onClick={() => handleValidateJustification(j)}
                            disabled={isValidating}
                            className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors disabled:opacity-50"
                            title="Valider"
                          >
                            {isValidating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                          </button>
                          <button
                            onClick={() => handleRejectJustification(j)}
                            disabled={isValidating}
                            className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors disabled:opacity-50"
                            title="Rejeter"
                          >
                            {isValidating ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                          </button>
                        </>
                      )}

                      {isOrphan && (
                        <button
                          onClick={() => {
                            setReplaceTargetId(j.$id);
                            replaceInputRef.current?.click();
                          }}
                          className="p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                          title="Remplacer le fichier"
                        >
                          <RefreshCw size={16} />
                        </button>
                      )}

                      {!isOrphan && (
                        <button
                          onClick={() => handlePreview(j)}
                          disabled={isPreviewLoading}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors disabled:opacity-50"
                          title={isImage(j.fileType) ? "Aperçu image" : "Ouvrir le document"}
                        >
                          {isPreviewLoading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                        </button>
                      )}

                      {!isOrphan && (
                        <button
                          onClick={() => handleDownload(j)}
                          disabled={isPreviewLoading}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50"
                          title="Télécharger"
                        >
                          <Download size={16} />
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(j)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Stats */}
            {justifications.length > 0 && (
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Validés</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{validatedCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">À valider</p>
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{pendingCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Rejetés</p>
                  <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{rejectedCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Orphelins</p>
                  <p className={`text-sm font-bold ${orphanCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{orphanCount}</p>
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ⚖️ Obligation fiscale : tout achat professionnel doit être justifié par une pièce comptable.
            </p>
          </div>
        )}
      </Modal>

      {/* MODALE D'APERÇU INLINE POUR IMAGES */}
      {inlinePreview && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeInlinePreview}
        >
          <div className="relative max-w-4xl max-h-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={closeInlinePreview}
              className="absolute -top-12 right-0 p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Fermer (Échap)"
            >
              <X size={24} />
            </button>
            <p className="absolute -top-12 left-0 text-white text-sm font-medium truncate max-w-[70%]">
              {inlinePreview.name}
            </p>
            <img
              src={inlinePreview.url}
              alt={inlinePreview.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = inlinePreview.url;
                  link.download = inlinePreview.name;
                  link.click();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <Download size={14} />
                Télécharger
              </button>
              <button
                onClick={closeInlinePreview}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-600 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}