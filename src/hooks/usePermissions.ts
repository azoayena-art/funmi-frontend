// src/hooks/usePermissions.ts
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';

export function usePermissions() {
  const { user } = useAuth();
  const { customTeamId, loading: teamLoading } = useTeam();

  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // On attend juste que l'équipe soit chargée pour éviter les boucles
    if (teamLoading) {
      setLoading(true);
    } else {
      setLoading(false);
    }
  }, [teamLoading]);

  // 🚨 ÉTAT NEUTRE : Pour l'instant, on autorise tout.
  // Ce sera ici que nous appellerons ta NOUVELLE fonction Appwrite.
  const hasPermission = useCallback(
    (permission: string): boolean => {
      // TODO: Remplacer par l'appel à la fonction Appwrite "check-permission"
      // Exemple futur: return await checkAppwritePermission(user, customTeamId, permission);
      return true; 
    },
    [user?.$id, customTeamId]
  );

  const hasAnyPermission = useCallback(
    (perms: string[]): boolean => {
      if (perms.length === 0) return true;
      return perms.some(p => hasPermission(p));
    },
    [hasPermission]
  );

  const hasAllPermissions = useCallback(
    (perms: string[]): boolean => {
      return perms.every(p => hasPermission(p));
    },
    [hasPermission]
  );

  return {
    permissions: ['*'], // Indique que tout est accessible en mode neutre
    userRole: 'En attente de configuration Appwrite',
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    loading
  };
}