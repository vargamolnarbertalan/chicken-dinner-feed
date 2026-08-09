@echo off
setlocal enabledelayedexpansion
title chicken-dinner-feed - Install dependencies

echo.
echo  ===============================================================
echo   chicken-dinner-feed - Dependency installation / Telepites
echo  ===============================================================
echo.
echo  Run this once after unpacking. It needs an internet connection.
echo  Ezt eleg egyszer lefuttatni a kicsomagolas utan. Internet kell hozza.
echo.

cd /d "%~dp0"

REM --- Node.js present? -------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo  [X] Node.js was not found on this computer.
    echo      A Node.js nincs telepitve ezen a gepen.
    echo.
    echo      Install the LTS version from https://nodejs.org/ and run this again.
    echo      Telepitsd az LTS valtozatot innen: https://nodejs.org/ majd inditsd ujra ezt.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo  [i] Node.js found / megtalalva: !NODE_VERSION!

REM --- Node.js new enough? Requires v22 or newer. ------------------------------
set NODE_MAJOR=!NODE_VERSION:v=!
for /f "tokens=1 delims=." %%m in ("!NODE_MAJOR!") do set NODE_MAJOR=%%m
if !NODE_MAJOR! LSS 22 (
    echo.
    echo  [X] Node.js !NODE_VERSION! is too old. Version 22 or newer is required.
    echo      A Node.js !NODE_VERSION! tul regi. Legalabb 22-es verzio kell.
    echo.
    echo      Download the current LTS from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM --- Install ----------------------------------------------------------------
echo.
echo  [i] Installing packages, this can take a few minutes...
echo      Csomagok telepitese, ez eltarthat par percig...
echo.

call npm ci --omit=dev
if errorlevel 1 (
    echo.
    echo  [!] 'npm ci' failed, retrying with 'npm install'...
    echo      Az 'npm ci' nem sikerult, ujraprobalas 'npm install' paranccsal...
    echo.
    call npm install --omit=dev
    if errorlevel 1 (
        echo.
        echo  [X] Installation failed. Check your internet connection and try again.
        echo      A telepites nem sikerult. Ellenorizd az internetkapcsolatot.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo  ===============================================================
echo   [OK] Done. You can now start the app with startup.bat
echo        Kesz. Az alkalmazast a startup.bat inditja.
echo  ===============================================================
echo.
pause
endlocal
