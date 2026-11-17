@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Publicar USFX Virtual en GitHub Pages
echo ============================================
echo.
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm ci || goto error
)
echo Compilando la pagina...
set VITE_BASE=/usfx-virtual/
call npx vite build || goto error
type nul > dist\.nojekyll
copy /y dist\index.html dist\404.html >nul
echo Subiendo a la rama gh-pages...
cd dist
git init -q -b gh-pages
git add -A
git commit -q -m "Publicar pagina"
git push -f https://github.com/GIAN86S/usfx-virtual.git gh-pages || goto error
cd ..
rmdir /s /q dist\.git
echo.
echo Listo. En 1 o 2 minutos se actualiza: https://gian86s.github.io/usfx-virtual/
pause
exit /b 0
:error
echo.
echo Algo fallo. Revisa el mensaje de arriba.
pause
exit /b 1
