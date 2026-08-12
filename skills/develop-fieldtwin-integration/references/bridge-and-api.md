# Secure bridge, bootstrap lifecycle, and API access

Create one bridge when the integration page mounts and dispose it when the page unmounts. The bridge should own the FieldTwin host window, trusted origin, JWT, and API context so feature code does not duplicate security-sensitive message handling.

The examples on this page use fictional `.example` origins. Supply the exact origins for the FieldTwin environments where the integration is installed.

## Bootstrap contract

FieldTwin sends `loaded` after the integration document has loaded. The integration does not need to send a readiness event first.

Use `loaded` to initialize only the runtime fields the integration needs:

| Field | Purpose |
| --- | --- |
| `token` | Current JWT for FieldTwin API requests. Keep it in memory only. |
| `backendUrl` | Backend base URL supplied by the trusted host. |
| `APIVersion` | API version such as `v1.10`. |
| `project`, `subProject`, `stream` | Current project scope. |
| `customTabId` | Identity of this integration instance. |
| `canEdit` | UI capability hint. The API still enforces authorization. |
| `APIServerIsReady` | Whether subproject API requests can start. |

Before accepting `loaded`, require both:

1. `event.origin` is an exact member of a deployment allowlist.
2. `event.source` is the expected host window: `window.parent` for an iframe or `window.opener` for a pop-out.

After accepting it, pin that exact origin and source pair. Every later inbound message and every outbound message must use the pinned pair. Do not infer trust from `document.referrer`, `backendUrl`, a substring match, or a value inside the message.

## Vanilla JavaScript bridge

This dependency-free bridge consumes `loaded` and `tokenRefresh`, tracks API readiness, and exposes a sender and authenticated API helper. Create it only in a browser lifecycle hook.

```javascript
const API_VERSION_PATTERN = /^v\d+(?:\.\d+)*$/

function normalizeHttpsOrigin(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    throw new Error('FieldTwin host origins must use HTTPS')
  }
  return url.origin
}

function isMessage(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.event === 'string'
}

function isExpectedHostWindow(source) {
  if (window.parent !== window) {
    return source === window.parent
  }

  const popoutHost = window.opener && !window.opener.closed ? window.opener : null
  return popoutHost !== null && source === popoutHost
}

function readLoadedState(message) {
  if (typeof message.token !== 'string' || message.token.length === 0) {
    return null
  }
  if (typeof message.backendUrl !== 'string' || typeof message.APIVersion !== 'string') {
    return null
  }
  if (!API_VERSION_PATTERN.test(message.APIVersion)) {
    return null
  }

  let backendUrl
  try {
    backendUrl = new URL(message.backendUrl)
  } catch {
    return null
  }
  if (backendUrl.protocol !== 'https:') {
    return null
  }

  return {
    token: message.token,
    backendOrigin: backendUrl.origin,
    apiVersion: message.APIVersion,
    project: message.project,
    subProject: message.subProject,
    stream: message.stream,
    customTabId: message.customTabId,
    canEdit: message.canEdit === true,
    apiServerIsReady: message.APIServerIsReady === true,
  }
}

export function createFieldTwinBridge({
  allowedHostOrigins,
  onReady = () => {},
  onEvent = () => {},
}) {
  if (!Array.isArray(allowedHostOrigins) || allowedHostOrigins.length === 0) {
    throw new Error('Configure at least one exact FieldTwin host origin')
  }

  const allowedOrigins = new Set(allowedHostOrigins.map(normalizeHttpsOrigin))
  let hostWindow = null
  let hostOrigin = null
  let state = null
  let disposed = false

  function getContext() {
    if (!state) {
      return null
    }

    return {
      backendOrigin: state.backendOrigin,
      apiVersion: state.apiVersion,
      project: state.project,
      subProject: state.subProject,
      stream: state.stream,
      customTabId: state.customTabId,
      canEdit: state.canEdit,
      apiServerIsReady: state.apiServerIsReady,
    }
  }

  function acceptBootstrap(event, message) {
    if (!allowedOrigins.has(event.origin) || !isExpectedHostWindow(event.source)) {
      return false
    }

    const nextState = readLoadedState(message)
    if (!nextState) {
      return false
    }

    hostWindow = event.source
    hostOrigin = event.origin
    state = nextState
    onReady(getContext())
    return true
  }

  function receive(event) {
    if (disposed || !isMessage(event.data)) {
      return
    }

    const message = event.data
    if (!hostWindow) {
      if (message.event === 'loaded') {
        acceptBootstrap(event, message)
      }
      return
    }

    if (event.source !== hostWindow || event.origin !== hostOrigin) {
      return
    }

    if (message.event === 'loaded') {
      const nextState = readLoadedState(message)
      if (nextState) {
        state = nextState
        onReady(getContext())
      }
      return
    }

    if (message.event === 'tokenRefresh') {
      if (typeof message.token === 'string' && message.token.length > 0) {
        state = { ...state, token: message.token }
      }
      return
    }

    if (message.event === 'apiPodIsReady') {
      state = { ...state, apiServerIsReady: true }
    } else if (message.event === 'apiPodIsNotReady') {
      state = { ...state, apiServerIsReady: false }
    }

    onEvent(message)
  }

  function send(message, transfer = []) {
    if (disposed || !hostWindow || !hostOrigin) {
      throw new Error('FieldTwin bridge is not ready')
    }
    if (!isMessage(message)) {
      throw new Error('FieldTwin messages require an event string')
    }

    hostWindow.postMessage(message, hostOrigin, transfer)
  }

  async function apiFetch(path, init = {}) {
    if (disposed || !state) {
      throw new Error('FieldTwin bridge is not ready')
    }
    if (!state.apiServerIsReady) {
      throw new Error('FieldTwin API server is not ready')
    }
    if (typeof path !== 'string' || path.startsWith('//')) {
      throw new Error('Use a relative FieldTwin API path')
    }

    const apiRoot = new URL(`/API/${state.apiVersion}/`, state.backendOrigin)
    const endpoint = new URL(path.replace(/^\/+/, ''), apiRoot)
    if (endpoint.origin !== apiRoot.origin || !endpoint.pathname.startsWith(apiRoot.pathname)) {
      throw new Error('API path must stay inside the configured FieldTwin API root')
    }

    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${state.token}`)

    return fetch(endpoint, {
      ...init,
      headers,
      redirect: 'error',
    })
  }

  function dispose() {
    if (disposed) {
      return
    }

    disposed = true
    window.removeEventListener('message', receive)
    state = null
    hostWindow = null
    hostOrigin = null
  }

  window.addEventListener('message', receive)

  return {
    apiFetch,
    dispose,
    getContext,
    send,
  }
}
```

Example setup:

```javascript
import { createFieldTwinBridge } from './fieldtwin-bridge.js'

let bridge

bridge = createFieldTwinBridge({
  allowedHostOrigins: ['https://fieldtwin.example'],
  onReady(context) {
    renderEditingControls(context.canEdit)
    if (context.apiServerIsReady) {
      void loadInitialData()
    }
  },
  onEvent(message) {
    if (message.event === 'apiPodIsReady') {
      void loadInitialData()
      return
    }

    routeFieldTwinEvent(message)
  },
})
```

Configure the allowlist outside the message itself, for example through a deployment-specific build setting. A self-hosted installation should add its own exact host origin rather than weakening the comparison.

## Authenticated API requests

`apiFetch` constructs the API root from the trusted `loaded` context and reads the current in-memory token for every request. A request made after `tokenRefresh` therefore uses the new JWT rather than a token captured during initial setup.

Use endpoint paths from the [FieldTwin API documentation](https://api.fieldtwin.com/). This illustrative request uses only fictional identifiers:

```javascript
async function loadInitialData() {
  const context = bridge.getContext()
  if (!context || !context.subProject || !context.apiServerIsReady) {
    return
  }

  const subProjectId = encodeURIComponent(context.subProject)
  const response = await bridge.apiFetch(`subprojects/${subProjectId}/stagedAssets`)

  if (!response.ok) {
    throw new Error(`FieldTwin request failed with status ${response.status}`)
  }

  const stagedAssets = await response.json()
  renderStagedAssets(stagedAssets)
}
```

Important API rules:

- Build the `Authorization` header immediately before each request.
- Do not put the JWT in a URL, storage API, log, error report, analytics event, or serialized application state.
- Treat `canEdit` as a way to disable editing controls, not as authorization. The API remains authoritative.
- Wait for `APIServerIsReady` or `apiPodIsReady` before subproject API work. Back off when `apiPodIsNotReady` arrives.
- Keep API paths relative to the trusted backend root so the bearer token cannot be sent to an unrelated origin.
- Surface user-triggered failures with a useful message and retry path; do not include credentials in the message.

## Teardown

Call `bridge.dispose()` when the integration unmounts or the pop-out closes. This removes the message listener and releases the in-memory JWT and pinned window references.

The bridge cannot know about work created by feature code. The integration must also:

- abort in-flight fetches;
- clear polling intervals and retry timers;
- reject or cancel pending request promises;
- remove feature-level event listeners;
- stop work tied to a panel after `operationPaneClosed` when applicable.

See [Practical recipes](recipes.md) for query cleanup, settings, notifications, and selection-versus-focus patterns.
