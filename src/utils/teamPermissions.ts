// src/utils/teamPermissions.ts
// ============================================================
// 🌉 PONT DE COMPATIBILITÉ
// ============================================================
// Ce fichier ne contient AUCUNE logique.
// Toute la logique sécurisée vit dans rowLevelPermissions.ts.
//
// Pourquoi ce pont existe ?
// - Certains composants importent depuis './teamPermissions'
// - D'autres importent depuis './rowLevelPermissions'
// - Ce pont garantit que TOUS utilisent la même logique sécurisée
//
// ⚠️ Ne JAMAIS ajouter de logique ici :
// - Risque de duplication → divergence → faille de sécurité
// - rowLevelPermissions.ts est la SOURCE UNIQUE de vérité
// ============================================================

export * from './rowLevelPermissions';