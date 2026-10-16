@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening nodejs.org: install the LTS version, then double-click play.bat again.
  start https://nodejs.org
  pause
  exit /b
)
echo Starting the game. Keep this window open while you play. Close it to stop the game.
start "" /min cmd /c "timeout /t 3 >nul & start http://127.0.0.1:8765/"
node tools\serve.js 8765
pause
