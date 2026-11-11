# add-limits-final.ps1
# Ajoute le hook usePlanAccess + la verification de limite dans handleOpenAdd

function Update-CrmFile {
    param(
        [string]$FilePath,
        [string]$CheckBlock
    )

    if (-not (Test-Path $FilePath)) {
        Write-Host "[ERROR] Fichier non trouve: $FilePath" -ForegroundColor Red
        return
    }

    $lines = [System.IO.File]::ReadAllLines($FilePath)
    $out = New-Object System.Collections.Generic.List[string]

    $hasHookCall = @($lines | Where-Object { $_ -match "usePlanAccess\(\)" }).Count -gt 0
    $hasImport   = @($lines | Where-Object { $_ -match "import \{ usePlanAccess \}" }).Count -gt 0
    $hasCheck    = @($lines | Where-Object { $_ -match "\[PLAN-LIMIT\]" }).Count -gt 0

    $importAdded = $false
    $hookAdded = $false
    $checkAdded = $false

    foreach ($line in $lines) {
        $out.Add($line)
        $trim = $line.Trim()
        $indent = ""
        if ($line -match "^(\s*)") { $indent = $Matches[1] }

        # 1. Ajouter l'import (si absent)
        if (-not $hasImport -and -not $importAdded -and $trim -eq "import { useTeam } from '../context/TeamContext';") {
            $out.Add("import { usePlanAccess } from '../hooks/usePlanAccess';")
            $importAdded = $true
        }

        # 2. Ajouter le hook juste apres useTeam()
        if (-not $hasHookCall -and -not $hookAdded -and $trim -like "*= useTeam();*") {
            $out.Add($indent + "const { limits, isUnlimited } = usePlanAccess();")
            $hookAdded = $true
        }

        # 3. Ajouter la verification au debut de handleOpenAdd
        if (-not $hasCheck -and -not $checkAdded -and $trim -like "const handleOpenAdd =*{") {
            foreach ($blockLine in ($CheckBlock -split "`n")) {
                $out.Add($indent + "  " + $blockLine)
            }
            $checkAdded = $true
        }
    }

    [System.IO.File]::WriteAllLines($FilePath, $out, (New-Object System.Text.UTF8Encoding $false))

    $imp = $(if ($hasImport -or $importAdded) { "OK" } else { "MANQUANT" })
    $hk  = $(if ($hasHookCall -or $hookAdded) { "OK" } else { "MANQUANT" })
    $ck  = $(if ($hasCheck -or $checkAdded) { "OK" } else { "MANQUANT" })

    Write-Host "[FILE] $FilePath" -ForegroundColor Green
    Write-Host ("   import: {0} | hook: {1} | check: {2}" -f $imp, $hk, $ck) -ForegroundColor Cyan
}

# ---- Bloc de verification PROSPECTS ----
$prospectsCheck = @'
// [PLAN-LIMIT] Verification de la limite du plan avant creation
if (!isUnlimited(limits.maxProspects) && prospects.length >= limits.maxProspects) {
  toast.error(`Limite de ${limits.maxProspects} prospects atteinte sur votre plan. Passez au plan superieur.`);
  navigate('/pricing');
  return;
}
'@

# ---- Bloc de verification DEVIS ----
$quotesCheck = @'
// [PLAN-LIMIT] Verification de la limite du plan avant creation
if (!isUnlimited(limits.maxQuotes) && quotes.length >= limits.maxQuotes) {
  toast.error(`Limite de ${limits.maxQuotes} devis atteinte sur votre plan. Passez au plan superieur.`);
  navigate('/pricing');
  return;
}
'@

# ---- Bloc de verification FACTURES (limite mensuelle) ----
$invoicesCheck = @'
// [PLAN-LIMIT] Verification de la limite mensuelle du plan avant creation
const nowDate = new Date();
const firstDayOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
const invoicesThisMonth = invoices.filter((inv: any) => new Date(inv.issueDate || inv.$createdAt) >= firstDayOfMonth);
if (!isUnlimited(limits.maxInvoicesPerMonth) && invoicesThisMonth.length >= limits.maxInvoicesPerMonth) {
  toast.error(`Limite de ${limits.maxInvoicesPerMonth} factures par mois atteinte sur votre plan. Passez au plan superieur.`);
  navigate('/pricing');
  return;
}
'@

Write-Host "[START] Application des limites..." -ForegroundColor Cyan
Write-Host ""

Update-CrmFile -FilePath "src/pages/Prospects.tsx" -CheckBlock $prospectsCheck
Update-CrmFile -FilePath "src/pages/Quotes.tsx"    -CheckBlock $quotesCheck
Update-CrmFile -FilePath "src/pages/Invoices.tsx"  -CheckBlock $invoicesCheck

Write-Host ""
Write-Host "[END] Termine. Verifie que toast et navigate sont bien importes dans chaque fichier." -ForegroundColor Green