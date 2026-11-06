// src/services/auditService.ts
import { databases, DATABASE_ID } from '../appwrite';
import { ID, Permission, Role } from 'appwrite';

export type AuditSeverity = 'info' | 'warning' | 'critical';

/**
 * Enregistre une action dans les journaux d'audit (audit logs).
 * 
 * @param appwriteTeamId - L'ID de l'équipe Appwrite concernée
 * @param userId - L'ID de l'utilisateur qui a effectué l'action
 * @param action - Le nom de l'action (ex: 'export_fec', 'update_mapping')
 * @param resourceType - Le type de ressource concernée (ex: 'account_mapping', 'invoice')
 * @param resourceId - (Optionnel) L'ID spécifique de la ressource
 * @param details - (Optionnel) Détails supplémentaires de l'action (objet ou chaîne)
 * @param severity - (Optionnel) Niveau de sévérité ('info', 'warning', 'critical'). Par défaut: 'info'
 */
export const logAuditAction = async (
  appwriteTeamId: string,
  userId: string,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, any> | string,
  severity: AuditSeverity = 'info'
) => {
  try {
    // Détermination intelligente de la sévérité si non fournie explicitement
    const determinedSeverity: AuditSeverity = 
      severity !== 'info' ? severity : 
      (action.includes('delete') || action.includes('export') || action.includes('reset') ? 'critical' : 'info');

    // Sécurisation de la sérialisation des détails
    const stringifiedDetails = typeof details === 'string' 
      ? details 
      : (details ? JSON.stringify(details) : '');

    await databases.createDocument(
      DATABASE_ID,
      'audit_logs', // ✅ Nom exact de la collection
      ID.unique(),
      {
        teamId: appwriteTeamId,
        userId,
        action,
        resourceType,
        resourceId: resourceId || '',
        details: stringifiedDetails,
        severity: determinedSeverity
      },
      [
        // L'utilisateur authentifié peut créer le log (déclenché par son action)
        Permission.create(Role.users()),
        // Seuls les membres de l'équipe peuvent lire les logs de leur équipe
        Permission.read(Role.team(appwriteTeamId)),
      ]
    );
  } catch (error) {
    // On log l'erreur sans bloquer le flux principal de l'application
    console.error(`[Audit Log] Échec de l'écriture du log pour l'action '${action}':`, error);
  }
};