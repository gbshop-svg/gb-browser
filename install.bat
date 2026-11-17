@echo off
title GB Browser - Installation
color 0A
cd /d "%~dp0"

echo.
echo   ============================================
echo   =     GB BROWSER - Installation            =
echo   =     Groupe Barbaray                       =
echo   ============================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [!] Node.js n'est pas installe.
    echo [*] Telechargement en cours...
    echo.
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\node-install.msi'"
    if exist "%TEMP%\node-install.msi" (
        echo [*] Lancement de l'installateur Node.js...
        msiexec /i "%TEMP%\node-install.msi" /passive
        echo [*] Redemarrez ce script apres l'installation de Node.js.
        pause
        exit /b
    ) else (
        echo [X] Echec du telechargement. Installez Node.js manuellement : https://nodejs.org
        pause
        exit /b 1
    )
)

echo [OK] Node.js detecte
for /f "tokens=*" %%v in ('node --version') do echo      Version: %%v
echo.

REM Autorise le script d'installation d'Electron (npm recent le bloque)
call npm install-scripts approve electron >nul 2>nul

echo [*] Installation des dependances...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [X] Echec de l'installation des dependances.
    pause
    exit /b 1
)

REM Si le binaire Electron manque, on le telecharge et on l'extrait nous-memes
if not exist "node_modules\electron\dist\electron.exe" (
    echo [*] Electron incomplet - telechargement manuel...
    call npx --yes electron-download --version 28.3.3 --platform win32 --arch x64
    powershell -NoProfile -Command "Expand-Archive -Path (Join-Path $env:LOCALAPPDATA 'electron\Cache\electron-v28.3.3-win32-x64.zip') -DestinationPath 'node_modules\electron\dist' -Force"
)
if not exist "node_modules\electron\dist\electron.exe" (
    echo [X] Impossible d'installer Electron. Envoie une capture de cette fenetre.
    pause
    exit /b 1
)
REM path.txt doit contenir exactement electron.exe, sans retour a la ligne
<nul set /p="electron.exe"> "node_modules\electron\path.txt"
echo [OK] Electron pret
echo.

REM Create desktop shortcut
echo [*] Creation du raccourci bureau...
set SCRIPT_DIR=%~dp0
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\GB Browser.lnk'); $s.TargetPath = '%SCRIPT_DIR%start.bat'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.IconLocation = '%SCRIPT_DIR%assets\icon.ico'; $s.Description = 'GB Browser - Navigateur Anti-Detect Groupe Barbaray'; $s.Save()"
echo [OK] Raccourci cree sur le bureau
echo.

echo   ============================================
echo   =   INSTALLATION TERMINEE !                =
echo   =   Lance GB Browser depuis le bureau      =
echo   ============================================
echo.
pause
