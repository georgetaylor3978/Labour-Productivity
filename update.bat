@echo off
echo ============================================
echo  Labour Productivity Dashboard - GitHub Sync
echo ============================================

cd /d "%~dp0"

echo.
echo [1/3] Regenerating data.json from CSV...
node process_data.js
if errorlevel 1 (
    echo ERROR: process_data.js failed. Aborting.
    pause
    exit /b 1
)

echo.
echo [2/3] Staging all files...
git add -A

echo.
echo [3/3] Committing and pushing...
git commit -m "Auto-update: %date% %time%"
git push origin main

echo.
echo Done! Dashboard synced to GitHub.
pause
