# Repository and deployment reference

Use this reference to create or review the standard deployable repository surface. Adapt names and omit components the integration does not need; keep one build and deployment path.

## Canonical tree

```text
integration-repository/
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── Tiltfile
├── devops.sh
├── build-pipeline.js
├── modules/
│   ├── localdev
│   ├── dev
│   └── shared-environment.example.com
├── helm/integration/
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── values.schema.json
│   └── templates/
└── fullstacks/main/
    ├── Dockerfile
    ├── .dockerignore
    ├── package.json
    ├── package-lock.json
    ├── .env.example
    ├── migrations/
    ├── src/
    └── tests/
```

The component key `main` is an orchestration interface, not an acceptable global image name. Map it once:

```text
build component: main
source directory: fullstacks/main
OCI repository: equipment-insights-main
Helm workload: equipment-insights-main
```

## Root package contract

Use root scripts as stable developer entrypoints:

| Script | Purpose |
| --- | --- |
| `setup` | Install application dependencies. |
| `start` | Start Tilt for the loaded module. |
| `start:app` | Run the built Node application directly. |
| `build` / `build:all` | Build the application and optional worker. |
| `check` | Run framework and type diagnostics. |
| `lint` | Run formatting and static lint. |
| `test:unit` | Run deterministic unit tests once. |
| `tilt-down` | Remove resources managed by the Tilt session. |

Do not make `npm start` silently run a different deployment path than the rest of the team.

## Environment Modules contract

Modules may define:

- build target and tag strategy;
- image registry;
- Kubernetes context, control namespace, runtime namespace, and build namespace;
- Helm release and DNS domain;
- worker enablement;
- pull-secret names; and
- non-secret application settings encoded as Helm values.

Modules must not contain credentials. A local module should run without placeholder cluster objects. If it disables the worker, the rendered chart must also omit worker Deployments, worker service accounts, worker RBAC, worker namespaces, build quotas, and credential Secret references.

## Docker contract

Use stages for dependencies, development, build, and production where the stack benefits from them. The production image should:

- contain only production dependencies and compiled outputs;
- run as an unprivileged fixed UID/GID;
- listen on the documented container port;
- support a read-only root filesystem with explicit temporary mounts;
- contain both web and worker outputs when both use the same image; and
- expose a health check or work with Kubernetes HTTP probes.

Keep package-lock files synchronized and prefer deterministic installation such as `npm ci`.
Production pods should use a read-only root filesystem. A local Vite/Tilt development pod may set
it writable when live sync, Vite's temporary config bundle, or dependency installation writes under
the application directory; keep that exception in the local module rather than weakening shared
environments. Give the local development pod enough memory for dependency optimization and live
transforms; do not assume production server limits are sufficient for a development toolchain.

## Helm contract

The chart should render:

- web Deployment, Service, Ingress, optional disruption budget, and web service account;
- optional worker Deployment and only its required service account/RBAC;
- optional build/runtime namespace resources only when the worker is enabled;
- probes, resource requests/limits, security contexts, image pull secrets, and labels; and
- direct environment entries plus an optional credential Secret reference.

Avoid required ConfigMaps for plain environment variables. Use a ConfigMap only when configuration has an independent lifecycle or must be mounted as a file. Never render empty `envFrom` entries.

## FieldTwin HTTP and CORS contract

FieldTwin administrators load a manifest from a different origin. Treat CORS as part of the
manifest contract rather than a development-server option:

- derive one exact public origin from the environment's ingress hostname and TLS mode, then use it
  for the manifest page, icon, dynamic-page endpoint, OAuth callbacks, webhooks, and worker config;
- allow an explicit HTTP-only local mode such as Tilt/minikube, but require HTTPS for shared and
  production environments; switch the ingress SSL redirect and generated scheme together;
- never force `https://` inside a manifest builder when Helm has selected an HTTP ingress.

- serve the manifest over HTTPS with `GET`, `Content-Type: application/json`, and an `OPTIONS`
  response;
- for a public, credential-free manifest, return `Access-Control-Allow-Origin: *` and allow
  `GET, OPTIONS` plus the request headers needed by the importer; a wildcard header grant is safe
  only for this credential-free public endpoint. Otherwise validate and echo an exact origin;
- verify the headers using a request with the actual FieldTwin Admin `Origin` through the deployed
  ingress, because an ingress or proxy can alter application response headers.

Dynamic pages are authenticated and need a narrower browser CORS policy:

- allow `POST, OPTIONS` and explicitly allow `Authorization, Content-Type`;
- echo only an exact configured FieldTwin frontend origin and include `Vary: Origin`;
- do not add `Access-Control-Allow-Credentials` unless the protocol actually uses browser cookies,
  and never combine credentialed requests with wildcard origin;
- keep CORS independent from `Content-Security-Policy: frame-ancestors`: CORS controls browser HTTP
  access, while `frame-ancestors` controls which origins may embed the integration.

Add server-hook or endpoint tests for manifest GET/preflight, an allowed dynamic-page origin, a
look-alike rejected origin, required request headers, and an unrelated route that receives no CORS
grant. Do not rely on Vite's development CORS setting as proof of production behavior.

## FieldTwin iframe embedding contract

The integration page is the iframe child. Its production response must permit only the configured
exact FieldTwin frontend origins with `Content-Security-Policy: frame-ancestors ...`. Do not send
`X-Frame-Options: DENY` or `X-Frame-Options: SAMEORIGIN`; those legacy values override the intended
cross-origin embedding behavior in browsers that enforce them.

The standard explicitly enabled HTTP-only local mode may omit `frame-ancestors`, matching existing
FutureOn local integrations. Keep the rest of the CSP and the application-level exact-origin/source
checks. HTTPS, shared, and production modes must retain the exact `frame-ancestors` allowlist and
fail closed when it is unavailable.

Local HTTP changes the parent message origin as well as the child iframe URL. The local module must
configure the actual exact HTTP FieldTwin parent origin. Permit that HTTP entry in the client bridge
and authenticated CORS validation only when the same explicit deployment TLS switch selects local
HTTP. Never derive trust from `event.origin`, `document.referrer`, the request host, or a wildcard;
shared and production modes must reject HTTP parent origins.

Classify a browser block before changing policy:

- a child response CSP `frame-ancestors` or `X-Frame-Options` error belongs to the integration;
- a parent response CSP `frame-src` error belongs to the FieldTwin deployment;
- an HTTPS FieldTwin page refusing an HTTP integration is mixed-content enforcement and cannot be
  repaired with child CORS or CSP headers. Use local HTTPS, an approved FieldTwin proxy path, or a
  clearly documented local-only browser exception.

Test the built server through ingress in both modes. Inspect the final integration-page response,
not only application middleware: local HTTP must have no child iframe-denial header, while HTTPS
must contain only the configured exact FieldTwin origins. Then load the page in a real FieldTwin
iframe and confirm the browser console has no iframe-policy error.

## FieldTwin bootstrap contract

FieldTwin posts the initial `loaded` event after the integration document loads and does not wait
for a client readiness handshake. Install a minimal receiver before the document-load boundary,
before framework components mount or hydrate. SvelteKit's `hooks.client` belongs to its dynamically
imported client graph and is not parser-time; a fast iframe can finish loading and receive
FieldTwin's one-shot post before that hook runs. Load a small module from `app.html` before
`%sveltekit.body%`, then let the later bridge import and drain that same module instance.

When the full bridge is constructed later, preserve early `loaded` candidates in a bounded
module-closure queue only. Register the bridge listener first, remove the temporary listener, drain
every candidate through the same exact-origin, expected-source, and payload validation, then clear
the queue. Never put the token or queued message on `window`, in a Svelte store, browser storage,
DOM, logs, or serialized hydration state.

Require only the bootstrap fields the current surface uses. Project pages that call the FieldTwin
API need a valid `backendUrl`, `APIVersion`, and relevant project scope. Account Settings can be
account-scoped and may receive only the integration token plus UI hints. Such a page can
authenticate same-origin control-plane calls with the in-memory token, while its project API
helper must fail clearly until API context is available.

When `backendUrl` is present, validate its scheme under the same explicit deployment TLS mode as
the trusted parent. A local HTTP FieldTwin host commonly supplies an HTTP backend URL with a base
path such as `/backend`; allow it only in explicit local mode and preserve that path. Reject HTTP in
shared or production mode.

## Tilt contract

Tilt should:

1. require a selected context and namespace;
2. use a program-qualified image repository;
3. build the application Dockerfile with the module-selected target;
4. pass the same image repository and tag to Helm;
5. parse module Helm values without losing string intent;
6. register only resources the chart renders;
7. create only enabled namespaces; and
8. live-sync only paths compatible with the selected Docker stage.

Local defaults must be safe if an old terminal lacks a newly introduced module variable. For example, a minikube development context should default an optional credential-dependent worker to disabled.

## Build-bot contract

Keep `build-pipeline.js` declarative. Its component list calls:

```text
devops.sh build <component>
devops.sh push <component>
devops.sh deploy
```

`devops.sh` owns tag generation, component-to-image mapping, Docker paths, Helm values, namespace setup, and registry-secret handling. The pipeline must not reimplement them.

## Validation matrix

| Surface | Required evidence |
| --- | --- |
| Local module | One expected web workload, program-qualified image, direct non-secret env, no missing object references. |
| Worker module | Worker plus scoped RBAC/limits, external credential Secret reference, build/runtime configuration. |
| Helm | Lint succeeds; each module renders; schema rejects invalid types. |
| Kubernetes | Client dry-run accepts every rendered object. |
| Tilt | Evaluation names the expected Dockerfile, OCI repository, and Kubernetes resources. |
| Application | Format, lint, type checks, tests, web build, and worker build pass. |
| Container | Image builds and starts as non-root when a Docker daemon is available. |
| FieldTwin | Manifest GET/preflight works cross-origin; dynamic-page CORS is exact-origin and permits authorization; local HTTP names and accepts only its exact parent origin under the explicit mode flag; HTTPS rejects HTTP parents and uses exact `frame-ancestors`; `loaded` sent before framework mount is recovered and revalidated; Account Settings accepts a minimal trusted bootstrap; `tokenRefresh` works; dynamic pages are authenticated and tenant-scoped. |

Do not mutate a shared or production cluster merely to prove rendering. Deploy only when the user asks or the existing workflow clearly authorizes it.
