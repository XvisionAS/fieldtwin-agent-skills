---
name: create-fieldtwin-integration
description: Create, scaffold, deploy, or update a FieldTwin integration, as a single static index.html page or a full repository (web app, manifest, Account Settings, Docker, Helm, Environment Modules, Tilt, devops.sh, build-pipeline.js). Use when starting an integration, choosing between the two shapes, deploying or publishing a static integration to a FieldTwin instance that hosts integrations, giving a static integration an API key that FieldTwin stores, or promoting a prototype to a deployable repository.
license: ISC
metadata:
  author: FutureOn AS
  version: "0.16.0"
---

# Create FieldTwin integrations

Build the smallest thing that works. Use `develop-fieldtwin-integration` for the bridge, manifest
protocol, JWT lifecycle, messages, and protocol tests; its rules apply to both shapes.

On first use in a task, run `node <skill-dir>/scripts/check-update.mjs`. If it finds a newer
release, tell the user the installed and available versions and the update command for
their installer. Continue if the check is unavailable. Install updates only on request.

## Choose the shape first

Recommend a shape with the reason, ask once, and proceed with it if the user does not care.

- **Single page**: one `index.html` on any static host, with no build, Docker, Helm, or Tilt. Fits
  a demo, prototype, internal tool, or panel that only reads host events and calls the FieldTwin
  API with the host-issued token.
- **Full repository**: required for a credential vault of its own, per-user credentials, an OAuth
  flow, inbound webhook,
  automation `readUrl`/`invokeUrl`, `dynamicPagesUrl` endpoint, Account Settings provider
  administration, persistence, background worker, Kubernetes or build-bot deployment, or
  server-side JWT verification.

An API key for a remote API does not rule out a single page: FieldTwin stores the key for the
account and sends the request itself, and non-secret setup lives in `vendorAttributes` of the
account or project. Read [integration secrets](references/integration-secrets.md) and generate the
settings page it describes.

To promote a single page later, create the repository and move the page into it; the bridge,
message, and API code carry over.

## Deploy to FieldTwin hosting

When the user asks to deploy, publish, or update a static integration on a FieldTwin instance that
hosts integrations, read [hosted integrations](references/hosted-integrations.md) and use
`scripts/ft-integrations.mjs`. Deploy only through this script, even when it fails: never upload,
create, or edit the integration through FieldTwin Admin or by driving a browser. An integration
that needs a backend cannot be hosted this way; one that only needs an API key can.

## Single page

- Write one `index.html` with inline `<style>` and an inline ES module. Load libraries from a
  pinned CDN `<script src>`. Add a build step only on request.
- Register the message listener in the first inline script in `<head>`, so the one-shot `loaded`
  event cannot arrive first.
- Ship `manifest.json` next to the page as the only other file. Set `useGET: true`, because static
  hosts answer the default POST load with 405, and `noURLParams: true`, initializing from `loaded`.
- On FieldTwin hosting, use relative manifest URLs and a folder holding only public files.
  Elsewhere, use absolute URLs and `Access-Control-Allow-Origin: *` on the manifest.
- Serve over HTTPS, with HTTP only in explicit local development. Prefer a host that can set CSP
  `frame-ancestors` to the exact FieldTwin origins. Otherwise anyone can embed the page and the
  bridge's exact origin and source checks are the only trust boundary.
- Validate manifest GET and OPTIONS cross-origin, `useGET` loading, iframe and pop-out lifecycle,
  origin and source rejection, token refresh, the authenticated API boundary, and teardown.

## Full repository

Read [repository and deployment](references/repository-and-deployment.md) before editing; it holds
the tree, every contract, and the validation matrix. Inspect one current integration for local
conventions without copying obsolete secrets, generic image names, or unneeded ConfigMaps.

- Choose a lowercase hyphenated slug such as `equipment-insights`. Define the Helm release,
  namespaces, DNS domain, service names, and ports once and reuse them.
- Use the latest stable release of the chosen framework. For SvelteKit, use Svelte 5,
  `adapter-node`, and a Node production server. Keep framework code in `fullstacks/main/` and
  orchestration at the root.
- Helm is the only deployment path. Tilt, `devops.sh`, and CI build the same Dockerfile and image.
  `devops.sh` exposes build, push, deploy, render, lint, status, logs, restart, and teardown.
- Use least-privilege service accounts, no default service-account token on the web pod,
  restricted pod security, and immutable image tags or digests in shared environments.
- For automations, send `automationDescriptor` after `loaded`, serve the declared `readUrl` and
  `invokeUrl` over HTTPS with FieldTwin JWT verification, and signal attribute changes from the
  backend with `POST /automation/event`. See the develop skill's automation recipe.
- Keep tokens, account IDs, and project IDs out of URLs, logs, storage, and analytics.
- Before handoff, produce the validation matrix evidence and state any live-cluster, registry,
  database, or migration check that was not run.

## Handoff

Report the shape and why. For a single page: the file, manifest URL, static host, header
situation, and what would force a promotion. For a repository: component-to-image mapping, module
behavior, bootstrap Secrets, the Account Settings provider boundary, callback and webhook
endpoints, validation results, local start and deploy commands, and any migration step.
