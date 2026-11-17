@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules call npm install
start "" cmd /c "timeout /t 25 >nul & start http://localhost:4173"
call npm run demo
pause
