// src/utils/rowLevelPermissions.ts
// ============================================================
// 🔐 GESTION CENTRALISÉE DES PERMISSIONS RLS (Row-Level Security)
// ------------------------------------------------------------
// Source unique de vérité pour toutes les permissions Appwrite
// utilisées dans l'application. Élimine la duplication de code
// et garantit la cohérence des règles d'accès multi-tenant.
// ============================================================

import { Permission, Role } from 'appwrite';

// ============================================================
// 📐 TYPES
// ============================================================

/**
 * Options de génération des permissions d'équipe.
 */
export interface TeamPermissionOptions {
  /**
   * Si true, ajoute la permission `read(Role.any())` pour permettre
   * l'accès via lien public (clientToken pour factures/devis).
   * @default false
   */
  isPublic?: boolean;

  /**
   * Si true, ne génère que la permission de lecture (utile pour
   * les exports comptables, rapports, ou consultations externes).
   * @default false
   */
  readOnly?: boolean;
}

/**
 * Résultat d'une vérification d'accès (utilisé par verifyTeamAccessStrict).
 */
export interface AccessVerificationResult {
  valid: boolean;
  reason?: string;
  docTeamId?: string;
  expectedTeamId?: string;
}

// ============================================================
// 🎯 FONCTION PRINCIPALE : getTeamPermissions
// ============================================================

/**
 * Génère les permissions RLS pour un document appartenant à une équipe.
 *
 * Supporte **deux signatures** pour la rétrocompatibilité :
 * - `getTeamPermissions(appwriteTeamId, true)` (ancienne signature booléenne)
 * - `getTeamPermissions(appwriteTeamId, { isPublic: true, readOnly: false })` (nouvelle signature)
 *
 * @param appwriteTeamId - L'ID **NATIF** Appwrite de l'équipe (via `useTeam().appwriteTeamId`)
 *                         ⚠️ Ne PAS utiliser `customTeamId` qui est l'ID custom de votre app
 * @param options - Options de permission (booléen ou objet)
 * @returns Tableau de chaînes de permissions Appwrite
 *
 * @example
 * // Signature classique (lecture + écriture + suppression)
 * const perms = getTeamPermissions(appwriteTeamId);
 *
 * @example
 * // Ancienne signature (rétrocompatible)
 * const publicPerms = getTeamPermissions(appwriteTeamId, true);
 *
 * @example
 * // Nouvelle signature avec options
 * const perms = getTeamPermissions(appwriteTeamId, {
 *   isPublic: true,    // Accessible via lien public
 *   readOnly: false,   // Lecture + écriture + suppression
 * });
 *
 * @example
 * // Lecture seule pour exports
 * const readOnlyPerms = getTeamPermissions(appwriteTeamId, { readOnly: true });
 */
export const getTeamPermissions = (
  appwriteTeamId: string | null | undefined,
  options: TeamPermissionOptions | boolean = {}
): string[] => {
  // 🔧 Support rétroactif de l'ancienne signature (booléen)
  const opts: TeamPermissionOptions =
    typeof options === 'boolean' ? { isPublic: options } : options;

  // 🚨 Garde-fou : appwriteTeamId requis
  if (!appwriteTeamId) {
    console.error(
      '🚨 [getTeamPermissions] appwriteTeamId manquant ! ' +
      'Document créé en mode privé (personne n\'y aura accès). ' +
      'Vérifiez que useTeam() a bien résolu l\'ID natif Appwrite.'
    );
    return [];
  }

  const perms: string[] = [];

  // 📖 Permission de lecture (toujours présente)
  perms.push(Permission.read(Role.team(appwriteTeamId)));

  // ✏️ Permissions d'écriture (sauf si readOnly)
  if (!opts.readOnly) {
    perms.push(
      Permission.update(Role.team(appwriteTeamId)),
      Permission.delete(Role.team(appwriteTeamId))
    );
  }

  // 🌐 Permission publique (pour liens client : /f/:token, /v/:token)
  if (opts.isPublic) {
    perms.push(Permission.read(Role.any()));
  }

  return perms;
};

// ============================================================
// 🛡️ HELPERS DE VÉRIFICATION D'ACCÈS
// ============================================================

/**
 * Vérifie qu'un document appartient bien à l'équipe courante.
 *
 * ⚠️ **Non bloquant** : retourne simplement un booléen.
 * Utilisez `verifyTeamAccessStrict` pour une version qui throw.
 *
 * @param doc - Document avec un champ `teamId`
 * @param expectedTeamId - ID custom de l'équipe attendue (customTeamId)
 * @returns true si l'accès est autorisé
 *
 * @example
 * if (!verifyTeamAccess(invoice, currentTeamId)) {
 *   toast.error('Accès refusé');
 *   return;
 * }
 */
export const verifyTeamAccess = (
  doc: { teamId?: string } | null | undefined,
  expectedTeamId: string | null | undefined
): boolean => {
  if (!doc || !doc.teamId || !expectedTeamId) return false;
  return doc.teamId === expectedTeamId;
};

/**
 * Vérifie l'accès à un document et **throw une erreur** si l'accès est refusé.
 *
 * ✅ Version stricte de `verifyTeamAccess` à utiliser dans les handlers critiques.
 * 📝 Log en développement uniquement pour faciliter le debug cross-tenant.
 *
 * @param doc - Document avec un champ `teamId`
 * @param expectedTeamId - ID custom de l'équipe attendue (customTeamId)
 * @param context - Nom du contexte pour les logs (ex: 'Invoice.handleArchive')
 * @throws Error si l'accès est refusé
 *
 * @example
 * try {
 *   verifyTeamAccessStrict(invoice, currentTeamId, 'Invoice.handleArchive');
 *   await databases.updateDocument(...);
 * } catch (err) {
 *   toast.error(err.message);
 * }
 */
export const verifyTeamAccessStrict = (
  doc: { teamId?: string } | null | undefined,
  expectedTeamId: string | null | undefined,
  context: string = 'unknown'
): void => {
  if (!verifyTeamAccess(doc, expectedTeamId)) {
    // 📝 Log uniquement en dev pour éviter de polluer la prod
    if (import.meta.env.DEV) {
      console.warn(
        `⚠️ [${context}] Tentative d'accès cross-tenant bloquée`,
        {
          docTeamId: doc?.teamId,
          expectedTeamId,
          timestamp: new Date().toISOString(),
        }
      );
    }
    throw new Error('Accès refusé : document hors équipe');
  }
};

/**
 * Vérifie l'accès et retourne un résultat structuré (sans throw).
 *
 * Utile pour les validations où vous voulez gérer l'erreur vous-même
 * avec des messages personnalisés.
 *
 * @example
 * const result = checkTeamAccess(invoice, currentTeamId);
 * if (!result.valid) {
 *   logSecurityEvent('cross_tenant_attempt', result);
 *   return { error: 'Accès non autorisé' };
 * }
 */
export const checkTeamAccess = (
  doc: { teamId?: string } | null | undefined,
  expectedTeamId: string | null | undefined
): AccessVerificationResult => {
  if (!doc) {
    return { valid: false, reason: 'Document inexistant' };
  }
  if (!doc.teamId) {
    return { valid: false, reason: 'Document sans teamId', docTeamId: undefined, expectedTeamId: expectedTeamId || undefined };
  }
  if (!expectedTeamId) {
    return { valid: false, reason: 'Équipe attendue non spécifiée', docTeamId: doc.teamId };
  }
  if (doc.teamId !== expectedTeamId) {
    return {
      valid: false,
      reason: 'Tentative d\'accès cross-tenant',
      docTeamId: doc.teamId,
      expectedTeamId,
    };
  }
  return { valid: true, docTeamId: doc.teamId, expectedTeamId };
};

// ============================================================
// 👑 PERMISSIONS ADMINISTRATEUR
// ============================================================

/**
 * Génère les permissions pour les documents système accessibles
 * par tous les utilisateurs authentifiés (ex: configuration globale).
 *
 * ⚠️ À utiliser avec parcimonie. Préférez toujours les permissions d'équipe.
 */
export const getAuthenticatedUsersPermissions = (): string[] => [
  Permission.read(Role.users()),
  Permission.update(Role.users()),
];

/**
 * Génère les permissions pour les documents en lecture seule
 * accessibles par tous les utilisateurs authentifiés.
 */
export const getPublicReadOnlyPermissions = (): string[] => [
  Permission.read(Role.users()),
];

/**
 * Génère les permissions pour les documents accessibles par n'importe qui
 * (lien public sans authentification).
 *
 * ⚠️ **TRÈS DANGEREUX** — À utiliser uniquement pour les documents
 * explicitement prévus pour être publics (factures client via token).
 */
export const getPublicPermissions = (): string[] => [
  Permission.read(Role.any()),
];

// ============================================================
// 🧪 HELPERS DE DEBUG (DEV ONLY)
// ============================================================

/**
 * Log les permissions générées pour faciliter le debug.
 * Actif uniquement en développement.
 *
 * @example
 * const perms = getTeamPermissions(appwriteTeamId, { isPublic: true });
 * debugPermissions(perms, 'Création facture publique');
 */
export const debugPermissions = (
  permissions: string[],
  context: string = 'unknown'
): void => {
  if (!import.meta.env.DEV) return;

  console.group(`🔐 [${context}] Permissions générées`);
  console.log(`Nombre : ${permissions.length}`);
  permissions.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.groupEnd();
};

/**
 * Vérifie si une permission spécifique est présente dans un tableau.
 * Utile pour les tests unitaires.
 */
export const hasPermission = (
  permissions: string[],
  permissionType: 'read' | 'update' | 'delete',
  role: string
): boolean => {
  const target =
    permissionType === 'read'
      ? Permission.read(Role.team(role))
      : permissionType === 'update'
      ? Permission.update(Role.team(role))
      : Permission.delete(Role.team(role));

  return permissions.includes(target);
};

// ============================================================
// 📊 STATISTIQUES (pour audit)
// ============================================================

/**
 * Compte le nombre de permissions dans un tableau par type.
 * Utile pour les audits de sécurité.
 */
export const analyzePermissions = (permissions: string[]): {
  total: number;
  read: number;
  update: number;
  delete: number;
  public: number;
  team: number;
} => {
  const analysis = {
    total: permissions.length,
    read: 0,
    update: 0,
    delete: 0,
    public: 0,
    team: 0,
  };

  permissions.forEach((p) => {
    if (p.includes('read("any")')) {
      analysis.public++;
    } else if (p.includes('read')) {
      analysis.read++;
      if (p.includes('team')) analysis.team++;
    } else if (p.includes('update')) {
      analysis.update++;
      if (p.includes('team')) analysis.team++;
    } else if (p.includes('delete')) {
      analysis.delete++;
      if (p.includes('team')) analysis.team++;
    }
  });

  return analysis;
};