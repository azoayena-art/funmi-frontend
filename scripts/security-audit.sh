#!/bin/bash
# 🔍 Audit de sécurité multi-tenant — Détection des patterns dangereux
# Usage: bash scripts/security-audit.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "🛡️  AUDIT SÉCURITÉ MULTI-TENANT"
echo "========================================="
echo ""

# ❌ Patterns DANGEREUX (doivent retourner 0 résultat)
DANGEROUS_PATTERNS=(
  "Role\.users()"
  "Role\.any()"
  "Permission\.read\(Role\.users"
  "Permission\.update\(Role\.users"
  "Permission\.delete\(Role\.users"
)

# ⚠️ Patterns à SURVEILLER (requièrent une revue manuelle)
WARNING_PATTERNS=(
  "user\.secureTeamId"
  "databases\.listDocuments.*\[.*\]"  # sans Query.equal('teamId'
  "databases\.createDocument.*\[\]"   # sans permissions explicites
)

# ✅ Patterns SÉCURISÉS (doivent être présents)
SAFE_PATTERNS=(
  "Role\.team("
  "Query\.equal\('teamId'"
  "verifyDocumentAccess"
)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "❌ PATTERNS DANGEREUX (doivent être ABSENTS)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

total_dangerous=0
for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  count=$(grep -r "$pattern" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l)
  total_dangerous=$((total_dangerous + count))
  if [ "$count" -gt 0 ]; then
    echo -e "${RED}⛔ $pattern → $count occurrence(s)${NC}"
    grep -rn "$pattern" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -5
    echo ""
  else
    echo -e "${GREEN}✅ $pattern → 0 (parfait)${NC}"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  PATTERNS À SURVEILLER (revue manuelle)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for pattern in "${WARNING_PATTERNS[@]}"; do
  count=$(grep -rE "$pattern" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  $pattern → $count occurrence(s) à vérifier${NC}"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ PATTERNS SÉCURISÉS (doivent être PRÉSENTS)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for pattern in "${SAFE_PATTERNS[@]}"; do
  count=$(grep -rE "$pattern" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ]; then
    echo -e "${GREEN}✅ $pattern → $count occurrence(s)${NC}"
  else
    echo -e "${RED}⛔ $pattern → AUCUNE (problème !)${NC}"
  fi
done

echo ""
echo "========================================="
if [ "$total_dangerous" -eq 0 ]; then
  echo -e "${GREEN}🎉 AUDIT RÉUSSI — Aucune faille détectée${NC}"
else
  echo -e "${RED}🚨 AUDIT ÉCHOUÉ — $total_dangerous faille(s) à corriger${NC}"
  exit 1
fi