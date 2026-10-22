// ⚠️ VERSION AMÉLIORÉE : mapping dynamique userId → teamId
import { Client, Databases, Query, Permission, Role } from 'node-appwrite';

export default async ({ req, res, log, error }) {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const DATABASE_ID = 'REMPLACEZ_PAR_VOTRE_DATABASE_ID';

  // ✅ Vos IDs d'équipe (récupérés depuis les logs)
  const DEFAULT_CUSTOM_TEAM_ID = '6ac4c02c00293611f4a1';
  const DEFAULT_APPWRITE_TEAM_ID = '6ac4c02c0007d55b5a10';

  const collections = [
    'reminders', 'clients', 'prospects', 'quotes', 'invoices',
    'received_invoices', 'payments', 'bank_transactions',
    'company_settings', 'einvoice_settings', 'expense_justifications'
  ];

  const stats = {
    totalScanned: 0,
    teamIdAdded: 0,
    permissionsFixed: 0,
    alreadyOk: 0,
    errors: 0,
    details: []
  };

  for (const collectionId of collections) {
    log(`📂 Migration de ${collectionId}...`);

    try {
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await databases.listDocuments(
          DATABASE_ID,
          collectionId,
          [Query.limit(limit), Query.offset(offset)]
        );

        for (const doc of response.documents) {
          stats.totalScanned++;

          try {
            // ─── CAS 1 : Document sans teamId ───
            if (!doc.teamId) {
              await databases.updateDocument(
                DATABASE_ID,
                collectionId,
                doc.$id,
                { teamId: DEFAULT_CUSTOM_TEAM_ID },
                [
                  Permission.read(Role.team(DEFAULT_APPWRITE_TEAM_ID)),
                  Permission.update(Role.team(DEFAULT_APPWRITE_TEAM_ID)),
                  Permission.delete(Role.team(DEFAULT_APPWRITE_TEAM_ID))
                ]
              );
              stats.teamIdAdded++;
              log(`✅ ${collectionId}/${doc.$id} : teamId ajouté`);
              continue;
            }

            // ─── CAS 2 : Vérifier les permissions ───
            const perms = doc.$permissions || [];
            const hasTeamRead = perms.some(p =>
              p.includes(`team(${DEFAULT_APPWRITE_TEAM_ID})`) ||
              p === `read("team:${DEFAULT_APPWRITE_TEAM_ID}")`
            );

            if (!hasTeamRead) {
              await databases.updateDocument(
                DATABASE_ID,
                collectionId,
                doc.$id,
                {}, // Pas de modif des données, juste permissions
                [
                  Permission.read(Role.team(DEFAULT_APPWRITE_TEAM_ID)),
                  Permission.update(Role.team(DEFAULT_APPWRITE_TEAM_ID)),
                  Permission.delete(Role.team(DEFAULT_APPWRITE_TEAM_ID))
                ]
              );
              stats.permissionsFixed++;
              log(`🔐 ${collectionId}/${doc.$id} : permissions corrigées`);
            } else {
              stats.alreadyOk++;
            }
          } catch (err) {
            stats.errors++;
            error(`❌ ${collectionId}/${doc.$id} : ${err.message}`);
          }
        }

        hasMore = response.documents.length === limit;
        offset += limit;
      }
    } catch (err) {
      error(`❌ Collection ${collectionId} : ${err.message}`);
      stats.errors++;
    }
  }

  log('🎉 Migration terminée !');
  log(JSON.stringify(stats, null, 2));

  return res.json({
    success: true,
    stats,
    message: `${stats.teamIdAdded} teamId ajoutés, ${stats.permissionsFixed} permissions corrigées, ${stats.errors} erreurs`
  });
};