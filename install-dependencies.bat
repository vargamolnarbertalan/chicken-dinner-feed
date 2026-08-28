@echo off
setlocal enabledelayedexpansion
title chicken-dinner-feed - Install dependencies

echo.
echo  ===============================================================
echo   chicken-dinner-feed - Dependency installation / Telepites
echo  ===============================================================
echo.
echo  Run this once after unpacking, and again after every update. It only needs an
echo  internet connection when something actually has to be installed.
echo  Ezt futtasd egyszer kicsomagolas utan, es minden frissites utan ujra. Internet
echo  csak akkor kell, ha tenyleg telepiteni kell valamit.
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

REM --- Node.js new enough? ------------------------------------------------------
REM The floor comes from this bundle's own package.json ("engines"."node"), not a number
REM copied into this script by hand — the two can never quietly drift apart.
for /f "delims=" %%r in ('node -e "console.log(require('./package.json').engines.node.match(/\d+/)[0])" 2^>nul') do set REQUIRED_MAJOR=%%r
if not defined REQUIRED_MAJOR set REQUIRED_MAJOR=22

set NODE_MAJOR=!NODE_VERSION:v=!
for /f "tokens=1 delims=." %%m in ("!NODE_MAJOR!") do set NODE_MAJOR=%%m

if !NODE_MAJOR! LSS !REQUIRED_MAJOR! (
    echo.
    echo  [X] Node.js !NODE_VERSION! is too old. Version !REQUIRED_MAJOR! or newer is required.
    echo      A Node.js !NODE_VERSION! tul regi. Legalabb !REQUIRED_MAJOR!-es verzio kell.
    echo.
    echo      Download the current LTS from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM --- Does anything actually need installing? -----------------------------------
REM A stamp file records the SHA-256 of package-lock.json from the last successful
REM install. If node_modules exists and the lockfile has not changed since, there is
REM nothing to do — this is what makes it safe to run this script again after every
REM update instead of only once: unpacking a new release with unchanged dependencies
REM costs nothing, and one with new or updated packages installs only what changed.
set "STAMP=node_modules\.install-stamp.txt"
set "LOCK_HASH="
for /f "skip=1 tokens=1" %%h in ('certutil -hashfile package-lock.json SHA256 2^>nul ^| findstr /v /i "hash CertUtil"') do if not defined LOCK_HASH set LOCK_HASH=%%h

set NEED_INSTALL=1
if exist "node_modules" if exist "!STAMP!" if defined LOCK_HASH (
    set /p STAMPED_HASH=<"!STAMP!"
    if "!LOCK_HASH!"=="!STAMPED_HASH!" set NEED_INSTALL=0
)

if !NEED_INSTALL! EQU 0 (
    echo.
    echo  ===============================================================
    echo   [OK] Dependencies are already installed and up to date.
    echo        A fuggosegek mar telepitve es naprakeszek. Nincs mit tenni.
    echo  ===============================================================
    echo.
    pause
    exit /b 0
)

echo.
if exist "node_modules" (
    echo  [i] An update is available. Updating dependencies, this can take a few minutes...
    echo      Van egy frissites. Fuggosegek frissitese, ez eltarthat par percig...
) else (
    echo  [i] Installing packages, this can take a few minutes...
    echo      Csomagok telepitese, ez eltarthat par percig...
)
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

REM Record what was just installed so the next run can tell nothing has changed.
set "LOCK_HASH="
for /f "skip=1 tokens=1" %%h in ('certutil -hashfile package-lock.json SHA256 2^>nul ^| findstr /v /i "hash CertUtil"') do if not defined LOCK_HASH set LOCK_HASH=%%h
if defined LOCK_HASH echo !LOCK_HASH!> "%STAMP%"

echo.
echo  ===============================================================
echo   [OK] Done. You can now start the app with startup.bat
echo        Kesz. Az alkalmazast a startup.bat inditja.
echo  ===============================================================
echo.
pause
endlocal
