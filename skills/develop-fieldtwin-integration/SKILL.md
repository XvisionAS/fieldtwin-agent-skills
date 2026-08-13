---
name: develop-fieldtwin-integration
description: Develop, run, debug, test, and review FieldTwin external integrations embedded as custom-tab iframes. ALWAYS use for FieldTwin manifests, Account Settings, dynamic pages, local Tilt or Kubernetes integration debugging, HTTP/HTTPS URL generation, iframe policy, loaded or tokenRefresh lifecycle, FieldTwin JWT verification and API calls, parent/opener postMessage events, customTabId routing, pop-outs, Operation Mode, integration settings, or protocol tests.
license: ISC
metadata:
  author: FutureOn AS
  version: "0.2.6"
---

# Develop FieldTwin Integrations

Build secure, portable integration clients and protocol changes from released FieldTwin contracts. Keep ordinary selection, camera focus, panel navigation, and integration-defined actions separate so user interactions do not acquire surprising side effects.

## Choose the relevant references

Read the public [integration guide](integration/README.md) and [references/documentation-map.md](references/documentation-map.md) first. For implementation, local development, deployment diagnosis, or an integration that remains stuck loading, read [references/development-workflow.md](references/development-workflow.md) next. Then read only what the task needs:

- [references/development-workflow.md](references/development-workflow.md) for the end-to-end repository, Environment Module, Tilt, Helm, browser, bootstrap, server-authentication, and live-debug checklist.
- [references/manifest-and-loading.md](references/manifest-and-loading.md) for manifests, dynamic pages, background behavior, iframe loading, and pop-outs.
- [references/bridge-and-api.md](references/bridge-and-api.md) for a secure browser bridge, `loaded`, `tokenRefresh`, API calls, replies, and teardown.
- [references/message-catalog.md](references/message-catalog.md) for common host-to-integration and integration-to-host envelopes.
- [references/operation-mode.md](references/operation-mode.md) for search, progress, inline actions, double-click, filters, context menus, panels, and time series.
- [references/recipes.md](references/recipes.md) for copy-ready selection, resource-query, settings, notification, and focus recipes.
- [references/security-and-testing.md](references/security-and-testing.md) before implementing message code and before handoff.

When the user's repository also contains an integration guide, read the relevant sections and reconcile them with the current public FieldTwin documentation. A deployed environment's released contract wins over bundled examples. Never infer a new protocol field from naming symmetry.

## Classify the task

Identify which side owns the behavior before editing:

- **Integration client**: consume host events, call the API, render integration UI, publish results or filters, and manage local state.
- **FieldTwin host**: validate, route, render, or execute a documented integration payload.
- **Protocol change**: add or change an event, field, reply, targeting rule, or interaction. Implement every in-scope side, preserve compatible legacy behavior, update public documentation, and add protocol tests.

Trace selection and focus independently. A click may select a resource while a separate explicit action or double-click moves the camera.

## Build the integration in this order

### 1. Establish the trust boundary

- Configure an exact allowlist of approved FieldTwin frontend origins for the target deployment.
- Require HTTPS origins except when the deployment explicitly selects local HTTP mode. In that
  mode, allow only the exact configured HTTP FieldTwin parent origin; do not infer it from the
  message, referrer, request host, or a wildcard.
- Configure the integration page's HTTPS response with CSP `frame-ancestors` for those exact
  origins, and do not emit `X-Frame-Options: DENY` or `SAMEORIGIN`. An explicitly enabled local HTTP
  mode may omit only the child `frame-ancestors` restriction; keep message origin/source checks.
- Accept the initial `loaded` message only from an expected `window.parent` or `window.opener` and an allowlisted exact origin.
- Pin both `event.source` and `event.origin` after bootstrap; reject later messages that do not match both.
- Send only to the pinned host window and exact origin. Never use `*` for credentials, project data, or normal production messages.

### 2. Keep bootstrap state durable and private

- Initialize from the host-sent `loaded` event.
- Register a minimal message receiver before the document-load boundary. FieldTwin does not wait
  for an integration readiness handshake, so a listener installed only from `onMount`,
  `useEffect`, or an asynchronously imported SvelteKit `hooks.client` can miss the one bootstrap
  event. In SvelteKit, install a parser-time capture module from `app.html` before the body.
- When framework setup and the bridge are separate, hand early `loaded` candidates through a
  bounded module-closure queue. Add the bridge listener before draining it, validate every queued
  event through the normal exact-origin/source/payload boundary, then clear the queue.
- Keep the JWT in instance memory. Do not place it in URLs, browser storage, DOM, logs, analytics, errors, or source control.
- Replace the token atomically on `tokenRefresh`; build request headers at call time so future calls use the current token.
- Validate the fields required by the current page instead of assuming every surface has project
  API context. Account Settings can receive a token without `backendUrl`, `APIVersion`, project,
  subproject, or stream; accept that bootstrap for same-origin authenticated control-plane calls
  and fail API helpers explicitly until their API context exists.
- Apply the same explicit TLS/local-development scheme policy to a supplied `backendUrl`. Accept
  exact HTTP only in local mode and preserve any backend base path; never discard `/backend` by
  reducing the trusted URL to its origin.
- Use `window.opener` in a pop-out and `window.parent` in an iframe through one pinned bridge abstraction.
- Remove listeners and cancel pending work during teardown.

### 3. Call the FieldTwin API deliberately

- When the page calls the FieldTwin project API, derive `backendUrl`, `APIVersion`, project scope,
  and the current token from trusted bootstrap state.
- Send `Authorization: Bearer <token>` and let the API enforce resource rights.
- Honor `canEdit` in the integration UI without treating it as a replacement for server authorization.
- Respect API readiness signals and use bounded backoff rather than tight polling.
- Surface user-triggered failures with a useful recovery path.

### 4. Preserve exact message shapes

- Use structured-cloneable plain objects with an `event` string.
- Check whether fields are top-level or nested under `data`; FieldTwin uses both forms.
- Include `customTabId` only where the documented protocol needs it. The host can derive the sending integration from its registered source window.
- Correlate only with documented fields such as `queryId` or `reqId`. Do not invent a request ID that the host will not echo.
- Target integration-specific host messages to the instance that produced the data.

### 5. Validate observable behavior

Test bootstrap, exact origin/source rejection, token replacement, parent and pop-out routing, exact envelopes, correlation, malformed external input, multiple integration instances, and complete teardown. For Operation Mode, test normal click, double-click, keyboard activation, inline actions, clearing, progress completion, and selection without focus.

## Handoff format

Report:

- **Reason**: the integration or protocol problem.
- **Change**: client, host, documentation, and compatibility changes.
- **Validation**: focused tests and the relevant production/manual path.
- **Security**: origin/source policy, credential handling, and cleanup.
- **Migration**: any legacy field retained or behavior integrations must change.
