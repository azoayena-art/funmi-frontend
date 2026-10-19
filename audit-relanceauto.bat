@echo off
setlocal
cd /d "C:\Users\LENOVO\relancepro\frontend"

set "OUT=audit-relanceauto.txt"

echo AUDIT STATIQUE RELANCEAUTO > "%OUT%"
echo Date : %DATE% %TIME% >> "%OUT%"
echo. >> "%OUT%"

echo ===== STRUCTURE DU PROJET ===== >> "%OUT%"
tree src /F /A >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== PACKAGE.JSON ===== >> "%OUT%"
if exist package.json (
  type package.json >> "%OUT%"
) else (
  echo package.json introuvable >> "%OUT%"
)

echo. >> "%OUT%"
echo ===== ROUTES ET NAVIGATION ===== >> "%OUT%"
findstr /S /N /I /C:"createBrowserRouter" /C:"BrowserRouter" /C:"Routes" /C:"Route" /C:"useNavigate" src\*.js src\*.jsx src\*.ts src\*.tsx >> "%OUT%" 2>nul

echo. >> "%OUT%"
echo ===== APPWRITE ET BASE DE DONNEES ===== >> "%OUT%"
findstr /S /N /I /C:"appwrite" /C:"createDocument" /C:"listDocuments" /C:"getDocument" /C:"updateDocument" /C:"deleteDocument" /C:"createExecution" /C:"Databases" /C:"Functions" src\*.js src\*.jsx src\*.ts src\*.tsx >> "%OUT%" 2>nul

echo. >> "%OUT%"
echo ===== AUTHENTIFICATION ET PERMISSIONS ===== >> "%OUT%"
findstr /S /N /I /C:"createAccount" /C:"createEmailPasswordSession" /C:"createSession" /C:"getCurrentUser" /C:"account.get" /C:"Permission" /C:"Role" /C:"teamId" /C:"companyId" src\*.js src\*.jsx src\*.ts src\*.tsx >> "%OUT%" 2>nul

echo. >> "%OUT%"
echo ===== FONCTIONNALITES ET ACTIONS ===== >> "%OUT%"
findstr /S /N /I /C:"relance" /C:"facture" /C:"echeance" /C:"paiement" /C:"email" /C:"notification" /C:"cron" /C:"schedule" /C:"webhook" /C:"export" /C:"import" /C:"onClick" /C:"onSubmit" src\*.js src\*.jsx src\*.ts src\*.tsx >> "%OUT%" 2>nul

echo. >> "%OUT%"
echo ===== FICHIERS DE CONFIGURATION (NOMS UNIQUEMENT) ===== >> "%OUT%"
dir /B /A-D >> "%OUT%" 2>nul

echo. >> "%OUT%"
echo ===== FIN DE L'AUDIT STATIQUE ===== >> "%OUT%"
echo.
echo Audit termine : %OUT%
echo Ce rapport ne contient pas le contenu complet des fichiers.
pause
