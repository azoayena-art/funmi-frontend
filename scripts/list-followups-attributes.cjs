require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB = process.env.VITE_APPWRITE_DATABASE_ID;

(async () => {
  console.log('🔍 Attributs de la collection followups :\n');
  
  try {
    const res = await databases.listAttributes(DB, 'followups');
    
    console.log(`📋 ${res.attributes.length} attribut(s) trouvé(s) :\n`);
    
    const required = [];
    const optional = [];
    
    res.attributes.forEach(a => {
      const info = {
        key: a.key,
        type: a.type,
        required: a.required,
        default: a.default,
        status: a.status,
      };
      
      if (a.type === 'integer') {
        info.min = a.min;
        info.max = a.max;
      }
      if (a.type === 'string') {
        info.size = a.size;
      }
      if (a.type === 'datetime') {
        info.format = a.format;
      }
      
      if (a.required) {
        required.push(info);
      } else {
        optional.push(info);
      }
    });
    
    console.log('🔴 ATTRIBUTS OBLIGATOIRES (required=true) :');
    if (required.length === 0) {
      console.log('   (aucun)');
    } else {
      required.forEach(a => {
        console.log(`   - ${a.key} (${a.type}, status: ${a.status})`);
        if (a.default !== null && a.default !== undefined) {
          console.log(`     default: ${JSON.stringify(a.default)}`);
        }
      });
    }
    
    console.log('\n⚪ ATTRIBUTS OPTIONNELS :');
    if (optional.length === 0) {
      console.log('   (aucun)');
    } else {
      optional.forEach(a => {
        console.log(`   - ${a.key} (${a.type})`);
      });
    }
    
    console.log('\n✅ Copiez-collez la liste des attributs OBLIGATOIRES pour que je corrige le code définitivement.');
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
})();