# cb-wp harness

A small automation harness that verifies colibridge.es deploys across environments (local Docker, dev, prod). Built on top of `@playwright/test` — the harness does not implement its own test runner, it orchestrates Playwright and records each run as a session.

## Setup

```
cd harness
npm install
npx playwright install chromium
```

## Usage

```
node cli.js run --env=<local|dev|prod> [--suite=smoke|integration|all] [--confirm]
```

- `--env` — required. `local` targets `http://localhost:8090` (the Docker stack), `dev` targets `https://dev.colibridge.es`, `prod` targets `https://colibridge.es`.
- `--suite` — defaults to `smoke`. `integration` runs WP-CLI based checks (local only). `all` runs both.
- `--confirm` — required to target `prod`, as a safety gate against accidental runs against production.

Examples:

```
node cli.js run --env=local --suite=all
node cli.js run --env=dev --suite=smoke
node cli.js run --env=prod --suite=smoke --confirm
```

## Sessions

Every run creates an immutable session under `sessions/<timestamp>_<env>_<suite>/`:

- `session.json` — summary (environment, git commit, pass/fail counts, exit code, paths).
- `log.txt` — raw output of the run.
- `artifacts/` — Playwright's HTML report, JSON report, and any screenshots/traces captured on failure.

`sessions/` is gitignored; nothing in it is meant to be committed.

## Adding tests

- `tests/smoke/*.spec.js` — HTTP/browser checks that should pass against any environment (local, dev, and eventually prod read-only).
- `tests/integration/*.spec.js` — WP-CLI based checks; guard these with `test.skip(process.env.HARNESS_ENV !== 'local', ...)` since they only run safely against the local Docker stack.
- `fixtures/key-pages.json` — single source of truth for which pages count as "key pages" for the smoke suite.

Tests are plain Playwright specs — no harness-specific API to learn.
