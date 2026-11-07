import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
// ✅ 1. AJOUT DE "Query" DANS L'IMPORT
import { Client, Account, Databases, Query } from 'appwrite';
import type { ReactNode } from 'react';

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io')
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || '');

const account = new Account(client);
const databases = new Databases(client);
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

interface SuperAdminRouteProps {
  children: ReactNode;
}

export default function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await account.get();
        
        // ✅ 2. UTILISATION DE Query.equal AU LIEU DE LA CHAÎNE BRUTE
        const response = await databases.listDocuments(
          DATABASE_ID,
          'super_admins',
          [Query.equal('userId', user.$id)] 
        );

        if (response.documents.length > 0) {
          setIsAuthorized(true);
        } else {
          setIsAuthorized(false);
        }
      } catch (error) {
        console.error("Erreur de vérification admin:", error);
        setIsAuthorized(false);
      }
    };

    checkAdmin();
  }, []);

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Vérification des droits d'administration...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}