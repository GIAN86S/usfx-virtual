# Publicación automática (pendiente)

`publicar.yml` publica la web y aplica las migraciones en cada `push` a `main`.
Está aquí, fuera de `.github/workflows/`, porque subir flujos a GitHub requiere el permiso `workflow`.

Para activarlo cuando se conecte la base de datos:

1. En la terminal: `gh auth refresh -h github.com -s workflow`
2. Mueve este archivo a `.github/workflows/publicar.yml`, haz commit y push.
3. En GitHub: **Settings → Pages → Source: GitHub Actions**.

Mientras tanto, la página se publica desde la rama `gh-pages` (ver `PUBLICAR-PAGINA.bat`).
