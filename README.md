# Kit de arranque: WordPress + Git + Docker + Dev subdomain

## 0. Estructura del repo

```
.
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .github/workflows/
│   ├── deploy-dev.yml     # develop -> dev.dominio.com
│   └── deploy-main.yml    # main -> producción (public_html)
├── wp-content/
│   ├── themes/
│   ├── plugins/
│   └── mu-plugins/
└── db/
    └── backup.sql          # dump de producción (ignorado por git)
```

## 1. Preparar Hostinger

1. hPanel → Avanzado → **SSH Access** → actívalo y copia el host/puerto/usuario.
2. Genera un par de claves SSH en tu máquina y añade la **pública** en hPanel (SSH Access → Manage SSH Keys).
3. hPanel → **Dominios/Subdominios** → crea `dev.tudominio.com` apuntando a una carpeta **distinta** de `public_html`, ej: `domains/tudominio.com/dev_public_html`.
4. hPanel → **Bases de datos** → crea una segunda base de datos MySQL solo para `dev` (no reutilices la de producción).
5. Instala WordPress "limpio" en esa carpeta dev (mismo core, mismo PHP que producción) — el core NO se versiona en Git, solo `wp-content`.

## 2. Migrar el contenido actual a Git

```bash
ssh usuario@host -p PUERTO
wp db export backup.sql   # dentro de public_html en el servidor

# desde tu máquina local:
rsync -avz -e "ssh -p PUERTO" usuario@host:~/domains/tudominio.com/public_html/wp-content ./wp-content
scp -P PUERTO usuario@host:~/domains/tudominio.com/public_html/backup.sql ./db/backup.sql

git init
git add .
git commit -m "Migración inicial desde Hostinger"
git branch develop
```

## 3. Levantar el entorno local (réplica de producción)

```bash
cp .env.example .env      # rellena las credenciales
docker compose up -d

# Ajusta las URLs tras la primera importación:
docker compose exec wpcli wp search-replace 'https://tudominio.com' 'http://localhost:8080' --all-tables
```

Sitio local: `http://localhost:8080` · phpMyAdmin: `http://localhost:8081`

## 4. Flujo de trabajo diario

```bash
git checkout develop
git checkout -b feature/nombre-del-cambio

# trabajas en VS Code + Claude Code, probando en localhost:8080
git push origin feature/nombre-del-cambio
# → abres PR contra develop
```

Al hacer **merge a `develop`** → `deploy-dev.yml` sincroniza `wp-content/` a `dev.tudominio.com` automáticamente. Revisas ahí con calma.

Cuando esté aprobado, PR **`develop` → `main`** → al mergear, `deploy-main.yml` sincroniza a `public_html` (producción). Si activaste "Required reviewers" en el environment `production`, GitHub pedirá tu aprobación manual justo antes de tocar el sitio real.

## 5. Secrets a configurar en GitHub (Settings → Secrets and variables → Actions)

| Secret | Ejemplo |
|---|---|
| `HOSTINGER_HOST` | `123.45.67.89` |
| `HOSTINGER_SSH_PORT` | `65002` |
| `HOSTINGER_SSH_USER` | `u123456789` |
| `HOSTINGER_SSH_PRIVATE_KEY` | contenido de tu clave privada |
| `DEV_REMOTE_PATH` | `/home/u123456789/domains/tudominio.com/dev_public_html` |
| `PROD_REMOTE_PATH` | `/home/u123456789/domains/tudominio.com/public_html` |

## Notas importantes

- `wp-content/uploads/` **no se despliega por Git** (son binarios pesados y cambian por uso normal del sitio, no por desarrollo). Sincronízalos aparte y solo de producción → dev, nunca al revés.
- El deploy a `main` excluye `uploads/` (`--exclude=uploads/`) precisamente para no pisar los medios reales de producción.
- Ajusta la versión de PHP en `docker-compose.yml` para que coincida exactamente con la de Hostinger (hPanel → tu sitio → PHP Configuration).
