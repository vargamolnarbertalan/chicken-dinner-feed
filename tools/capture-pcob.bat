@echo off
REM Double-clickable wrapper around capture-pcob.ps1, so the observer at the venue never has to
REM think about PowerShell execution policy. -ExecutionPolicy Bypass applies to this process only
REM and changes nothing on the machine.

setlocal
cd /d "%~dp0"

echo.
echo  PCOB API capture
echo  ----------------
echo  Before you continue, on the OB PC:
echo    - the PCOB client is running and logged in
echo    - "API Enable" is ticked
echo    - the launch.bat console window is open
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0capture-pcob.ps1" %*

echo.
pause
