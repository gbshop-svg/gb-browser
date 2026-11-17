@echo off
title GB Browser
cd /d "%~dp0"

if not exist "node_modules" (
    echo [*] Premier lancement - installation...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [X] Erreur. Lance install.bat d'abord.
        pause
        exit /b 1
    )
)

if exist "node_modules\.bin\electron.cmd" (
    echo [*] Lancement de GB Browser...
    echo [*] Log: %APPDATA%\gb-browser\gb-debug.log
    echo.
    call node_modules\.bin\electron.cmd . 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [!] GB Browser a crashe (code: %ERRORLEVEL%)
        echo [!] Regarde le log: %APPDATA%\gb-browser\gb-debug.log
        echo.
        pause
    )
) else (
    echo [X] Electron introuvable. Lance install.bat d'abord.
    pause
    exit /b 1
)
