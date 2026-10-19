// src/utils/cleanupOrphanJustifications.ts
import { databases, storage, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';

export async function cleanupOrphanJustifications(teamId: string): Promise<{
  checked: number;
  orphans: number;
  deleted: number;
}> {
  const result = { checked: 0, orphans: 0, deleted: 0 };
  
  try {
    // Récupérer tous les justificatifs de l'équipe
    const res = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
      Query.equal('teamId', teamId),
      Query.limit(500),
    ]);
    
    result.checked = res.documents.length;
    
    for (const doc of res.documents) {
      const bucketId = (doc as any).bucketId || 'justificatifs';
      const fileId = (doc as any).fileId;
      
      if (!fileId) continue;
      
      try {
        // Vérifier si le fichier existe
        await storage.getFile(bucketId, fileId);
      } catch (error: any) {
        if (error.code === 404) {
          result.orphans++;
          console.warn(`🗑️ Justificatif orphelin détecté: ${doc.$id} (${(doc as any).fileName})`);
          
          // Supprimer le document orphelin
          try {
            await databases.deleteDocument(DATABASE_ID, 'expense_justifications', doc.$id);
            result.deleted++;
            console.log(`✅ Document orphelin supprimé: ${doc.$id}`);
          } catch (deleteError) {
            console.error(`❌ Erreur suppression document:`, deleteError);
          }
        }
      }
    }
    
    return result;
  } catch (error: any) {
    console.error('Erreur nettoyage:', error);
    return result;
  }
}