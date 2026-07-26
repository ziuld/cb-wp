# Kit de arranque: WordPress + Git + Docker + Dev subdomain

> 📘 Para el proceso paso a paso completo, con explicaciones y solución de problemas, ver **`docs/GUIA-WORDPRESS-GIT-DOCKER.md`**.
> 🤖 Si usas Claude Code sobre este repo, lee primero **`CLAUDE.md`** (contexto del proyecto y estado actual).

## 0. Estructura del repo

```
.
├── CLAUDE.md                 # contexto para Claude Code (estado del proyecto, próximos pasos)
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .github/workflows/
│   ├── deploy-dev.yml        # develop -> dev.dominio.com
│   └── deploy-main.yml       # main -> producción (public_html)
├── docs/
│   └── GUIA-WORDPRESS-GIT-DOCKER.md   # guía completa reutilizable, con tabla de errores conocidos
├── wp-content/
│   ├── themes/
│   ├── plugins/
│   └── mu-plugins/
└── db/
    └── backup.sql             # dump de producción (ignorado por git)
```

## 1. Preparar Hostinger

1. hPanel → Avanzado → **SSH Access** → actívalo y copia el host/puerto/usuario.
2. Genera un par de claves SSH en tu máquina y añade la **pública** en hPanel (SSH Access → Manage SSH Keys). El "Nombre" que le pongas ahí es solo una etiqueta visual, no afecta la conexión.
3. hPanel → **Dominios/Subdominios** → crea `dev.tudominio.com` apuntando a una carpeta **distinta** de `public_html`, ej: `domains/tudominio.com/public_html/dev_public_html`.
4. hPanel → **Bases de datos** → crea una segunda base de datos MySQL solo para `dev` (no reutilices la de producción).
5. Instala WordPress "limpio" en esa carpeta dev, apuntando a esa base — el core NO se versiona en Git, solo `wp-content`. Si lo instalas por WP-CLI, revisa el paso 3 de la sección 5 (el `.htaccess` no se genera solo).

## 2. Migrar el contenido actual a Git

Si `wp db export` falla por SSH (común en hosting compartido, `mysqldump` puede no estar disponible), exporta desde **phpMyAdmin → Exportar → Rápido → SQL** en su lugar.

```bash
ssh usuario@host -p PUERTO
cd ~/domains/tudominio.com/public_html
wp theme list
wp plugin list

# desde tu máquina local:
scp -P PUERTO -r usuario@host:~/domains/tudominio.com/public_html/wp-content ./wp-content
```

```bash
git init
git add .
git status   # revisa con cuidado antes de commitear (ver Notas importantes)
git commit -m "Migración inicial desde Hostinger"
git checkout -b main
git push -u origin main
git checkout -b develop
git push -u origin develop
```

## 3. Levantar el entorno local (réplica de producción)

Antes de nada, confirma la versión exacta de PHP y WordPress de producción (`php -v`, `wp core version` por SSH) y ajusta la imagen en `docker-compose.yml` si no coincide.

```bash
cp .env.example .env      # rellena las credenciales, cualquier valor nuevo — no tienen que coincidir con Hostinger
docker compose up -d
docker compose ps          # confirma los 4 servicios (wordpress, db, phpmyadmin, wpcli) en "running"
```

Espera ~20-30s a que MariaDB inicialice e importe `db/backup.sql` automáticamente (solo ocurre la primera vez que se crea el volumen). Confirma:

```bash
docker compose exec wpcli wp option get siteurl
```

Si da error de conexión tras cambiar credenciales en `.env`, hay que **borrar los volúmenes y reiniciar de cero**:
```bash
docker compose down -v
docker compose up -d
```

Ajusta las URLs tras la primera importación:

```bash
docker compose exec wpcli wp search-replace 'https://tudominio.com' 'http://localhost:8090' --all-tables
```

Sitio local: `http://localhost:8090` · phpMyAdmin: `http://localhost:8081`

⚠️ Si el sitio redirige a la URL de producción pese a que el `search-replace` corrió bien, probablemente **no es un bug de WordPress** — prueba en ventana de incógnito primero (puede ser una cookie de sesión activa del dominio de producción en tu navegador).

## 4. Igualar el entorno dev con datos reales

Una instalación limpia en `dev_public_html` no basta para revisar cambios reales. Resumen (detalle completo en la guía, sección 6):

1. **Base de datos:** vaciar las tablas de la base de dev si ya tenía una instalación limpia (o falla con `#1050 table already exists`), e importar el `.sql` de producción vía phpMyAdmin.
2. **URLs:** por SSH, en `dev_public_html`: `wp search-replace 'https://tudominio.com' 'https://dev.tudominio.com' --all-tables`
3. **Uploads:** sincronizar `wp-content/uploads/` servidor-a-servidor (producción → dev) por rsync vía SSH — sin esto, las imágenes dan 404 aunque la base de datos las referencie bien.
4. **`.htaccess`:** si la instalación fue por WP-CLI, puede que no exista — sin él, la portada carga pero las páginas internas dan 404. Crear a mano con el bloque estándar de WordPress si falta.

## 5. Flujo de trabajo diario

```bash
git checkout develop
git checkout -b feature/nombre-del-cambio

# trabajas en VS Code + Claude Code, probando en localhost:8090
git push origin feature/nombre-del-cambio
# → abres PR contra develop
```

Al hacer **merge a `develop`** → `deploy-dev.yml` sincroniza `wp-content/` a `dev.tudominio.com` automáticamente. Revisas ahí con calma.

Cuando esté aprobado, PR **`develop` → `main`** → al mergear, `deploy-main.yml` sincroniza a `public_html` (producción). Si activaste "Required reviewers" en el environment `production`, GitHub pedirá tu aprobación manual justo antes de tocar el sitio real.

## 6. Secrets a configurar en GitHub (Settings → Secrets and variables → Actions)

| Secret | Ejemplo |
|---|---|
| `HOSTINGER_HOST` | `123.45.67.89` (solo la IP/host, sin `ssh://`) |
| `HOSTINGER_SSH_PORT` | `65002` (solo el número, sin texto extra) |
| `HOSTINGER_SSH_USER` | `u123456789` |
| `HOSTINGER_SSH_PRIVATE_KEY` | contenido completo de tu clave privada, incluyendo `BEGIN`/`END` |
| `DEV_REMOTE_PATH` | `/home/u123456789/domains/tudominio.com/public_html/dev_public_html` |
| `PROD_REMOTE_PATH` | `/home/u123456789/domains/tudominio.com/public_html` |

Un secret con nombre erróneo simplemente se borra y se recrea, sin problema. **Nunca pegues la clave privada en un chat u otro canal no cifrado** — cópiala directo del archivo al campo de GitHub.

## Notas importantes

- `wp-content/uploads/` **no se despliega por Git** (son binarios pesados y cambian por uso normal del sitio, no por desarrollo). Sincronízalos aparte y solo de producción → dev, nunca al revés.
- ⚠️ **Ambos workflows** (`deploy-dev.yml` y `deploy-main.yml`) deben excluir `uploads/` del rsync (`--exclude=uploads/`), no solo el de producción. Como `uploads/` no está en el repo (`.gitignore`), un `rsync --delete` sin ese exclude **borra `uploads/` del servidor** al desplegar, porque interpreta que ya no existe en el origen. Esto ya pasó una vez en la práctica — ver la guía para el detalle.
- El `docker-compose.yml` comparte el core de WordPress entre `wordpress` y `wpcli` con un volumen nombrado (`wp_core`), y repite las mismas variables de entorno de base de datos en ambos servicios — si `wpcli` no las tiene, falla con `Unknown server host 'mysql'`.
- Ajusta la versión de PHP **y** de WordPress en `docker-compose.yml` para que coincidan exactamente con las de Hostinger (`php -v`, `wp core version`, o hPanel → tu sitio → PHP Configuration).
- Antes del primer `git add .` con contenido real, revisa `git status` con cuidado: no deben aparecer `uploads/`, `*.sql`, `wp-config.php`, backups de plugins de migración (ej. `ai1wm-backups/`), `debug.log`, ni claves SSH.