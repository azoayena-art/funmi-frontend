const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = '6aacf8ec0010a7098203';
const DATABASE_ID = 'relancepro_db';
const COLLECTION_ID = 'account_mappings';
const API_KEY = 'COLLE_TA_CLE_API_ICI';

if (!API_KEY || API_KEY === 'standard_6beae62f8607169482d2bb7ff20f34a0f2a2100cfb30af418e28f4e11cc235fd6e3f10d393afeeb18686c9c24b7eeb09dce9adb2f608a0eb85a8195b5b38c4bb236000333b46f45e77bb2d462440d8aa1cabd613c6742c3dc302f0e90911daa4e7b696c89ce8e2c813d46ef0872e5a1d139e98ddf5ab3270dd58002df70c58a3') {
  console.error('Merci de coller ta cle API');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': PROJECT_ID,
  'X-Appwrite-Key': API_KEY
};

async function fixPermissions() {
  console.log('Correction des permissions de la collection...\n');

  try {
    // Mise à jour des permissions de la collection
    const res = await fetch(
      ENDPOINT + '/databases/' + DATABASE_ID + '/collections/' + COLLECTION_ID,
      {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify({
          name: 'Plan Comptable Personnalise',
          permissions: [
            'create("users")',
            'read("users")'
          ],
          documentSecurity: true
        })
      }
    );

    if (!res.ok) {
      const err = await res.json();
      console.error('Erreur: ' + err.message);
      process.exit(1);
    }

    console.log('Permissions mises a jour avec succes !\n');
    console.log('Permissions actuelles :');
    console.log('  - create(users)     -> Tout utilisateur authentifie peut creer');
    console.log('  - read(users)       -> Tout utilisateur authentifie peut lire');
    console.log('  - documentSecurity  -> Permissions fines par document (team)');
    console.log('\nRelancez votre application et reessayez !');

  } catch (error) {
    console.error('Erreur: ' + error.message);
    process.exit(1);
  }
}

fixPermissions();