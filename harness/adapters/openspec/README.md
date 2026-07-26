# OpenSpec adapter (placeholder)

This folder is a reserved seam for a future OpenSpec integration. No code lives here yet.

## Intent

When OpenSpec integration happens, an adapter here would:

- Translate an OpenSpec change/spec identifier into a harness suite/test selection.
- Invoke the harness through its public CLI (`node harness/cli.js run ...`) — never by importing `harness/core/*` directly.
- Read the resulting `sessions/<id>/session.json` and translate it into whatever verification format OpenSpec expects.

## Why this works without coupling today

- The CLI is the harness's only supported entry point, so an adapter is just another caller of it.
- `session.json` is a plain, versioned (`harnessVersion`) JSON file — a stable contract to read against.
- `environments.js` and `fixtures/*.json` are plain data, not logic, so they could be generated or overridden from OpenSpec definitions later without touching `core/`.

Building the actual adapter is out of scope until OpenSpec integration is prioritized.
