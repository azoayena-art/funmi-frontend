// 🔍 Audit de sécurité multi-tenant — Version Node.js (Windows/Mac/Linux)
// Usage: node scripts/security-audit.js

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');

// ❌ Patterns DANGEREUX
const DANGEROUS_PATTERNS = [
  { name: 'Role.users()', regex: /Role\.users\(\)/g },
  { name: 'Role.any()', regex: /Role\.any\(\)/g },
  { name: 'Permission.read(Role.users', regex: /Permission\.read\(Role\.users/g },
  { name: 'Permission.update(Role.users', regex: /Permission\.update\(Role\.users/g },
  { name: 'Permission.delete(Role.users', regex: /Permission\.delete\(Role\.users/g },
];

// ⚠️ Patterns à SURVEILLER
const WARNING_PATTERNS = [
  { name: 'user.secureTeamId (fallback)', regex: /user\?\.secureTeamId/g },
  { name: 'databases.createDocument sans perms', regex: /databases\.createDocument\([^)]+\)\s*[,;](?!\s*\[)/g },
];

// ✅ Patterns SÉCURISÉS
const SAFE_PATTERNS = [
  { name: 'Role.team(', regex: /Role\.team\(/g },
  { name: "Query.equal('teamId'", regex: /Query\.equal\(['"]teamId['"]/g },
  { name: 'verifyDocumentAccess', regex: /verifyDocumentAccess/g },
];

function scanFiles(dir, extensions = ['.ts', '.tsx']) {
  const results = [];
  
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const relativePath = path.relative(SRC_DIR, fullPath);
          results.push({ path: relativePath, content, fullPath });
        }
      }
    }
  }
  
  walk(dir);
  return results;
}

function findMatches(files, pattern) {
  const matches = [];
  
  for (const file of files) {
    const lines = file.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (pattern.regex.test(line)) {
        matches.push({
          file: file.path,
          line: i + 1,
          content: line.trim(),
          pattern: pattern.name
        });
      }
      pattern.regex.lastIndex = 0; // Reset regex state
    }
  }
  
  return matches;
}

// ═══════════════════════════════════════════════════════════════
// 🚀 EXÉCUTION
// ═══════════════════════════════════════════════════════════════

console.log('=========================================');
console.log('🛡️  AUDIT SÉCURITÉ MULTI-TENANT');
console.log('=========================================');
console.log('');

if (!fs.existsSync(SRC_DIR)) {
  console.error('❌ Dossier src/ introuvable. Lancez ce script depuis la racine du projet.');
  process.exit(1);
}

const files = scanFiles(SRC_DIR);
console.log(`📁 ${files.length} fichier(s) TypeScript/TSX analysé(s)\n`);

// ━━━ PATTERNS DANGEREUX ━━━
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('❌ PATTERNS DANGEREUX (doivent être ABSENTS)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

let totalDangerous = 0;

for (const pattern of DANGEROUS_PATTERNS) {
  const matches = findMatches(files, pattern);
  totalDangerous += matches.length;
  
  if (matches.length > 0) {
    console.log(`\n⛔ ${pattern.name} → ${matches.length} occurrence(s)`);
    matches.slice(0, 5).forEach(m => {
      console.log(`   📍 ${m.file}:${m.line}`);
      console.log(`      ${m.content.substring(0, 100)}`);
    });
    if (matches.length > 5) {
      console.log(`   ... et ${matches.length - 5} autre(s)`);
    }
  } else {
    console.log(`✅ ${pattern.name} → 0 (parfait)`);
  }
}

// ━━━ PATTERNS À SURVEILLER ━━━
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚠️  PATTERNS À SURVEILLER (revue manuelle)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

for (const pattern of WARNING_PATTERNS) {
  const matches = findMatches(files, pattern);
  if (matches.length > 0) {
    console.log(`⚠️  ${pattern.name} → ${matches.length} occurrence(s) à vérifier`);
  } else {
    console.log(`✅ ${pattern.name} → 0`);
  }
}

// ━━━ PATTERNS SÉCURISÉS ━━━
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ PATTERNS SÉCURISÉS (doivent être PRÉSENTS)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

for (const pattern of SAFE_PATTERNS) {
  const matches = findMatches(files, pattern);
  if (matches.length > 0) {
    console.log(`✅ ${pattern.name} → ${matches.length} occurrence(s)`);
  } else {
    console.log(`⛔ ${pattern.name} → AUCUNE (problème !)`);
  }
}

// ━━━ RÉSULTAT FINAL ━━━
console.log('\n=========================================');
if (totalDangerous === 0) {
  console.log('🎉 AUDIT RÉUSSI — Aucune faille détectée');
  console.log('=========================================');
  process.exit(0);
} else {
  console.log(`🚨 AUDIT ÉCHOUÉ — ${totalDangerous} faille(s) à corriger`);
  console.log('=========================================');
  process.exit(1);
}