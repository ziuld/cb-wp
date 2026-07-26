# Guía: WordPress en Hostinger → Git + Docker local + entorno dev + CI/CD

Guía reutilizable basada en el proceso real hecho para **colibridge.es** en Hostinger.
Reemplaza los valores de ejemplo (dominio, usuario, rutas, IPs) por los del proyecto que estés migrando.

---

## 0. Resumen de la arquitectura

```
Local (Docker, réplica de prod)
        │  git push (rama de feature)
        ▼
   PR → develop
        │  merge
        ▼
GitHub Actions (deploy-dev.yml) ──rsync/SSH──► dev.tudominio.com
        │  revisión visual OK
        ▼
   PR develop → main
        │  merge
        ▼
GitHub Actions (deploy-main.yml) ──rsync/SSH──► producción (public_html)
```

- **Docker** solo corre en local. Hostinger (hosting compartido) no ejecuta contenedores.
- El **core de WordPress** no se versiona en Git, solo `wp-content/` (temas, plugins, mu-plugins).
- **`wp-content/uploads/`** nunca se versiona ni se despliega por Git — se sincroniza aparte, siempre de producción → dev, nunca al revés.

---

## 1. Preparar Hostinger

1. **hPanel → Avanzado → SSH Access** → activar. Anotar host, puerto (normalmente `65002`) y usuario.
2. **hPanel → Dominios/Subdominios** → crear `dev.tudominio.com` apuntando a una **carpeta distinta** de `public_html`, ej: `domains/tudominio.com/public_html/dev_public_html`.
   - Importante: verificar que esa ruta no quede *dentro* del árbol que luego se sincroniza como producción, o ajustar bien los paths de despliegue para no arrastrarla con un `--delete`.
3. **hPanel → Bases de datos** → crear una **segunda base de datos MySQL** solo para dev (nunca reutilizar la de producción).
4. Instalar WordPress limpio en `dev_public_html`, apuntando a esa base de datos nueva (ver paso 3).

---

## 2. Migrar el contenido a Git

### 2.1 Exportar desde producción

Por SSH (si `wp db export` falla en hosting compartido — común, porque `mysqldump` puede no estar disponible —, usar **phpMyAdmin → Exportar → Rápido → SQL** en su lugar, y descargar el `.sql` directo a tu máquina).

```bash
ssh -p PUERTO usuario@host
cd ~/domains/tudominio.com/public_html
wp theme list
wp plugin list
```

### 2.2 Traer el contenido real a tu máquina local

```powershell
scp -P PUERTO -r usuario@host:~/domains/tudominio.com/public_html/wp-content .\
```

### 2.3 Estructura del repo

```
proyecto/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .github/workflows/
│   ├── deploy-dev.yml
│   └── deploy-main.yml
├── wp-content/
│   ├── themes/
│   ├── plugins/
│   └── mu-plugins/
└── db/
    └── backup.sql          # dump de producción (ignorado por git)
```

### 2.4 `.gitignore` esencial

```
# Secrets y config local
.env
wp-config.php

# Contenido generado / sensible
wp-content/uploads/
wp-content/cache/
wp-content/upgrade/
wp-content/backup*/
wp-content/ai1wm-backups/     # backups de plugins de migración (All-in-One WP Migration, etc.)
wp-content/debug.log
wp-content/*.log

# Base de datos
db/*.sql
*.sql

# Docker
db_data/

# Claves SSH (si las generas dentro del repo por error)
deploy_key
deploy_key.pub

# Sistema
.DS_Store
node_modules/
```

⚠️ **Antes del primer `git add .`**, revisar `git status` con cuidado. Cosas que NO deben aparecer:
`uploads/`, `*.sql`, `wp-config.php`, backups de plugins, `debug.log`, claves SSH.

### 2.5 Primer commit y ramas

```powershell
git init
git add .
git commit -m "Setup inicial: docker-compose, workflows, gitignore"
git checkout -b main
git push -u origin main
git checkout -b develop
git push -u origin develop
```

Si el repo remoto ya existía vacío (creado desde GitHub), `main` no existe hasta el primer push — créala igual desde el commit local como arriba.

---

## 3. Docker local (réplica exacta de producción)

### 3.1 Verificar versiones reales del hosting

```bash
php -v                    # versión de PHP exacta
wp core version            # versión de WordPress exacta
```

Usar esa combinación exacta en la imagen de Docker (existen tags oficiales tipo `wordpress:X.Y.Z-phpA.B-apache` en Docker Hub).

### 3.2 `docker-compose.yml`

Puntos clave aprendidos en el proceso:

- **Compartir el core de WordPress** entre el contenedor `wordpress` y el contenedor `wpcli` con un volumen nombrado (`wp_core:/var/www/html`) — si no, WP-CLI no encuentra la instalación.
- **Repetir el mismo bloque `environment`** (credenciales de base de datos) en **todos** los servicios que necesiten hablar con la DB, incluido `wpcli`. Si falta, WP-CLI usa el host por defecto (`mysql`) en vez del nombre real del servicio (`db`) y falla con `Unknown server host`.
- No mapear un archivo (`uploads.ini`, etc.) que no existe localmente — Docker en Windows a veces lo crea como carpeta vacía en vez de fallar claramente, causando errores confusos.
- El servicio `db` importa `backup.sql` automáticamente **solo la primera vez** que se crea el volumen (vía `/docker-entrypoint-initdb.d/`). Si cambias credenciales después, hay que borrar el volumen (`docker compose down -v`) para que se re-inicialice con las nuevas.

```yaml
services:
  wordpress:
    image: wordpress:X.Y.Z-phpA.B-apache
    container_name: wp_app
    ports:
      - "8090:80"
    restart: unless-stopped
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_NAME: ${DB_NAME}
      WORDPRESS_DB_USER: ${DB_USER}
      WORDPRESS_DB_PASSWORD: ${DB_PASSWORD}
      WORDPRESS_DEBUG: 1
    volumes:
      - wp_core:/var/www/html
      - ./wp-content:/var/www/html/wp-content
    depends_on:
      - db

  db:
    image: mariadb:10.11
    container_name: wp_db
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ${DB_NAME}
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql
      - ./db/backup.sql:/docker-entrypoint-initdb.d/backup.sql

  phpmyadmin:
    image: phpmyadmin:latest
    container_name: wp_pma
    restart: unless-stopped
    ports:
      - "8081:80"
    environment:
      PMA_HOST: db
    depends_on:
      - db

  wpcli:
    image: wordpress:cli-phpA.B
    container_name: wp_cli
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_NAME: ${DB_NAME}
      WORDPRESS_DB_USER: ${DB_USER}
      WORDPRESS_DB_PASSWORD: ${DB_PASSWORD}
    volumes:
      - wp_core:/var/www/html
      - ./wp-content:/var/www/html/wp-content
    depends_on:
      - db
      - wordpress
    entrypoint: ["tail", "-f", "/dev/null"]

volumes:
  db_data:
  wp_core:
```

### 3.3 Levantar y poblar

```powershell
cp .env.example .env      # rellenar credenciales, cualquier valor nuevo (no tienen que coincidir con Hostinger)
docker compose up -d
docker compose ps          # confirmar los 4 servicios en estado "running"
```

Esperar ~20-30s a que MariaDB inicialice e importe `backup.sql` automáticamente. Confirmar:

```powershell
docker compose exec wpcli wp option get siteurl
```

Si da error de conexión repetido tras cambiar credenciales: **borrar volúmenes y reiniciar de cero**:

```powershell
docker compose down -v
docker compose up -d
```

### 3.4 Ajustar URLs (producción → local)

```powershell
docker compose exec wpcli wp search-replace 'https://tudominio.com' 'http://localhost:8090' --all-tables
```

⚠️ Si tras esto el sitio sigue redirigiendo a la URL de producción, revisar (en este orden):
1. `WP_HOME` / `WP_SITEURL` hardcodeados en `wp-config.php`.
2. Plugins de seguridad/SSL activos (Really Simple SSL, Complianz, etc.) que fuercen dominio/HTTPS — desactivar solo en local.
3. Reglas de redirección en `.htaccess`.

Abrir: `http://localhost:8090`

---

## 4. GitHub Actions: despliegue automático

### 4.1 Workflows

`.github/workflows/deploy-dev.yml` (push a `develop` → `dev.tudominio.com`) y `deploy-main.yml` (push a `main` → producción), ambos usando `burnett01/rsync-deployments` para sincronizar `wp-content/` por SSH.

⚠️ **Los dos workflows deben excluir `uploads/`** del rsync (`--exclude=uploads/`), no solo el de producción. `uploads/` está en `.gitignore` a propósito, así que el repo que clona GitHub Actions nunca lo tiene — si el workflow usa `--delete` sin excluirlo, **borra `uploads/` del servidor** al desplegar, porque interpreta que ya no existe en el origen. Esto pasó en la práctica: un deploy a dev sin el exclude borró todo lo que se había sincronizado manualmente.

### 4.2 Clave SSH para CI/CD

```powershell
ssh-keygen -t ed25519 -C "github-actions-proyecto" -f .\deploy_key -N '""'
```

- Pública (`deploy_key.pub`) → hPanel → SSH Access → Manage SSH Keys (el "Nombre" ahí es solo una etiqueta, no afecta nada).
- Privada (`deploy_key`) → contenido completo (incluyendo las líneas `BEGIN`/`END`) pegado en el Secret `HOSTINGER_SSH_PRIVATE_KEY` de GitHub.
- **Nunca pegar la clave privada en un chat, issue, o cualquier canal no cifrado.** Si ocurre por error, considerarla comprometida: eliminarla de Hostinger y generar un par nuevo.
- Mover los archivos de la clave fuera del repo (o confirmarlos en `.gitignore`) — no afecta nada moverlos, ya que su función es solo copiar el contenido a hPanel y a GitHub una vez.

### 4.3 Secrets necesarios en GitHub

Repo → Settings → Secrets and variables → Actions:

| Secret | Ejemplo |
|---|---|
| `HOSTINGER_HOST` | `89.116.147.111` (solo la IP/host, sin `ssh://`) |
| `HOSTINGER_SSH_PORT` | `65002` (solo el número) |
| `HOSTINGER_SSH_USER` | `u982646599` |
| `HOSTINGER_SSH_PRIVATE_KEY` | contenido completo de `deploy_key` |
| `DEV_REMOTE_PATH` | `/home/usuario/domains/tudominio.com/public_html/dev_public_html` |
| `PROD_REMOTE_PATH` | `/home/usuario/domains/tudominio.com/public_html` |

Un secret con nombre erróneo simplemente se borra y se recrea — no deja rastro ni rompe nada.

### 4.4 Prueba del pipeline

```powershell
git checkout develop
New-Item -ItemType Directory -Force -Path .\wp-content\mu-plugins
"<?php // archivo de prueba deploy" | Out-File -Encoding utf8 .\wp-content\mu-plugins\test-deploy.php
git add .
git commit -m "test: verificar pipeline de deploy a dev"
git push origin develop
```

Revisar GitHub → **Actions**. Verificar en el servidor:
```bash
ls ~/domains/tudominio.com/public_html/dev_public_html/wp-content/mu-plugins/
```

Errores típicos y su causa:

| Error en el log | Causa |
|---|---|
| `Bad port '-l'` | El secret `HOSTINGER_SSH_PORT` está vacío, mal escrito, o con texto extra |
| `change_dir "wp-content" failed: No such file or directory` | Git no versiona carpetas vacías — si `wp-content/` se queda sin ningún archivo rastreado, desaparece del repo |
| `Unknown server host 'mysql'` (en wpcli) | Falta el bloque `environment` con las credenciales de DB en ese servicio del compose |
| `Error establishing a database connection` tras recrear contenedores | El volumen de MySQL sigue teniendo credenciales viejas; requiere `docker compose down -v` para regenerarse |
| `#1050 - Table 'X' already exists` al importar un `.sql` en phpMyAdmin | La base de datos destino ya tenía tablas (de una instalación limpia previa) — vaciarla (Drop de todas las tablas) antes de importar |
| El sitio redirige solo a la URL de producción pese a que `search-replace` ya corrió bien en la base de datos | No es un problema de WordPress: es una **cookie de sesión activa** del dominio de producción en el navegador. Probar en ventana de incógnito antes de seguir depurando plugins/config |
| Imágenes con 404 en dev/local aunque la base de datos las referencia bien | `wp-content/uploads/` no se sincronizó — no se versiona por Git a propósito, hay que copiarlo aparte (ver sección 6.3) |
| Portada carga bien pero cualquier página interna da "This Page Does Not Exist" | Falta `.htaccess` con las reglas de reescritura de WordPress (común si la instalación se hizo solo por WP-CLI). Ver sección 6.4 |
| `uploads/` desaparece del servidor después de un deploy normal a `develop` o `main` | El workflow usa `rsync --delete` sin `--exclude=uploads/`. Como `uploads/` no está en el repo (`.gitignore`), el `--delete` lo borra en destino por creer que ya no existe en origen. **Ambos** workflows (`deploy-dev.yml` y `deploy-main.yml`) deben excluirlo, no solo el de producción |

Al terminar la prueba, limpiar el archivo de test:
```powershell
Remove-Item .\wp-content\mu-plugins\test-deploy.php
git add . ; git commit -m "chore: eliminar archivo de prueba" ; git push origin develop
```
(Si esto deja `wp-content/` vacío otra vez, añadir un `.gitkeep` o, mejor, ya tener contenido real ahí.)

---

## 6. Igualar el entorno dev con datos reales de producción

Una instalación limpia en `dev_public_html` no es suficiente para revisar cambios reales — hace falta la base de datos completa, los archivos de `uploads/`, y las reglas de reescritura (`.htaccess`).

### 6.1 Importar la base de datos real a la base de datos de dev

Si la base de datos de dev ya tiene tablas (de una instalación limpia previa), **vaciarla primero** o el import falla con `#1050 - Table 'X' already exists`:

1. hPanel → phpMyAdmin → selecciona la base de datos de dev
2. Marca todas las tablas → acción **"Eliminar" (Drop)** → confirmar
3. Pestaña **"Importar"** → seleccionar el `.sql` de producción → Ejecutar

### 6.2 Ajustar URLs dentro de esa base (por SSH, en la carpeta de dev)

```bash
cd ~/domains/tudominio.com/public_html/dev_public_html
wp search-replace 'https://tudominio.com' 'https://dev.tudominio.com' --all-tables
wp option get siteurl   # debe mostrar https://dev.tudominio.com
wp option get home      # debe mostrar https://dev.tudominio.com
```

### 6.3 Sincronizar `uploads/` (servidor a servidor, sin pasar por Git ni por tu máquina)

Sin esto, las imágenes del sitio dan 404 aunque la base de datos las referencie correctamente:

```bash
rsync -avz --progress \
  ~/domains/tudominio.com/public_html/wp-content/uploads/ \
  ~/domains/tudominio.com/public_html/dev_public_html/wp-content/uploads/
```

### 6.4 Regenerar el `.htaccess` de dev (permalinks)

Si la instalación de dev se hizo por WP-CLI, puede que nunca se haya generado un `.htaccess` — sin él, la portada carga pero cualquier página interna da "This Page Does Not Exist" (404 de WordPress, no de Apache).

```bash
wp rewrite flush --hard   # puede no ser suficiente por sí solo
```

Si tras eso `.htaccess` sigue sin existir (`cat .htaccess` → `No such file or directory`), crearlo a mano con el bloque estándar de WordPress:

```bash
cat > .htaccess << 'EOF'
# BEGIN WordPress
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
# END WordPress
EOF
```

### 6.5 Verificación final

Abrir el entorno dev **en ventana de incógnito** (evita falsos positivos por cookies de sesión de otro dominio, ver tabla de errores) y navegar a más de una página, no solo la portada, para confirmar que los permalinks funcionan.

---

## 7. Flujo de trabajo diario

```powershell
git checkout develop
git checkout -b feature/nombre-del-cambio

# trabajar en VS Code + Claude Code, probando en localhost:8090

git push origin feature/nombre-del-cambio
# → abrir PR contra develop
```

- **Merge a `develop`** → despliegue automático a `dev.tudominio.com` → revisar visualmente.
- **PR `develop` → `main`** → al mergear, despliegue automático a producción (con aprobación manual si se configuró el `environment`).

---

## 8. Buenas prácticas de seguridad aprendidas

- Nunca pegar contraseñas de base de datos, claves privadas SSH, ni tokens en un chat o canal no cifrado — copiarlos directo del archivo al campo destino (`Get-Content archivo | Set-Clipboard` en PowerShell).
- Repos públicos: doble revisión de `.gitignore` **antes** del primer commit real con contenido de producción — especialmente backups de plugins de migración, que pueden contener un volcado completo del sitio.
- Bases de datos separadas para cada entorno (producción / dev / local) — nunca compartir credenciales ni apuntar dos entornos a la misma base.
- `uploads/` sincroniza en un solo sentido: producción → dev/local, nunca al revés.

---

## 9. Harness de automatización (verificación de despliegues)

En `harness/` (raíz del repo, fuera de `wp-content/` para que nunca se despliegue por rsync) vive un harness de tests que automatiza lo que antes se verificaba a mano: que local, dev y producción respondan y se vean como se espera después de un cambio.

**Stack:** Node.js + `@playwright/test`. El harness no reinventa un test runner — es una capa fina de orquestación por encima de Playwright: crea una sesión, invoca `playwright test`, recolecta resultados y artefactos.

**Uso:**

```powershell
cd harness
npm install
npx playwright install chromium   # solo la primera vez

node cli.js run --env=local --suite=smoke
node cli.js run --env=dev --suite=smoke
node cli.js run --env=prod --suite=smoke --confirm   # exige --confirm a propósito
```

- `--env`: `local` (`localhost:8090`), `dev` (`dev.colibridge.es`) o `prod` (`colibridge.es`, bloqueado detrás de `--confirm`).
- `--suite`: `smoke` (HTTP/browser, corre en cualquier entorno), `integration` (checks vía `docker compose exec wpcli`, **solo local**), o `all`.

**Sesiones:** cada corrida queda en `harness/sessions/<timestamp>_<env>_<suite>/` (gitignored) con `session.json` (resumen: entorno, commit, resultado, exit code), `log.txt` (output crudo) y `artifacts/` (reporte HTML/JSON de Playwright, screenshots/traces en fallos). Nunca se pisa una sesión anterior — sirve para comparar antes/después de un deploy.

**Reglas de seguridad ya incorporadas al harness:**
- `integration` nunca corre WP-CLI remoto contra dev/prod — solo contra el Docker local.
- `prod` exige `--confirm` explícito, igual que la regla de este documento de no tocar producción sin confirmación.

**Pendiente (roadmap, no implementado todavía):** checks de integridad de DB/plugins vía wp-cli más ricos en `tests/integration/`, captura de screenshots por página clave para comparar entornos, comando `list`/`diff` de sesiones, hook opcional en `deploy-dev.yml` para correr el smoke suite automático post-deploy, y un adapter futuro en `harness/adapters/openspec/` (hoy solo un README placeholder, sin código) para integrar con OpenSpec el día que se decida. Detalle de uso y de qué cubre cada carpeta en `harness/README.md`.