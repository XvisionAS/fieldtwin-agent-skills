# FieldTwin integration development workflow

Use this checklist for implementation and debugging. It connects the repository, local Kubernetes,
browser embedding, FieldTwin lifecycle, and server authentication into one path. Read the focused
references linked below when changing their contracts.

## 1. Establish the deployment contract

Before editing:

- read the deployed FieldTwin integration contract and this skill's
  [documentation map](documentation-map.md);
- inspect one maintained integration from the same organization for repository conventions;
- identify every FieldTwin surface: project tab, Account Settings, dynamic pages, background page,
  and pop-out;
- record local and shared public origins, the exact FieldTwin parent origins, TLS mode, namespaces,
  image repositories, persistence, and required external Secrets; and
- decide whether server JWT verification uses strict JWKS or an explicit legacy public-key profile.

Treat a peer repository as a convention source, not a template to copy blindly. Reject stale
ConfigMap references, generic image repositories, hard-coded HTTPS URLs, database dependencies the
integration does not need, and weaker iframe or message policies.

When creating the repository, also use `create-fieldtwin-integration` and its deployment reference.
Keep these standard entrypoints aligned:

```text
npm start -> Tiltfile -> Dockerfile -> Helm chart -> Kubernetes
build-pipeline.js -> devops.sh build/push/deploy -> same Dockerfile and Helm chart
Environment Module -> Tilt/Helm values -> direct pod environment
```

Use a program-qualified OCI repository such as `equipment-insights-main`; `main` may be a build-bot
component key but is not a sufficient image name. Pass ordinary configuration directly as Helm
environment values. Require a ConfigMap only for a real independently managed or mounted file.

If the application intentionally stores configuration as JSON, mount a persistent directory and
keep all state beneath that configured root. Use atomic replace, bounded file sizes, explicit
schema validation, safe names, and process-safe locking. Do not retain SQL migrations, database
drivers, connection variables, or readiness checks after selecting file-backed persistence.

## 2. Make environment mode control every public URL

Define one exact public application origin per module. Generate the manifest URL, integration URL,
icon URL, dynamic-pages URL, settings URLs, OAuth callbacks, webhooks, and worker-facing URLs from
that value.

An explicit local mode may use HTTP. In that mode, change all related settings together:

- public application origin uses `http://`;
- ingress TLS and SSL redirect are disabled;
- Vite permits the exact local ingress hostname through `server.allowedHosts`;
- the exact HTTP FieldTwin parent is injected into the origin allowlist;
- the bridge may accept that parent and an HTTP `backendUrl`; and
- server key retrieval may use HTTP only when the same local-mode flag is enabled.

Shared and production modules must require HTTPS. Never infer local mode from a request hostname,
incoming message, referrer, or URL scheme.

Render every module before starting Tilt. Inspect the rendered image names, pod environment,
volumes, Secrets, optional worker resources, ingress TLS, and generated public origin. A local pod
must not reference a ConfigMap or Secret that the selected module does not render or provision.

## 3. Expose the correct FieldTwin surfaces

Serve a credential-free manifest with `GET` and `OPTIONS`, JSON content type, and public CORS. Build
all URLs from the configured public origin so the icon and page scheme match the active ingress.
See [manifest-and-loading.md](manifest-and-loading.md) for exact endpoint and iframe policy.

Put account-wide integration setup under `accountSettingsUrl`, not integration user settings.
Reserve user settings for individual preferences. An Account Settings page must still authorize
mutations on the server; a visible edit control or `canEdit` hint is not authorization.

Use `dynamicPagesUrl` to declare tenant-visible deployed applications. The endpoint must:

- authenticate the FieldTwin bearer token;
- derive tenant scope only from verified claims;
- return only ready and available deployments;
- use stable non-sensitive page paths and deployment URLs derived from trusted records;
- omit tokens, account identifiers, and project identifiers from iframe URLs; and
- implement exact-origin authenticated CORS for `POST` and `OPTIONS` with
  `Authorization, Content-Type` allowed and `Vary: Origin` returned.

## 4. Permit the iframe without weakening message trust

For HTTPS deployments, the integration response must use `Content-Security-Policy:
frame-ancestors` with the exact configured FieldTwin frontend origins. Do not emit
`X-Frame-Options: DENY` or `SAMEORIGIN`. An explicit HTTP-only local mode may omit only the child
`frame-ancestors` restriction; exact message checks remain mandatory.

Classify browser errors before changing policy:

| Browser failure | Owning layer | Correct action |
| --- | --- | --- |
| Child `frame-ancestors` or `X-Frame-Options` block | Integration response | Fix the built server or ingress response. |
| Parent `frame-src` block | FieldTwin host | Update the FieldTwin deployment policy. |
| HTTPS parent rejects HTTP child | Browser mixed-content policy | Use HTTPS, an approved proxy, or a documented local-only exception. |
| Manifest or dynamic-page CORS error | Endpoint or ingress | Fix that endpoint's production preflight/response headers. |

CORS does not grant iframe permission, and iframe headers do not grant cross-origin HTTP access.

## 5. Capture `loaded` before SvelteKit starts

FieldTwin posts its one-shot `loaded` message from the parent iframe-load path and does not wait for
an integration readiness handshake. SvelteKit dynamically imports `hooks.client`; a listener there,
in `onMount`, or in a component can start too late.

For SvelteKit:

1. load a small parser-time module from `app.html` before `%sveltekit.body%`;
2. let it capture only a bounded number of top-level `event: 'loaded'` candidates in its private
   module closure;
3. create the full bridge, attach its live message listener, then import and drain the same module;
4. run every queued candidate through the normal exact origin, expected parent/opener, and payload
   validation; and
5. erase the queue and remove all listeners on teardown.

Never place the candidate, token, or queue on `window`, in a Svelte store, storage, the DOM, logs,
analytics, or hydration data. See [bridge-and-api.md](bridge-and-api.md) for the bridge pattern.

Validate only fields required by the active surface. Project pages may require `backendUrl`,
`APIVersion`, scope, and readiness. Account Settings can receive a top-level token and UI context
without project API fields. Accept that trusted bootstrap for same-origin authenticated requests,
while making FieldTwin project API helpers fail clearly until their context exists.

When `backendUrl` is present, validate it using the deployment TLS policy and preserve a base path
such as `/backend`. Reducing it to its origin silently builds the wrong API URL.

## 6. Select the matching server JWT profile

Do not assume every FieldTwin deployment publishes JWKS or standard issuer/audience claims.

| Profile | Required verification |
| --- | --- |
| JWKS | Exact issuer, audience, asymmetric algorithm allowlist, signature, expiry, stable subject, and tenant claim. Use exactly one pinned inline or HTTPS JWKS source. |
| Legacy public key | Explicit profile selection, exact key endpoint, no redirects, bounded response/time/cache, endpoint algorithm matching the configured asymmetric allowlist and JWT header, signature, expiry, stable subject, and tenant claim. |

A common legacy endpoint returns JSON containing a PEM `publicKey` and `algorithm` at a path such as
`/backend/token/publicKey`; it is not a JWKS document. Legacy tokens may omit issuer and audience,
so omit those checks only in the explicit public-key profile. Configure claim names for the actual
deployment, commonly `userId` for subject and `accountId` for tenant. Treat a top-level account-admin
claim as authority only when its exact name is explicitly configured. Keep nested rights validation
when the deployed contract provides it.

Permit an HTTP key endpoint only in explicit local mode. Never forward the integration bearer token
to the key endpoint, follow redirects, accept a key-selected algorithm outside the allowlist, decode
without verifying, or expose authentication details in error messages.

## 7. Run and verify the real path

Load the local Environment Module, install dependencies, then use the root `npm start`. It must start
Tilt; keep a separate command for running the built application directly. Confirm Tilt builds the
program-qualified image and applies the same Helm chart used by deployment automation.

Verify through the deployed ingress, not only through Vite:

1. manifest `GET` and `OPTIONS` with the actual FieldTwin Admin `Origin`;
2. icon and every generated URL use the active HTTP/HTTPS scheme;
3. integration response has the correct iframe headers and no blocking `X-Frame-Options`;
4. Account Settings or project iframe loads in FieldTwin;
5. the parser-time capture asset loads before the framework client graph;
6. the first authenticated integration endpoint returns success after `loaded`;
7. dynamic-page preflight and authenticated response work and are tenant-scoped;
8. `tokenRefresh` changes the bearer used by the next request; and
9. refresh, remount, pop-out, and teardown do not leak or duplicate listeners.

Do not log the `loaded` payload or token while debugging. Use request chronology, status codes,
configured non-secret origins, response headers, and synthetic tests.

## Diagnostic matrix

| Symptom | Inspect first | Frequent cause |
| --- | --- | --- |
| Page remains “Connecting” and no integration API request appears | Parser/bootstrap request order and bridge acceptance | `loaded` arrived before framework listener; wrong exact origin/source; HTTP parent or backend rejected. |
| Page advances but the first authenticated request is 401/500 | Server auth profile and non-secret verifier environment | JWKS configured for a PEM endpoint; wrong claims or algorithm; missing local auth environment. |
| Manifest imports fail | Manifest response through ingress | Missing production CORS/preflight; testing only Vite. |
| Icon or iframe URL fails only locally | Generated public origin | Individual URL hard-coded to HTTPS while Tilt ingress is HTTP. |
| Browser refuses to embed | Console error and final child/parent headers | Wrong `frame-ancestors`, blocking `X-Frame-Options`, parent `frame-src`, or mixed content. |
| Pod reports a missing ConfigMap | Rendered workload and selected module | Chart retained `envFrom` although values are direct environment entries. |
| Pod uses a generic image name | Tilt, `devops.sh`, and Helm mapping | Build component key leaked into the OCI repository name. |
| Configuration disappears after restart | Volume mount and file-store root | JSON store writes outside the persistent mount or performs non-atomic writes. |

## 8. Completion gate

Do not hand off until the relevant evidence is green:

- format, lint, framework/type checks, unit tests, production web and worker builds;
- Helm lint and rendered modules with no dangling object references;
- Tilt evaluation with expected image/workload names;
- parser-order, wrong-origin/source, token-refresh, local-HTTP, Account Settings minimal-bootstrap,
  server-auth-profile, CORS, iframe-policy, dynamic-page tenant-scope, and teardown tests; and
- one live iframe path through ingress, including the first authenticated request.

If a live check cannot run, state exactly which boundary remains unverified. Use
[security-and-testing.md](security-and-testing.md) for the complete security and protocol matrix.
