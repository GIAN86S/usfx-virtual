@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   USFX Virtual - demo accesible desde internet
echo ============================================
echo.
echo 1. Se abrira una ventana llamada "Tunel USFX".
echo 2. Alli aparece una direccion https://....trycloudflare.com
echo 3. Abre esa direccion en tu celular. Usuarios: estudiante, docente, admin... clave demo1234
echo.
echo Cualquiera con el enlace puede entrar. Cierra ambas ventanas para apagarlo.
echo.
if not exist node_modules call npm install
start "Tunel USFX" cmd /k ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --no-autoupdate --url http://localhost:4173"
call npm run demo
pause
