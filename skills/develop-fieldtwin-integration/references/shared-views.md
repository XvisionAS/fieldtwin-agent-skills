# Operate shared views

Use this contract when an integration panel must appear in the same state for someone who opens a
shared Operate view: the open record, video and playback time, displayed paths, active tab, and so
on. It was reconciled with integration-guide revision 66 and the matching host contract on
2026-11-18. Check the target deployment supports these events before relying on them.

## Opt in

Set `supportShareView: true` on the integration (manifest or Admin) or on a dynamic page. Pages
inherit the integration value and can override it; the default is `false`. Each supporting page is
asked and restored separately with its own state, so one shared view can hold several pages of the
same integration; `data.pageId` (the page `path`) tells an application serving several pages which
one is meant. Only Operation Mode shares views. Panels the user has open in the side panel, or
popped out, are asked; closed panels and hidden background copies are not. Opening the shared view
opens those side panels again when the recipient may use the integration.

## Messages

| Direction | Event | Payload and delivery |
| --- | --- | --- |
| Host to integration | `shareViewCapture` | `data.requestId`; `data.pageId` for a dynamic page. Sent to every open supporting instance when the user shares. |
| Integration to host | `shareViewState` | `data.requestId` and `data.state`; omit `state` or send `null` when there is nothing to save. |
| Host to integration | `shareViewState` | Direct acknowledgement: top-level `success`, optional `error`. |
| Host to integration | `shareViewRestore` | `data.state` exactly as saved; `data.pageId` for a dynamic page. Sent once per page load, right after `loaded`. |

The host waits for every asked instance in parallel, up to 5 seconds each. A missing, late or
invalid answer, or one beyond 16 integrations, leaves that integration out; the view is still
shared and the user is warned by name. Capture and restore go only to the integration window, never
to an application that embeds FieldTwin. Only
the window that received a request can answer it: identity comes from the registered source window,
never from the payload.

States are saved on the shared-view record keyed by the integration ID, or
`<integrationId>-dynamic-<path>` for a dynamic page, and sent back only to that integration. An
instance that is not loaded when the view opens (for example a panel behind a closed Operate
button) receives its state when it first loads.

## State rules

- Plain JSON of at most 64 KiB per integration; a view holds at most 16 integration states.
- Always include a `version` and check it on restore. Links outlive releases: a newer integration
  must read, migrate or explicitly ignore older states. The host does not enforce or interpret it.
- Store identifiers, positions and UI choices. Never store a JWT, signed URL, or copied data the
  recipient can load themselves; the recipient may lack access to some identifiers, so skip what is
  unavailable instead of failing the whole restore.
- `shareViewRestore` usually arrives before the integration has loaded its own data, and often
  before the framework has mounted. Capture it in the same parser-time listener that captures
  `loaded`, keep it, then apply it once that data is ready.
- Accept capture and restore only from the pinned host window and exact origin, and answer through
  the pinned bridge, never with `*`: the state describes what a user is looking at. Validate it as untrusted input: it was written by another user,
  possibly with another release.
- Do not move the camera on restore; the host restores the camera and selection itself.

## Example

```javascript
const SHARE_STATE_VERSION = 1
let pendingShareState = null

bridge.onMessage((message) => {
  if (message.event === 'shareViewCapture') {
    bridge.send({
      event: 'shareViewState',
      data: {
        requestId: message.data.requestId,
        // null when nothing is open: an empty state still uses one of the view's 16 slots.
        state: openRecord ? { version: SHARE_STATE_VERSION, recordId: openRecord.id, time: player.currentTime } : null,
      },
    })
  } else if (message.event === 'shareViewRestore') {
    pendingShareState = message.data.state
    applyShareStateWhenReady()
  }
})

function applyShareStateWhenReady() {
  if (!dataLoaded || !pendingShareState) {
    return
  }
  const state = pendingShareState
  pendingShareState = null
  if (state?.version !== SHARE_STATE_VERSION || typeof state.recordId !== 'string') {
    return
  }
  openRecord(state.recordId, state.time)
}
```

`bridge` is the pinned iframe-parent or pop-out-opener bridge from
[bridge-and-api.md](bridge-and-api.md).

## Tests

- Capture answers with the echoed `requestId` and a versioned state; nothing to save sends `null`.
- Two open pages of one integration each answer for their own `pageId`.
- Restore before data loads is applied once data is ready, exactly once, including when it arrives
  before the framework mounts.
- A capture or restore from another window or origin is ignored.
- An unknown version, malformed state or inaccessible identifier is ignored without breaking the page.
- Messages from an unpinned window or origin are rejected.
