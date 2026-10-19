import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTeam } from './useTeam';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';

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

export function usePermissions() {
  const { user } = useAuth();
  const { customTeamId } = useTeam();

  const [permissions, setPermissions] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // ✅ Refs anti-boucle
  const lastLoadedKeyRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    const userId = user?.$id || null;

    // ✅ CAS 1 : Pas d'utilisateur connecté
    // → on débloque immédiatement avec permissions vides (cas normal : utilisateur déconnecté)
    if (!userId) {
      setPermissions([]);
      setUserRole('');
      setLoading(false);
      lastLoadedKeyRef.current = null;
      isLoadingRef.current = false;
      return;
    }

    // ✅ CAS 2 : Utilisateur connecté mais équipe pas encore chargée
    // → CRITIQUE : on RESTE en loading (true) pour éviter que les pages
    //   croient qu'il n'y a "aucune permission" et redirigent vers /dashboard
    if (!customTeamId) {
      console.log('⏳ usePermissions: attente du customTeamId (utilisateur connecté)...');
      setLoading(true);
      return;
    }

    const loadKey = `${userId}:${customTeamId}`;

    // ✅ Anti-boucle 1 : même clé = pas de rechargement
    if (loadKey === lastLoadedKeyRef.current) {
      return;
    }

    // ✅ Anti-boucle 2 : déjà en cours
    if (isLoadingRef.current) {
      return;
    }

    // Marquer immédiatement pour éviter les re-triggers
    lastLoadedKeyRef.current = loadKey;
    isLoadingRef.current = true;

    const loadPermissions = async () => {
      try {
        setLoading(true);
        console.log('🔍 usePermissions: Chargement pour', { userId, customTeamId });

        // 1. Récupérer les rôles
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

        // 2. Trouver le member
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [
          Query.equal('teamId', customTeamId),
          Query.equal('userId', userId),
          Query.equal('status', 'active'),
          Query.limit(1)
        ]);

        let userPerms: string[] = [];

        if (membersRes.documents.length > 0) {
          const member = membersRes.documents[0] as any;
          const role = roles.find(r => r.$id === member.roleId);

          if (role) {
            try {
              userPerms = JSON.parse(role.permissions || '[]');
              setUserRole(role.name);
              console.log(`✅ Rôle: ${role.name} (${userPerms.length} permissions)`);
            } catch (e) {
              userPerms = [];
            }
          } else {
            const defaultRole = roles.find(r => r.isDefault);
            if (defaultRole) {
              try {
                userPerms = JSON.parse(defaultRole.permissions || '[]');
                setUserRole(defaultRole.name);
              } catch (e) {
                console.error('Erreur parsing rôle par défaut:', e);
              }
            }
          }
        } else {
          console.warn('⚠️ Aucun membre actif - fallback owner');
          userPerms = ALL_APP_PERMISSIONS;
          setUserRole('Propriétaire (fallback)');
        }

        if (userPerms.length === 0) {
          userPerms = ALL_APP_PERMISSIONS;
          setUserRole('Fallback');
        }

        userPerms = [...new Set(userPerms)];
        setPermissions(userPerms);
        console.log(`🔐 ${userPerms.length} permissions chargées`);

      } catch (error: any) {
        console.error('❌ Erreur usePermissions:', error);
        setPermissions(ALL_APP_PERMISSIONS);
        setUserRole('Erreur');
      } finally {
        setLoading(false);
        isLoadingRef.current = false;
      }
    };

    loadPermissions();
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