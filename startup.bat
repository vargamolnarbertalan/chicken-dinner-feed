@echo off
setlocal
title chicken-dinner-feed

REM Entry point for the broadcast operator. Starts the backend, which also serves the admin UI and
REM the overlay pages, then opens the admin in the default browser.
REM DO NOT CLOSE this window while you are on air - closing it stops the overlays.

set PORT=4317
set HOST=127.0.0.1
set NODE_ENV=production

cd /d "%~dp0"

echo.
echo  ===============================================================
echo   chicken-dinner-feed
echo  ===============================================================
echo.
echo   Keep this window open while broadcasting.
echo   Hagyd nyitva ezt az ablakot a kozvetites alatt.
echo.

REM --- Prerequisites ----------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo  [X] Node.js was not found. Run install-dependencies.bat first.
    echo      A Node.js nem talalhato. Futtasd eloszor az install-dependencies.bat fajlt.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo  [X] Dependencies are not installed. Run install-dependencies.bat first.
    echo      A fuggosegek nincsenek telepitve. Futtasd eloszor az install-dependencies.bat fajlt.
    echo.
    pause
    exit /b 1
)

REM --- Is the port already taken? ---------------------------------------------
REM Catching this here gives a clear message instead of a stack trace; the most common cause is a
REM second copy of this app already running.
netstat -ano | findstr /r /c:"LISTENING" | findstr /c:"%HOST%:%PORT%" >nul 2>nul
if not errorlevel 1 (
    echo  [X] Port %PORT% is already in use.
    echo      A %PORT% port mar foglalt.
    echo.
    echo      Another copy of chicken-dinner-feed is probably already running.
    echo      Valoszinuleg mar fut egy masik peldany. Zard be azt az ablakot,
    echo      vagy allitsd at a PORT erteket a backend\.env fajlban.
    echo.
    pause
    exit /b 1
)

REM --- Open the admin once the server is up -----------------------------------
REM Fired in the background so the browser opens only after /api/health answers, rather than after
REM an arbitrary sleep that is either too short or wastes the operator's time.
start "" /b cmd /c "for /l %%i in (1,1,60) do (curl -s -o nul http://%HOST%:%PORT%/api/health && (start "" http://%HOST%:%PORT%/admin & exit) || timeout /t 1 /nobreak >nul)"

echo  [i] Starting server on http://%HOST%:%PORT%
echo.
echo      Admin      http://%HOST%:%PORT%/admin
echo      Overlays   http://%HOST%:%PORT%/overlay/^<id^>   (use as a browser source)
echo.

node backend\dist\index.js

REM Reached only when the server stops.
echo.
echo  [i] chicken-dinner-feed has stopped. / Az alkalmazas leallt.
pause
endlocal
