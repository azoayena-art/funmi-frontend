\# Configuration Appwrite — RelancePro



\## Identifiants

\- Endpoint : https://fra.cloud.appwrite.io/v1

\- Project ID : (voir .env VITE\_APPWRITE\_PROJECT\_ID)

\- Database ID : relancepro\_db (VITE\_APPWRITE\_DATABASE\_ID)



\## Buckets Storage — RÈGLE D'OR

File Security = \*\*OFF\*\* sur tous les buckets.

Permissions de chaque bucket :

| Bucket | Any | Users | Team |

|---|---|---|---|

| justifications | Read | Read+Create | All |

| documents | Read | Read+Create | All |

| expense-receipts | Read | Read+Create | All |

| company\_logos | Read | Read+Create | All |



⚠️ Le bucket n'autorise PAS le rôle `users` en lecture de fichier

individuel → toujours uploader les fichiers avec :

&#x20; Permission.read(Role.any())

&#x20; Permission.update(Role.team(appwriteTeamId))

&#x20; Permission.delete(Role.team(appwriteTeamId))

Jamais Role.users() sur un fichier (erreur 401 "scopes allowed").



\## Lecture des fichiers côté UI

\- PDF / affichage : storage.getFileView(bucket, fileId)

\- Téléchargement : storage.getFileDownload(bucket, fileId)

\- Jamais getFilePreview() pour un PDF (page vide).

\- Fallback multi-buckets : BUCKET\_CANDIDATES dans utils/storage.ts



\## RLS (Row-Level Security)

\- Source unique : utils/rowLevelPermissions.ts → getTeamPermissions(appwriteTeamId)

\- ⚠️ Toujours `appwriteTeamId` (ID natif Appwrite), JAMAIS `customTeamId`

&#x20; pour les permissions ; `customTeamId` pour les champs teamId des documents.

\- Vérification d'accès : verifyTeamAccess / verifyTeamAccessStrict



\## Scripts de maintenance (dossier /scripts)

| Script | Rôle | Quand l'utiliser |

|---|---|---|

| setup-justifications.js | Crée collection expense\_justifications | 1re installation |

| check-bucket-permissions.mjs | Diagnose permissions d'un bucket | Erreur 401 storage |

| fix-all-file-permissions.mjs | Repasse les fichiers en read("any") | Après changement de config bucket |

| fix-documents-bucket.mjs | Répare fichiers du bucket documents | Erreurs 401 factures reçues |

| purge-all-orphans.mjs | Supprime entrées DB sans fichier | Fichiers "introuvables" dans l'UI |



\## Collections principales

teams, team\_members, roles, users, company\_settings, einvoice\_settings,

quotes, invoices, invoice\_metadata, invoice\_payments, receipts,

clients, prospects, products, categories, received\_invoices,

expense\_justifications, supplier\_payments, payments, followups,

accounting\_events, einvoice\_events, account\_mappings, audit\_logs

