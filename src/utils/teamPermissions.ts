import { databases, DATABASE_ID } from '../appwrite';
import { Permission, Role, Query } from 'appwrite';

/**
 * Génère les permissions pour un document multi-tenant.
 * Donne l'accès à l'utilisateur ET aux autres membres de son équipe.
 */
export async function getTeamDocumentPermissions(
  currentUserId: string,
  teamId: string
): Promise<string[]> {
  const perms: string[] = [
    // Le créateur a tous les droits
    Permission.read(Role.user(currentUserId)),
    Permission.update(Role.user(currentUserId)),
    Permission.delete(Role.user(currentUserId)),
  ];

  try {
    // Récupère TOUS les membres de l'équipe
    const membersRes = await databases.listDocuments(
      DATABASE_ID,
      'team_members',
      [
        Query.equal('teamId', teamId),
        Query.limit(100)
      ]
    );

    // Ajoute les permissions de lecture pour chaque membre
    membersRes.documents.forEach((member: any) => {
      if (member.userId !== currentUserId) {
        perms.push(Permission.read(Role.user(member.userId)));
        
        // Les admins peuvent aussi modifier
        if (member.role === 'admin') {
          perms.push(
            Permission.update(Role.user(member.userId)),
            Permission.delete(Role.user(member.userId))
          );
        }
      }
    });
  } catch (e) {
    console.warn('⚠️ Impossible de charger les membres de l\'équipe:', e);
    // Fallback : au moins le créateur a accès
  }

  return perms;
}

/**
 * Vérifie qu'un utilisateur a bien accès à un document
 * en vérifiant que le teamId du document correspond à son équipe
 */
export async function verifyDocumentAccess(
  collectionName: string,
  documentId: string,
  currentTeamId: string
): Promise<boolean> {
  try {
    const doc = await databases.getDocument(
      DATABASE_ID,
      collectionName,
      documentId
    );
    return doc.teamId === currentTeamId;
  } catch (e) {
    return false;
  }
}