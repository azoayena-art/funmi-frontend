// src/utils/auditLogger.ts
import { databases, DATABASE_ID } from '../appwrite';
import { ID, Permission, Role } from 'appwrite';

export const logAuditAction = async (params: {
  teamId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  severity?: 'info' | 'warning' | 'critical';
  details?: any;
  ipAddress?: string;
}) => {
  try {
    // On prépare les données
    const logData = {
      teamId: params.teamId,
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId || null,
      severity: params.severity || 'info',
      details: params.details ? JSON.stringify(params.details) : null,
      ipAddress: params.ipAddress || 'N/A',
      $permissions: [
        Permission.read(Role.team(params.teamId)), // Seul l'équipe peut lire
        // PAS de Permission.update ou Permission.delete pour garantir l'infalsifiabilité (append-only)
      ]
    };

    // On enregistre dans la collection 'audit_logs'
    await databases.createDocument(
      DATABASE_ID,
      'audit_logs',
      ID.unique(),
      logData
    );
  } catch (error) {
    // On console.error mais on ne bloque pas l'action principale de l'utilisateur
    console.warn('Échec de l\'enregistrement du log d\'audit:', error);
  }
};