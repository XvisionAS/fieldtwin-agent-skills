# Deploying with Vibe Deploy

Some FieldTwin deployments offer **Vibe Deploy**, an integration that builds and runs small
integrations for an account and lists them as FieldTwin pages. It removes the Docker image, Helm
chart, Environment Modules, Tilt, and build pipeline from a small integration: the integration is
just its application folder. Use it when the user's FieldTwin offers it and the integration needs
nothing from the full-repository list in section 0 of the skill except a small server.

## What Vibe Deploy accepts

There is no Dockerfile. The platform builds one of two shapes from a zip or a Git folder:

| Shape | Detected when | Build | Runtime |
| ----- | ------------- | ----- | ------- |
| Static site | `index.html` in the folder, or a `package.json` with only a `build` script | `npm ci && npm run build` when there is a build script; the first of `dist`, `build`, `out` holding an `index.html` is served | Served by the platform with `Content-Security-Policy: frame-ancestors <FieldTwin origins>` |
| Node.js app | `package.json` with a `start` script | `npm ci`, `npm run build` when present, `npm prune --omit=dev` | `npm start`'s command, run from the folder |

Rules for both shapes:

- Include `package-lock.json` whenever there is a `package.json` with scripts to run. The build uses
  `npm ci`.
- Leave `node_modules`, `.git`, and build output out of the zip; they are dropped or rebuilt.
- No symbolic links: the upload is rejected.
- The application runs as a non-root user with a read-only filesystem and a small `/tmp`. Write
  nothing to the application folder at runtime.
- A Node.js app must listen on `process.env.PORT` (3000) and `process.env.HOST`.

## Configuration the application receives

The platform sets these environment variables; read them instead of hard-coding values:

| Variable | Meaning |
| -------- | ------- |
| `PORT`, `HOST` | Where to listen. |
| `PUBLIC_APP_ORIGIN` | The application's own public origin. |
| `PUBLIC_FIELDTWIN_ORIGINS` | Comma-separated exact FieldTwin origins allowed to embed the page and send `loaded`. |
| `FIELDTWIN_AUTH_PROFILE`, `FIELDTWIN_PUBLIC_KEY_URL`, `FIELDTWIN_JWT_ALGORITHMS`, claim names | The integration-JWT verification profile for a server that checks FieldTwin tokens. |

A static page has no server code, so it reads the same values from `/__vibe/config.json`:

```js
const { fieldTwinOrigins } = await (await fetch('/__vibe/config.json')).json();
// Accept `loaded` only from these exact origins, from the parent or opener window.
```

Keep the exact-origin and exact-source checks of the develop skill: the configuration names the
trusted origins, it does not replace the checks. Administrators can add plain, non-secret variables
per application in the console. Never put a secret in source, the zip, or such a variable.

Vibe Deploy lists each running application as a FieldTwin dynamic page itself, so the application
needs no `manifest.json`. It still receives `loaded` and `tokenRefresh` like any integration page.

## Deploying from the agent

An account administrator creates an archive application in the Vibe Deploy console, then creates a
**deploy token** for it under "Deploy from an agent or CI". The token deploys new versions of that
one application and nothing else. Ask the user to put it in an environment variable; never print
it, write it to a file in the repository, or include it in a zip.

```sh
# From the application folder; the zip's top folder may be the application itself.
zip -r ../app.zip . -x 'node_modules/*' '.git/*' 'dist/*'
curl -fsS --data-binary @../app.zip \
  -H "Authorization: Bearer $VIBE_DEPLOY_TOKEN" \
  -H "Content-Type: application/zip" \
  -H "X-File-Name: app.zip" \
  https://vibe-deploy.example.com/api/v1/deploy
```

The response is `{ "releaseId", "application", "statusUrl" }`. Poll the status with the same token
until it finishes, at most every few seconds:

```sh
curl -fsS -H "Authorization: Bearer $VIBE_DEPLOY_TOKEN" "$STATUS_URL"
# { "status": "queued" | "building" | "deploying" | "ready" | "failed",
#   "url": "https://…" when ready, "failureMessage": "…" when failed }
```

Report the `url` when it is `ready`. When it `failed`, `failureMessage` names the fix (for example
a missing `package-lock.json` or start script); fix it locally, run the same checks as before, and
upload again. The administrator can read the full build log and roll back to any earlier release in
the console.

## Validate before uploading

- Static: open `index.html` through a local static server and run the develop skill's protocol
  tests; check the page reads its origins from `/__vibe/config.json` when it has no server.
- Node.js: `npm ci && npm run build && PORT=3000 npm start`, then load the page, and verify it
  binds to `PORT` and writes nothing outside `/tmp`.
- Check the zip: `unzip -l app.zip` shows the application files, no `node_modules`, and no links.
