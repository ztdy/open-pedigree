@echo off
REM Dev launcher for the Windows side (pre-packaging). Double-click to run the app.
REM Uses the isolated Windows electron under .win\ so it never clashes with the WSL copy.
cd /d "%~dp0"
if not exist ".win\node_modules\electron\dist\electron.exe" (
  echo Windows electron not installed. Run:  cd .win ^&^& npm install
  pause
  exit /b 1
)
start "" ".win\node_modules\electron\dist\electron.exe" "%~dp0."
