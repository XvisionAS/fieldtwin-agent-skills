# FieldTwin integration guide

This is the public entry point for developing an external FieldTwin integration. It combines the released integration contract with secure, fictional samples that an agent can adapt to a real integration repository.

The protocol guidance was verified against the FieldTwin integration guide revision 58 on 2026-08-19. A deployed environment's current documented contract takes precedence when it differs.

For an implementation sequence that covers repository conventions, Environment Modules, Tilt,
Helm, local HTTP, iframe loading, server JWT profiles, and live diagnosis, use the
[development workflow](../references/development-workflow.md).

## What an integration is

A FieldTwin integration is a web application rendered in a custom-tab iframe or, when enabled, a pop-out window. The host and integration communicate with structured-cloneable `window.postMessage` envelopes. The host also provides a short-lived JWT and API context after the page loads.

```text
FieldTwin host
├── sends loaded, tokenRefresh, selection, search, and lifecycle events
├── renders integration results, actions, filters, panels, and notifications
└── serves the FieldTwin API using the current integration JWT
        ⇅ exact-origin, exact-source postMessage
Integration page
├── keeps bootstrap state and the JWT in memory
├── calls the FieldTwin API with the current token
├── publishes results and user actions through documented envelopes
└── removes listeners, timers, requests, and pending replies on teardown
```

## Start with the manifest

Serve a stable JSON manifest that requests only the access and browser capabilities the integration
needs. Require HTTPS outside an explicitly HTTP-only local development mode:

```json
{
  "name": "Equipment Insights",
  "url": "https://integration.example/app",
  "logo": "https://integration.example/assets/logo.png",
  "tabPosition": "property-panel",
  "showInDesigner": true,
  "showInOperation": true,
  "resourceTypes": ["stagedAssets"],
  "projectWideAccess": false,
  "allowAccessToClipboard": false,
  "allowPopout": true
}
```

Use [manifest-and-loading.md](../references/manifest-and-loading.md) for every supported placement and flag, dynamic page endpoints, background instances, GET versus POST loading, and pop-out topology.

## Bootstrap securely

FieldTwin sends `loaded` after the integration document loads. The integration does not need to announce readiness first.

Register the receiver before the document-load boundary, before a framework mounts or hydrates.
FieldTwin does not wait for a client readiness handshake, so starting in `onMount`, `useEffect`, or
SvelteKit's asynchronously imported `hooks.client` can miss the bootstrap. In SvelteKit, load a
parser-time capture module from `app.html` before the framework body/bootstrap. If the full bridge
starts later, preserve only a bounded number of early `loaded` candidates in that module closure,
then revalidate and drain them after the bridge's normal listener is attached.

Before accepting `loaded`:

1. Require `event.origin` to equal an approved FieldTwin frontend origin.
2. In an iframe, require `event.source === window.parent`.
3. In a pop-out, require `event.source === window.opener`.
4. Validate the fields used by the integration.
5. Pin that exact source window and exact origin for the lifetime of the bridge.

Keep `token` only in instance memory. Replace it atomically when a trusted `tokenRefresh` arrives and build every API `Authorization` header at request time.

Validate only the bootstrap fields the current surface needs. Account Settings may omit project API
context; accept a trusted token for same-origin authenticated control-plane calls, while keeping the
FieldTwin project API helper unavailable until `backendUrl` and `APIVersion` are present.
Validate any supplied `backendUrl` under the same explicit TLS/local scheme policy as the parent
and preserve its base path when building API URLs.

```javascript
const allowedOrigins = new Set(['https://fieldtwin.example'])
let hostWindow = null
let hostOrigin = null
let token = null

function expectedHostWindow() {
  if (window.parent !== window) {
    return window.parent
  }
  return window.opener && !window.opener.closed ? window.opener : null
}

function receiveFieldTwinMessage(event) {
  const message = event.data
  if (!message || typeof message !== 'object' || typeof message.event !== 'string') {
    return
  }

  if (!hostWindow) {
    if (
      message.event !== 'loaded' ||
      !allowedOrigins.has(event.origin) ||
      event.source !== expectedHostWindow() ||
      typeof message.token !== 'string'
    ) {
      return
    }

    hostWindow = event.source
    hostOrigin = event.origin
    token = message.token
    return
  }

  if (event.source !== hostWindow || event.origin !== hostOrigin) {
    return
  }

  if (message.event === 'tokenRefresh' && typeof message.token === 'string') {
    token = message.token
  }
}

window.addEventListener('message', receiveFieldTwinMessage)
```

For a complete dependency-free bridge, authenticated API helper, reply correlation, API-path validation, and cleanup, use [bridge-and-api.md](../references/bridge-and-api.md).

## Preserve the exact message contract

Every message has an `event` string, but payload placement varies by event. Do not move a documented top-level field under `data`, or the reverse.

Common host-to-integration events include:

| Event | Purpose |
| --- | --- |
| `loaded` | Bootstrap token, API context, project scope, integration identity, and initial state. |
| `tokenRefresh` | Replace the in-memory JWT. |
| `select` / `unselect` | Notify the integration when the host selection changes or clears. |
| `operationSearch` | Ask integrations for Operation Mode results or clear existing results. |
| `operationSearchAction` | Run an integration-defined inline result action. |
| `operationSearchDoubleClick` | Run an integration-defined double-click action. |
| `visualFilterToggle` | Notify the owning integration that a filter changed. |
| `getTimeSeriesData` | Request samples for a registered series and viewport window. |

Common integration-to-host events include:

| Event | Purpose |
| --- | --- |
| `select` | Select graph resources; use `focusSelection: false` for selection only. |
| `zoomOn` | Explicitly move the camera to one resource. |
| `getResources` | Query resources by ID using canonical plural `resourceType` values. |
| `toast` | Show a user notification. |
| `operationSearchResults` | Publish grouped Operation Mode results and actions. |
| `operationSearchProgress` | Publish or clear progress for the current search. |
| `visualFilteringUpdate` | Register integration-owned visual filter chips. |
| `timeSeriesInfo` / `timeSeriesData` | Register a series and return correlated binary samples. |

Use [message-catalog.md](../references/message-catalog.md) for bidirectional envelopes,
[integration-to-host-events.md](../references/integration-to-host-events.md) for the complete host-handler matrix and exact resource-type vocabulary, and [recipes.md](../references/recipes.md) for copy-ready flows.

## Operation Mode sample

Result rows can define nested items, Font Awesome inline actions, and a separate double-click action. Stable IDs are required for interactive results.

```javascript
bridge.send({
  event: 'operationSearchResults',
  data: {
    customTabId: context.customTabId,
    results: [
      {
        id: 'equipment',
        label: 'Equipment',
        items: [
          {
            id: 'equipment:asset-42',
            label: 'Injection pump P-42',
            linkedGraphResources: [{ type: 'stagedAsset', id: 'asset-42' }],
            actions: [
              {
                id: 'focus',
                label: 'Focus',
                icon: 'faLocationCrosshairs',
                action: 'focusResource',
                args: { type: 'stagedAsset', id: 'asset-42' }
              }
            ],
            doubleClickAction: {
              action: 'openEquipment',
              args: { equipmentId: 'asset-42' }
            }
          }
        ]
      }
    ]
  }
})
```

Handle `operationSearchAction` and `operationSearchDoubleClick` only after the normal origin/source checks. Keep selection and camera focus distinct: ordinary row selection should not zoom unless the interaction explicitly asks for it.

Use [operation-mode.md](../references/operation-mode.md) for search clearing, progress, nested results, inline actions, double-click behavior, filters, context menus, navigation, and time series.

## Minimum validation matrix

Test at least:

- trusted iframe bootstrap and trusted pop-out bootstrap;
- trusted bootstrap posted before framework mount, with no token exposed by the handoff;
- Account Settings bootstrap without unused project API fields;
- rejection of a wrong origin, a wrong source window, and malformed messages;
- token replacement while requests are in flight and current-token headers on later calls;
- exact top-level versus `data` payload placement;
- correlation, timeout, late replies, and duplicate replies;
- multiple integration instances without cross-routing;
- Operation Mode click, keyboard activation, inline action, and double-click as separate behaviors;
- selection without focus and explicit focus through `zoomOn`;
- listener, timer, request, transferable-buffer, and pending-promise cleanup.

Read [security-and-testing.md](../references/security-and-testing.md) before implementation handoff.

## Documentation map

| Topic | Reference |
| --- | --- |
| Source priority, invariants, and public-sample policy | [documentation-map.md](../references/documentation-map.md) |
| End-to-end implementation, local development, and troubleshooting | [development-workflow.md](../references/development-workflow.md) |
| Manifest, loading, dynamic pages, and pop-outs | [manifest-and-loading.md](../references/manifest-and-loading.md) |
| Secure bridge, bootstrap, API access, replies, teardown | [bridge-and-api.md](../references/bridge-and-api.md) |
| Common event catalog and exact envelopes | [message-catalog.md](../references/message-catalog.md) |
| Integration-to-host events and resource-type vocabulary | [integration-to-host-events.md](../references/integration-to-host-events.md) |
| Operation Search, actions, filters, panels, time series | [operation-mode.md](../references/operation-mode.md) |
| Selection, resources, settings, notifications, focus | [recipes.md](../references/recipes.md) |
| Threat model, review checklist, and protocol tests | [security-and-testing.md](../references/security-and-testing.md) |

All domains, IDs, tags, assets, coordinates, and measurements in this guide are fictional. Never publish a JWT, API token, customer payload, private endpoint, internal source path, or unpublished protocol field.
