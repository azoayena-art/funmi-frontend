// src/hooks/useSecureDatabase.ts
import { databases, DATABASE_ID } from '../appwrite';

/**
 * Hook utilitaire pour centraliser les appels à la base de données.
 * Il sert de point d'entrée unique pour faciliter l'ajout futur de logs, 
 * de vérifications de sécurité ou de gestion d'erreurs globales.
 */
export const useSecureDatabase = () => {
  return {
    updateDocument: async (_action: string, collectionId: string, documentId: string, data: any) => {
      return await databases.updateDocument(DATABASE_ID, collectionId, documentId, data);
    },
    
    createDocument: async (_action: string, collectionId: string, documentId: string, data: any, permissions?: string[]) => {
      return await databases.createDocument(DATABASE_ID, collectionId, documentId, data, permissions);
    },
    
    deleteDocument: async (_action: string, collectionId: string, documentId: string) => {
      return await databases.deleteDocument(DATABASE_ID, collectionId, documentId);
    },
  };
};