# Manifest, loading, dynamic pages, and pop-outs

Use a manifest when administrators should be able to import an integration configuration from a stable HTTPS endpoint. An integration may expose a single static page, dynamic pages, background behavior, or a combination.

## Static manifest example

Serve a JSON response over HTTPS:

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

Common fields:

| Field | Meaning |
| --- | --- |
| `name` | Required display name. |
| `url` | Main integration entry point. It may be omitted when visible pages come entirely from `dynamicPagesUrl`. |
| `logo` | HTTPS URL for the integration logo. |
| `tabPosition` | `bottom`, `property-panel`, `hidden`, `global`, or `main-toolbar-dialog`. |
| `showInDesigner` | Availability outside Operation Mode, including Designer and Presenter. Defaults to `true`. |
| `showInOperation` | Availability in Operation Mode. Defaults to `true`. |
| `resourceTypes` | Resource types relevant to a property-panel integration. |
| `projectWideAccess` | Requests project-wide API scope when the administrator allows it. Prefer least privilege. |
| `projectAllFromUser` | Requests access across user-visible projects. Use only when the workflow genuinely needs it. |
| `allowAccessToClipboard` | Enables iframe clipboard permission. Keep `false` unless required. |
| `allowPopout` | Allows a panel to become a separate top-level window. |
| `useGET` | Loads the integration with GET instead of the default POST flow. |
| `noURLParams` | With GET loading, avoids placing bootstrap fields in the URL; initialize from `loaded` instead. |
| `dynamicPagesUrl` | HTTPS endpoint returning dynamic page descriptors. |
| `runInBackground` | Loads a hidden background copy of the parent integration. |
| `backgroundUrl` | Optional page for the hidden copy; otherwise `url` is used. |
| `doNotUseSubprojectApiEndpoints` | Indicates the integration does not depend on subproject API readiness. |
| `projectSettingsUrl` | Optional project-settings page. |
| `accountSettingsUrl` | Optional account-settings page. |

Request the narrowest access and browser permissions possible. Manifest flags are not substitutes for backend authorization.

## Dynamic pages

Set `dynamicPagesUrl` when the visible tabs depend on user permissions, external configuration, or available workflows. The endpoint accepts an authenticated POST and returns a JSON array.

```json
[
  {
    "title": "Overview",
    "iframeUrl": "https://integration.example/pages/overview",
    "path": "overview",
    "tabPosition": "bottom",
    "showInDesigner": true,
    "showInOperation": true
  },
  {
    "title": "Maintenance",
    "iframeUrl": "https://integration.example/pages/maintenance",
    "path": "maintenance"
  }
]
```

Page fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `title` | Yes | Tab label. |
| `iframeUrl` | Yes | Full HTTPS page URL. |
| `path` | No | Stable page identity. When omitted, FieldTwin can generate an order-based path such as `page-1`. Explicit stable paths are preferable. |
| `tabPosition` | No | Page override, then manifest value, then `bottom`. |
| `showInDesigner` | No | Page override, then manifest value, then `true`. |
| `showInOperation` | No | Page override, then manifest value, then `true`. |

The endpoint receives `Authorization: Bearer <integration JWT>`. Verify the JWT before using claims to choose pages. Never put the JWT or personal identifiers into `iframeUrl` query parameters.

```javascript
app.post('/fieldtwin/dynamic-pages', async (request, response) => {
  const token = readBearerToken(request.headers.authorization)
  if (!token) {
    response.status(401).json({ error: 'Missing authorization' })
    return
  }

  const claims = await verifyFieldTwinJwt(token)
  const pages = buildAuthorizedPages(claims)
  response.json(pages)
})
```

`verifyFieldTwinJwt` must validate signature, issuer/audience when specified for the deployment, and expiry. A decode-only helper is not authorization.

## Parent and dynamic-page behavior

Dynamic pages replace the visible default tab, but the parent definition can still control headless/background behavior:

- `runInBackground: true` loads a hidden parent instance.
- `backgroundUrl` selects the hidden page; otherwise the parent `url` is used.
- `hidden` and `global` parents can remain headless even when they provide visible dynamic pages.
- Use explicit `path` values when another integration will call `openOperationPanel` for a page.

## Bootstrap loading

FieldTwin can initially load an integration by POST or GET depending on configuration. Modern single-page integrations should treat the trusted host-sent `loaded` message as their runtime bootstrap because the same message path works for iframe reloads and pop-outs.

Do not render a token, copy it into page state that devtools serializes, or echo it into HTML. Keep only the fields the integration needs.

Typical `loaded` fields include:

| Field | Use |
| --- | --- |
| `token` | Current JWT for API requests; memory only. |
| `backendUrl` | API base supplied by the host. |
| `APIVersion` | API version such as `v1.10`. |
| `project`, `subProject`, `stream` | Current FieldTwin scope. |
| `customTabId` | Integration-instance identity. |
| `canEdit` | UI capability hint; backend rights still apply. |
| `APIServerIsReady` | Whether subproject API calls can start. |
| `selection` | Current selection snapshot. |
| `cssUrl`, `cssThemeUrl` | Optional host styling context. |
| `sessionId` | Current integration instance session. |

Treat any additional user or project fields as sensitive and retain them only when the integration workflow requires them.

## Pop-out windows

With `allowPopout: true`, the same page can run in two topologies:

| State | Host window |
| --- | --- |
| Embedded iframe | `window.parent`, with `window.parent !== window` |
| Popped-out top-level window | `window.opener`, with `window.parent === window` |

Do not choose a target window independently for every message after bootstrap. Accept `loaded` only from an expected parent/opener, then pin the exact `event.source` and `event.origin`. Use that stored pair until teardown or a full re-bootstrap.

When the host sends `operationPaneClosed`, stop polling and release work tied to panel visibility. Unmounting the integration should also remove listeners and cancel timers, requests, and pending reply promises.
