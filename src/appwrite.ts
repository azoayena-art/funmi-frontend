import { Client, Databases, Storage, Account, Teams, Functions } from 'appwrite';

// ============================================================
// 🔧 CONFIGURATION APPWRITE
// ============================================================

// Validation des variables d'environnement critiques
const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT;
const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;

if (!APPWRITE_ENDPOINT) {
  console.warn('⚠️ VITE_APPWRITE_ENDPOINT non défini, utilisation du fallback');
}

if (!APPWRITE_PROJECT_ID) {
  console.warn('⚠️ VITE_APPWRITE_PROJECT_ID non défini, utilisation du fallback');
}

export const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203');

// ============================================================
// 📦 EXPORTS DES IDs
// ============================================================

export const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';
export const BUCKET_ID = import.meta.env.VITE_APPWRITE_BUCKET_ID || 'company_logos';

// ============================================================
// 🔌 INSTANCES DES SERVICES (Singleton)
// ============================================================

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const teams = new Teams(client);           // ✅ AJOUTÉ
export const functions = new Functions(client);   // ✅ AJOUTÉ (pour JoinTeam.tsx)

export default client;