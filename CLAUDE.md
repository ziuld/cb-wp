# CLAUDE.md — Contexto del proyecto cb-wp (colibridge.es)

Este archivo le da contexto a Claude Code sobre el estado del proyecto. Léelo completo antes de tocar nada.

## Qué es este proyecto

Migración de un WordPress en producción (Hostinger, hosting compartido) hacia un flujo Git + Docker local + entorno dev con despliegue automático. Hostinger **no** corre Docker — Docker solo se usa en local, para tener una réplica exacta de producción. El despliegue real a `dev.colibridge.es` y a producción se hace por rsync/SSH vía GitHub Actions.

- Repo: `https://github.com/ziuld/cb-wp` (público)
- Ramas: `main` (producción) y `develop` (dev)
- Dominio real: `colibridge.es` · Subdominio dev: `dev.colibridge.es`
- Producción en servidor: `~/domains/colibridge.es/public_html`
- Dev en servidor: `~/domains/colibridge.es/public_html/dev_public_html`
- Host SSH: `89.116.147.111` puerto `65002`, usuario `u982646599`
- Dos bases de datos MySQL separadas en Hostinger: producción (`u982646599_xiaXz`) y dev (`u982646599_dev`) — nunca deben mezclarse ni compartir credenciales.

## La guía viva del proyecto

**`docs/GUIA-WORDPRESS-GIT-DOCKER.md`** es la guía paso a paso reutilizable de todo este proceso (pensada para poder repetirlo con otro sitio/persona en el futuro). Es un documento vivo:

- **Cada vez que completes o resuelvas algo nuevo** (un fix, un paso que faltaba, un error nuevo con su causa), actualiza esa guía en la sección correspondiente. Si es un error nuevo, añádelo a la tabla de "Errores típicos y su causa" (sección 4.4).
- No la reescribas completa — edítala de forma incremental, manteniendo el estilo y estructura que ya tiene.
- Al final de cada tarea que completes, dime explícitamente **qué actualizaste en la guía**, además de lo que resolviste en el código.

## Cómo reportar tu trabajo

Después de cada paso completado (no esperes a terminar todo):
1. Dime brevemente qué estaba mal y por qué.
2. Dime qué cambiaste (archivo + resumen del cambio).
3. Dime cómo lo verificaste (comando + resultado).
4. Dime si actualizaste `docs/GUIA-WORDPRESS-GIT-DOCKER.md` y en qué sección.

No hace falta que esperes confirmación mía entre pasos si el siguiente paso es obvio y de bajo riesgo (ej. seguir depurando). Sí pídeme confirmación antes de cualquier acción irreversible o que toque producción real (ej. desplegar a `main`, borrar datos, sobrescribir `wp-config.php` de producción).

## Problema anterior — RESUELTO

~~Tras hacer `wp search-replace` el sitio local seguía redirigiendo a `https://colibridge.es/wp-admin/`.~~

**Causa real:** no era un problema de WordPress, config, ni plugins. Era una **cookie de sesión activa** de `colibridge.es` en el navegador (había una sesión de wp-admin de producción iniciada), que redirigía automáticamente al detectar login. Se confirmó abriendo en ventana de incógnito: cargó correctamente. No fue necesario revertir ningún cambio en `wp-config.php`, `.htaccess`, ni plugins (todos los plugins desactivados como prueba durante el diagnóstico fueron reactivados).

**Lección para la guía:** siempre probar en incógnito antes de asumir que es un problema de configuración/plugins cuando hay redirección a otro dominio tras un `search-replace`.

## Progreso reciente — dev.colibridge.es igualado con datos reales

Ya completado (no repetir):
1. Base de datos real importada a `u982646599_dev` (se tuvo que vaciar la base primero por error `#1050 table already exists`).
2. `wp search-replace 'https://colibridge.es' 'https://dev.colibridge.es' --all-tables` corrido en dev (593 reemplazos, igual que en local).
3. `wp-content/uploads/` sincronizado servidor-a-servidor (rsync directo en Hostinger, producción → dev) — sin esto las imágenes daban 404.
4. `.htaccess` no existía en `dev_public_html` (la instalación por WP-CLI no lo generó) — se creó a mano con el bloque estándar de WordPress. Sin esto, la portada cargaba pero las páginas internas daban "This Page Does Not Exist".

Todo esto ya está documentado en `docs/GUIA-WORDPRESS-GIT-DOCKER.md`, sección 6.

## Próximo paso actual (en curso)

**Paso 2 del plan: prueba de ciclo completo `local → develop → dev.colibridge.es` con un cambio real.**

1. Hacer un cambio pequeño y visible en el tema, en local.
2. Commit en una rama `feature/*`, PR y merge a `develop`.
3. Confirmar que `deploy-dev.yml` lo despliega automáticamente a `dev.colibridge.es`.
4. Comparar visualmente `localhost:8090` vs `dev.colibridge.es` — deben verse idénticos, incluyendo el cambio nuevo.

Si este ciclo sale limpio, el siguiente paso (no empezar sin confirmación explícita) es probar `deploy-main.yml` hacia producción real.

## Recordatorio: mantener actualizada la guía

Sigue aplicando la regla de este archivo: cada vez que resuelvas algo nuevo, actualiza `docs/GUIA-WORDPRESS-GIT-DOCKER.md` de forma incremental (no reescribir todo), y repórtame qué sección tocaste.

## Contexto técnico ya resuelto (para no repetir errores)

- El servicio `wpcli` en `docker-compose.yml` necesita el mismo bloque `environment` con credenciales de DB que el servicio `wordpress` — si falta, WP-CLI intenta conectar al host por defecto `mysql` (que no existe) en vez de `db`, y falla con `Unknown server host 'mysql'`.
- El core de WordPress se comparte entre `wordpress` y `wpcli` vía un volumen nombrado `wp_core:/var/www/html` — sin esto, `wpcli` no encuentra la instalación.
- Si cambias las credenciales de DB en `.env` después de haber levantado los contenedores una vez, hay que correr `docker compose down -v` (borra volúmenes) para que MariaDB se re-inicialice con las credenciales nuevas y reimporte `db/backup.sql`.
- `wp-content/ai1wm-backups/` y `wp-content/debug.log` están en `.gitignore` — nunca deben subirse (contienen volcados completos del sitio / logs sensibles).
- Puerto local de WordPress: `8090` (no `8080`, se cambió para evitar conflictos con otras apps). phpMyAdmin: `8081`.
- Los 6 secrets de GitHub Actions ya están configurados: `HOSTINGER_HOST`, `HOSTINGER_SSH_PORT`, `HOSTINGER_SSH_USER`, `HOSTINGER_SSH_PRIVATE_KEY`, `DEV_REMOTE_PATH`, `PROD_REMOTE_PATH`. El pipeline `develop → dev.colibridge.es` ya fue probado y funciona.
- El pipeline `main → producción` (`deploy-main.yml`) **todavía no se ha probado**. Cuando se pruebe, hacerlo con máximo cuidado (excluye `uploads/` del rsync a propósito, para no pisar medios reales).

## Reglas de seguridad para este proyecto

- Nunca pegar claves privadas SSH, contraseñas reales, ni tokens en la salida que me muestres o en commits.
- No tocar la rama `main` ni desplegar a producción sin confirmación explícita.
- No modificar ni borrar `wp-content/uploads/` de ningún entorno.
- Cualquier cambio en `.gitignore` que remueva una exclusión existente requiere confirmación explícita antes de aplicarlo.