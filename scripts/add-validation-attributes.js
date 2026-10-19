import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID = 'expense_justifications';

async function addValidationAttributes() {
  console.log('🚀 Ajout des attributs de validation...\n');

  // 1. validationStatus (string avec valeurs possibles)
  try {
    await databases.createEnumAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'validationStatus',
      ['pending', 'validated', 'rejected'],
      false,           // non requis
      'pending'        // valeur par défaut
    );
    console.log('✅ validationStatus créé (enum: pending, validated, rejected)');
  } catch (e) {
    if (e.message?.includes('already exists')) {
      console.log('ℹ️  validationStatus existe déjà');
    } else {
      console.log('❌ Erreur validationStatus:', e.message);
    }
  }
  await new Promise(r => setTimeout(r, 800));

  // 2. validatedBy (string - ID utilisateur)
  try {
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'validatedBy',
      100,             // taille max
      false,           // non requis
      null             // pas de défaut
    );
    console.log('✅ validatedBy créé (string, 100 chars)');
  } catch (e) {
    if (e.message?.includes('already exists')) {
      console.log('ℹ️  validatedBy existe déjà');
    } else {
      console.log('❌ Erreur validatedBy:', e.message);
    }
  }
  await new Promise(r => setTimeout(r, 800));

  // 3. validatedAt (datetime)
  try {
    await databases.createDatetimeAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'validatedAt',
      false,           // non requis
      null             // pas de défaut
    );
    console.log('✅ validatedAt créé (datetime)');
  } catch (e) {
    if (e.message?.includes('already exists')) {
      console.log('ℹ️  validatedAt existe déjà');
    } else {
      console.log('❌ Erreur validatedAt:', e.message);
    }
  }
  await new Promise(r => setTimeout(r, 800));

  // 4. rejectionReason (string - motif de rejet)
  try {
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'rejectionReason',
      500,             // taille max (motif détaillé)
      false,           // non requis
      ''               // chaîne vide par défaut
    );
    console.log('✅ rejectionReason créé (string, 500 chars)');
  } catch (e) {
    if (e.message?.includes('already exists')) {
      console.log('ℹ️  rejectionReason existe déjà');
    } else {
      console.log('❌ Erreur rejectionReason:', e.message);
    }
  }
  await new Promise(r => setTimeout(r, 800));

  // 5. Index pour filtrer par statut (optionnel mais recommandé)
  try {
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      'idx_validation_status',
      'key',
      ['teamId', 'validationStatus'],
      ['ASC', 'ASC']
    );
    console.log('✅ Index idx_validation_status créé');
  } catch (e) {
    if (e.message?.includes('already exists')) {
      console.log('ℹ️  Index existe déjà');
    } else {
      console.log('❌ Erreur index:', e.message);
    }
  }

  console.log('\n🎉 Configuration terminée !');
}

addValidationAttributes().catch(console.error);