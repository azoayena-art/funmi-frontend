// scripts/audit-security.js
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = './src';
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// 🔴 Patterns DANGEREUX (failles multi-tenant)
const DANGEROUS_PATTERNS = [
  {
    pattern: /Role\.users\(\)/g,
    severity: 'CRITIQUE',
    description: 'Role.users() = TOUS les utilisateurs authentifiés peuvent accéder',
    fix: 'Remplacer par Role.team(teamId) uniquement'
  },
  {
    pattern: /Role\.any\(\)/g,
    severity: 'CRITIQUE',
    description: 'Role.any() = ACCÈS PUBLIC (tout internet)',
    fix: 'Supprimer immédiatement'
  },
  {
    pattern: /Role\.guests\(\)/g,
    severity: 'HAUT',
    description: 'Role.guests() = utilisateurs non authentifiés',
    fix: 'Ne jamais utiliser pour des données sensibles'
  },
  {
    pattern: /user:\$\{[^}]+\}/g,
    severity: 'HAUT',
    description: 'Permission user:${id} = accès persistant après départ de l\'équipe',
    fix: 'Utiliser uniquement team:${teamId}'
  },
  {
    pattern: /`user:\$\{/g,
    severity: 'HAUT',
    description: 'Template literal user:${...} = même risque',
    fix: 'Retirer des permissions document'
  },
  {
    pattern: /"user:[^"]+"/g,
    severity: 'MOYEN',
    description: 'Permission user: littérale',
    fix: 'Vérifier si nécessaire'
  },
];

// ✅ Patterns SÉCURISÉS (à vérifier)
const SAFE_PATTERNS = [
  { pattern: /Role\.team\([^)]+\)/g, description: 'Permission team (correct)' },
  { pattern: /Query\.equal\(['"]teamId['"]/g, description: 'Filtrage par teamId (correct)' },
];

const results = {
  dangerous: [],
  safe: [],
  scannedFiles: 0,
  totalIssues: 0,
};

function scanFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Ignorer les commentaires
      const cleanLine = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');

      DANGEROUS_PATTERNS.forEach(({ pattern, severity, description, fix }) => {
        const matches = cleanLine.match(pattern);
        if (matches) {
          results.dangerous.push({
            file: filePath,
            line: index + 1,
            severity,
            description,
            fix,
            code: line.trim(),
            count: matches.length,
          });
          results.totalIssues += matches.length;
        }
      });

      SAFE_PATTERNS.forEach(({ pattern, description }) => {
        if (pattern.test(cleanLine)) {
          results.safe.push({
            file: filePath,
            line: index + 1,
            description,
            code: line.trim(),
          });
        }
      });
    });
  } catch (e) {
    console.error(`❌ Erreur lecture ${filePath}:`, e.message);
  }
}

function scanDir(dir) {
  try {
    const entries = readdirSync(dir);
    entries.forEach(entry => {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (entry !== 'node_modules' && !entry.startsWith('.')) {
            scanDir(fullPath);
          }
        } else if (EXTENSIONS.includes(extname(entry))) {
          results.scannedFiles++;
          scanFile(fullPath);
        }
      } catch {}
    });
  } catch (e) {
    console.error(`❌ Erreur scan ${dir}:`, e.message);
  }
}

// 🎨 Affichage
function printReport() {
  console.log('\n' + '═'.repeat(70));
  console.log('🛡️  RAPPORT D\'AUDIT SÉCURITÉ MULTI-TENANT');
  console.log('═'.repeat(70));
  console.log(`📁 Fichiers scannés : ${results.scannedFiles}`);
  console.log(`⚠️  Problèmes trouvés : ${results.totalIssues}`);
  console.log('═'.repeat(70));

  if (results.dangerous.length === 0) {
    console.log('\n✅ AUCUNE FAILLE DÉTECTÉE ! Votre code est sécurisé.');
    return;
  }

  // Grouper par sévérité
  const bySeverity = {
    CRITIQUE: results.dangerous.filter(r => r.severity === 'CRITIQUE'),
    HAUT: results.dangerous.filter(r => r.severity === 'HAUT'),
    MOYEN: results.dangerous.filter(r => r.severity === 'MOYEN'),
  };

  Object.entries(bySeverity).forEach(([severity, items]) => {
    if (items.length === 0) return;

    const icon = severity === 'CRITIQUE' ? '🔴' : severity === 'HAUT' ? '🟠' : '🟡';
    console.log(`\n${icon} ${severity} (${items.length} occurrence${items.length > 1 ? 's' : ''})`);
    console.log('─'.repeat(70));

    items.forEach(item => {
      console.log(`\n📄 ${item.file}:${item.line}`);
      console.log(`   ⚠️  ${item.description}`);
      console.log(`   💡 Fix : ${item.fix}`);
      console.log(`   📝 Code : ${item.code}`);
    });
  });

  console.log('\n' + '═'.repeat(70));
  console.log('📊 RÉSUMÉ DES BONNES PRATIQUES TROUVÉES');
  console.log('═'.repeat(70));
  
  const safeSummary = {};
  results.safe.forEach(s => {
    safeSummary[s.description] = (safeSummary[s.description] || 0) + 1;
  });
  Object.entries(safeSummary).forEach(([desc, count]) => {
    console.log(`  ✅ ${desc} : ${count} occurrence${count > 1 ? 's' : ''}`);
  });

  console.log('\n' + '═'.repeat(70));
  console.log('🎯 ACTIONS RECOMMANDÉES');
  console.log('═'.repeat(70));
  console.log('1. Corriger TOUS les problèmes CRITIQUES immédiatement');
  console.log('2. Remplacer Role.users()/Role.any() par Role.team(teamId)');
  console.log('3. Retirer les permissions user:${id} des documents');
  console.log('4. Vérifier que chaque requête filtre par teamId');
  console.log('5. Ré-exécuter cet audit après corrections');
  console.log('═'.repeat(70) + '\n');
}

// 🚀 Exécution
console.log('🔍 Scan du répertoire src/ en cours...\n');
scanDir(ROOT);
printReport();

// Code de sortie pour CI/CD
process.exit(results.dangerous.some(r => r.severity === 'CRITIQUE') ? 1 : 0);