@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Cuenta de GitHub activa:
gh auth status
echo.
echo Se creara el repositorio PRIVADO usfx-virtual en esa cuenta.
pause
gh repo create usfx-virtual --private --source . --push --description "Plataforma de universidad virtual USFX (PWA + Supabase)"
echo.
gh repo view --web
pause
