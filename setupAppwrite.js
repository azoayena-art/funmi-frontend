async function createAttr(db, col, type, key, ...args) {
  try {
    await attributeTypes[type](db, col, key, ...args);
    console.log(`✅ ${col}.${key} (${type})`);
  } catch (e) {
    if (e.code === 409) {
      console.log(`⏭️  ${col}.${key} existe déjà`);
    } else if (e.message?.includes('maximum number')) {
      console.error(`🚨 LIMITE ATTEINTE sur ${col} : augmentez _APP_COLLECTION_LIMIT`);
      console.error(`   Attribut manquant : ${key}`);
    } else {
      console.error(`❌ ${col}.${key}:`, e.message);
    }
  }
}