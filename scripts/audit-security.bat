@echo off
chcp 65001 >nul
echo =========================================
echo   AUDIT SECURITE MULTI-TENANT
echo =========================================
echo.

set "FOUND=0"

echo -----------------------------------------
echo [1/3] Recherche de Role.users() ...
echo -----------------------------------------
findstr /S /M /C:"Role.users()" src\*.ts src\*.tsx 2>nul
if %errorlevel%==0 (
    echo [FAIL] Role.users() detecte !
    set "FOUND=1"
) else (
    echo [OK] Aucun Role.users() trouve
)
echo.

echo -----------------------------------------
echo [2/3] Recherche de Role.any() ...
echo -----------------------------------------
findstr /S /M /C:"Role.any()" src\*.ts src\*.tsx 2>nul
if %errorlevel%==0 (
    echo [FAIL] Role.any() detecte !
    set "FOUND=1"
) else (
    echo [OK] Aucun Role.any() trouve
)
echo.

echo -----------------------------------------
echo [3/3] Verification Role.team() present ...
echo -----------------------------------------
findstr /S /M /C:"Role.team(" src\*.ts src\*.tsx 2>nul
if %errorlevel%==0 (
    echo [OK] Role.team() present
) else (
    echo [WARN] Aucun Role.team() trouve
)
echo.

echo =========================================
if "%FOUND%"=="1" (
    echo [RESULTAT] FAILLES DETECTEES
    echo =========================================
    exit /b 1
) else (
    echo [RESULTAT] AUCUNE FAILLE
    echo =========================================
    exit /b 0
)