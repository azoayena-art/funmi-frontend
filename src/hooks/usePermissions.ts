import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTeam } from './useTeam';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';

// ============================================================
// 📋 PERMISSIONS GLOBALES DE L'APPLICATION
// ============================================================
const ALL_APP_PERMISSIONS: string[] = [
  'dashboard',
  'prospects.view', 'prospects.create', 'prospects.edit', 'prospects.delete', 'prospects.convert',
  'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
  'products.view', 'products.create', 'products.edit', 'products.delete', 'products.import',
  'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete', 'quotes.send', 'quotes.download', 'quotes.convert',
  'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete',
  'invoices.mark_paid', 'invoices.download', 'invoices.credit', 'invoices.reconcile', 'invoices.archive', 'invoices.einvoice',
  'received_invoices.view', 'received_invoices.import', 'received_invoices.download',
  'payments.view', 'payments.create', 'payments.export', 'payments.reconcile',
  'receipts.view', 'receipts.download', 'receipts.archive',
  'reminders.view', 'reminders.send', 'reminders.batch', 'reminders.history',
  'settings.view', 'settings.edit', 'settings.logo', 'settings.tva',
  'team.view', 'team.invite', 'team.manage_roles', 'team.remove_member', 'team.edit', 'team.members',
  'reports.view', 'reports.export', 'reports.audit',
  'billing.view', 'billing.manage',
];

// ============================================================
// 🗄️ CACHE MODULE-LEVEL : déduplication des requêtes simultanées
// ============================================================
// Ce cache est partagé entre TOUS les composants qui utilisent usePermissions.
// Quand 3 composants se montent en même temps, une SEULE requête est faite.
// Les 3 composants reçoivent le même résultat via la même Promise.

interface CacheEntry {
  promise: Promise<{ permissions: string[]; userRole: string }>;
  timestamp: number;
}

const permissionsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60 secondes - évite les re-requêtes lors de navigations rapides

// ============================================================
// 🔄 LOGIQUE DE CHARGEMENT (hors du hook pour être partagée)
// ============================================================
async function fetchPermissionsFromServer(
  userId: string,
  customTeamId: string
): Promise<{ permissions: string[]; userRole: string }> {
  console.log('🔍 usePermissions: Chargement serveur pour', { userId, customTeamId });

  // 1. Récupérer les rôles de l'équipe
  const rolesRes = await databases.listDocuments(DATABASE_ID, 'roles', [
    Query.equal('teamId', customTeamId)
  ]);

  const roles = rolesRes.documents.map(doc => ({
    $id: doc.$id,
    name: doc.name as string,
    permissions: doc.permissions as string,
    isDefault: doc.isDefault as boolean,
    teamId: doc.teamId as string
  }));

  console.log(`📋 ${roles.length} rôles trouvés`);

  // 2. Trouver le membre actif
  const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [
    Query.equal('teamId', customTeamId),
    Query.equal('userId', userId),
    Query.equal('status', 'active'),
    Query.limit(1)
  ]);

  let userPerms: string[] = [];
  let userRole = '';

  if (membersRes.documents.length > 0) {
    const member = membersRes.documents[0] as any;
    const role = roles.find(r => r.$id === member.roleId);

    if (role) {
      try {
        userPerms = JSON.parse(role.permissions || '[]');
        userRole = role.name;
        console.log(`✅ Rôle: ${role.name} (${userPerms.length} permissions)`);
      } catch (e) {
        console.error('Erreur parsing permissions du rôle:', e);
        userPerms = [];
      }
    } else {
      // Pas de rôle assigné, on prend le rôle par défaut
      const defaultRole = roles.find(r => r.isDefault);
      if (defaultRole) {
        try {
          userPerms = JSON.parse(defaultRole.permissions || '[]');
          userRole = defaultRole.name;
          console.log(`✅ Rôle par défaut: ${defaultRole.name} (${userPerms.length} permissions)`);
        } catch (e) {
          console.error('Erreur parsing rôle par défaut:', e);
        }
      }
    }
  } else {
    // Aucun membre actif : probablement le propriétaire (fallback)
    console.warn('⚠️ Aucun membre actif - fallback owner');
    userPerms = ALL_APP_PERMISSIONS;
    userRole = 'Propriétaire (fallback)';
  }

  // Fallback final si aucune permission trouvée
  if (userPerms.length === 0) {
    console.warn('⚠️ Aucune permission - fallback complet');
    userPerms = ALL_APP_PERMISSIONS;
    userRole = userRole || 'Fallback';
  }

  // Dédupliquer
  userPerms = [...new Set(userPerms)];
  console.log(`🔐 ${userPerms.length} permissions chargées`);

  return { permissions: userPerms, userRole };
}

/**
 * Récupère les permissions avec déduplication :
 * - Si une requête est déjà en cours pour ce couple userId:teamId, on la réutilise
 * - Si le cache est valide (< TTL), on retourne immédiatement
 * - Sinon, on lance une nouvelle requête
 */
async function getPermissionsDeduplicated(
  userId: string,
  customTeamId: string
): Promise<{ permissions: string[]; userRole: string }> {
  const cacheKey = `${userId}:${customTeamId}`;
  const now = Date.now();

  // ✅ Cache valide (TTL non expiré)
  const cached = permissionsCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    console.log(`🗄️ usePermissions: cache réutilisé pour ${cacheKey}`);
    return cached.promise;
  }

  // ✅ Nouvelle requête (ou remplacement d'un cache expiré)
  const promise = fetchPermissionsFromServer(userId, customTeamId).finally(() => {
    // Planifier le nettoyage après expiration pour éviter une fuite mémoire
    setTimeout(() => {
      const entry = permissionsCache.get(cacheKey);
      if (entry && entry.promise === promise) {
        permissionsCache.delete(cacheKey);
        console.log(`🧹 Cache nettoyé pour ${cacheKey}`);
      }
    }, CACHE_TTL_MS);
  });

  permissionsCache.set(cacheKey, { promise, timestamp: now });
  return promise;
}

/**
 * Invalide le cache pour forcer un rechargement (utile après modification de rôle)
 */
export function invalidatePermissionsCache(userId?: string, customTeamId?: string): void {
  if (userId && customTeamId) {
    const key = `${userId}:${customTeamId}`;
    permissionsCache.delete(key);
    console.log(`🔄 Cache invalidé pour ${key}`);
  } else {
    permissionsCache.clear();
    console.log('🔄 Cache complètement invalidé');
  }
}

// ============================================================
// 🎯 HOOK PRINCIPAL
// ============================================================
export function usePermissions() {
  const { user } = useAuth();
  const { customTeamId } = useTeam();

  const [permissions, setPermissions] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Ref pour tracker le mount (éviter setState après démontage)
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const userId = user?.$id || null;

    // ✅ CAS 1 : Pas d'utilisateur connecté
    if (!userId) {
      setPermissions([]);
      setUserRole('');
      setLoading(false);
      return;
    }

    // ✅ CAS 2 : Utilisateur connecté mais équipe pas encore chargée
    // On reste en loading pour éviter les redirections prématurées
    if (!customTeamId) {
      console.log('⏳ usePermissions: attente du customTeamId...');
      setLoading(true);
      return;
    }

    // ✅ CAS 3 : Chargement avec déduplication via le cache module-level
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const result = await getPermissionsDeduplicated(userId, customTeamId);

        // Vérifier que le composant est toujours monté
        if (cancelled || !mountedRef.current) {
          console.log('🚫 usePermissions: composant démonté, résultats ignorés');
          return;
        }

        setPermissions(result.permissions);
        setUserRole(result.userRole);
      } catch (error: any) {
        console.error('❌ Erreur usePermissions:', error);
        if (!cancelled && mountedRef.current) {
          setPermissions(ALL_APP_PERMISSIONS);
          setUserRole('Erreur');
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [user?.$id, customTeamId]);

  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  const hasAnyPermission = (perms: string[]): boolean => {
    return perms.some(p => permissions.includes(p));
  };

  const hasAllPermissions = (perms: string[]): boolean => {
    return perms.every(p => permissions.includes(p));
  };

  return {
    permissions,
    userRole,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    loading
  };
}