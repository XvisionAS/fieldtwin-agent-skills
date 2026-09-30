# Water current for walking and swimming

Use this contract for a sea-model integration that supplies currents felt by walkers and divers.
It was reconciled with integration-guide revision 64 and the matching host contract on 2026-09-30.
Check the target deployment supports these events before relying on them. They belong to walking
and swimming in Designer and Presenter, including Operation Mode; they are not an Operation Search
or time-series registration payload.

## Request, update, and reply

| Direction | Event | Payload and delivery |
| --- | --- | --- |
| Host to integration | `waterCurrentRequest` | Broadcast when a walk successfully starts. No `data` payload or request ID. Normal host transport adds its readiness and mode fields. |
| Integration to host | `waterCurrentUpdate` | Required `data.stations`, optional `data.label`. Replaces the sending instance's whole field. |
| Host to integration | `waterCurrentUpdate` | Direct acknowledgement: top-level `success`, optional `error`, plus `doNotProcessMessage: true`, `responseToEvent: 'waterCurrentUpdate'`, and `isOperation`. |

Answer a trusted `waterCurrentRequest` with the integration's current snapshot. If the integration
has no current, ignore the request. Updates can also be sent proactively after bootstrap. There is
no timestamp or time dimension in this payload: send a complete replacement when simulation time
changes. Leaving walking does not clear the stored field.

## Exact update fields

| Field | Required | Contract |
| --- | --- | --- |
| `event` | Yes | Exactly `waterCurrentUpdate`. |
| `data` | Yes | Object containing the snapshot. |
| `data.label` | No | Text displayed in the walk controls; defaults to an empty string. |
| `data.stations` | Yes | Array of 0-1,000 stations. An empty array clears only this sender's field. |
| `data.stations[].x` | Yes | Finite numeric easting in the project's CRS, like resource positions. |
| `data.stations[].y` | Yes | Finite numeric northing in the project's CRS. |
| `data.stations[].profile` | Yes | Array of 1-200 depth samples, accepted in any order. |
| `data.stations[].profile[].z` | Yes | Finite numeric true depth in metres, negative below sea level. Do not apply the subproject's vertical exaggeration. |
| `data.stations[].profile[].east` | Yes | Finite eastward velocity in m/s, within -10 to 10 inclusive. |
| `data.stations[].profile[].north` | Yes | Finite northward velocity in m/s, within -10 to 10 inclusive. |
| `data.stations[].profile[].up` | No | Finite upward velocity in m/s, within -10 to 10 inclusive; omitted or null defaults to zero. |

Limits apply to each velocity component, not vector magnitude. Numeric strings are rejected.
The host sorts profiles by depth, interpolates linearly between samples, and clamps beyond the
first and last depth. Station contributions use inverse-square horizontal-distance weighting.
At a station's exact position its own profile wins; one station gives a horizontally uniform field.

## Ownership and clearing

The host derives the sending integration instance from its registered source window. Do not send
`customTabId`, `integrationId`, or another source's ID in this envelope. Each accepted update
replaces only that sender's snapshot. Of several integration fields, the most recently accepted
nonempty update is used; fields from different integrations are never blended. Clearing that field
restores the most recently updated remaining field, then the manual walk-control current if none
remain. An invalid update returns `success: false` with `error` and preserves the previous field and
its priority.

Send `{ event: 'waterCurrentUpdate', data: { stations: [] } }` when the model stops supplying a
current. Closing an embedded integration tab clears its field. In the verified host contract,
pop-out unregistration does not perform that same cleanup: explicitly clear and await the
acknowledgement before an integration-controlled pop-out close or disposal. Do not rely on an
unload message being delivered when the user closes the browser window.

## Secure example

This handler runs only after the bridge in [bridge-and-api.md](bridge-and-api.md) has validated
the exact source window, origin, and message object. `sendToHost` targets the pinned iframe parent
or pop-out opener and exact origin.

```javascript
function handleWaterCurrentMessage(message) {
  if (message.event === 'waterCurrentRequest') {
    sendToHost({
      event: 'waterCurrentUpdate',
      data: {
        label: 'Fictional hindcast 2026-09-30 12:00',
        stations: [
          {
            x: 470000,
            y: 6660000,
            profile: [
              { z: -5, east: 0.4, north: 0.1 },
              { z: -80, east: 0.2, north: 0.05, up: 0 },
            ],
          },
        ],
      },
    })
  }
}
```

The acknowledgement has no echoed `queryId`, `reqId`, or timestamp. `responseToEvent` identifies
the request class only. Keep one update in flight when matching acknowledgements to snapshots,
with a bounded timeout. After a timeout, acceptance is uncertain and a late reply cannot be reliably
matched to a newer snapshot. Do not resume acknowledgement tracking as if the timed-out update had
failed; a fresh bridge session is needed to discard outstanding replies reliably.

## Validation cases

- Request only after a successful walk start; no request on exit or failed start.
- Trusted iframe and pop-out sends, wrong-origin/source rejection, and no client-selected owner.
- Required field placement, omitted `up`, unordered depths, interpolation, clamping, and units.
- Empty clear, 1,000 stations, 200 samples, inclusive component limits, and malformed/nonfinite input.
- Two senders: latest accepted field wins, invalid updates preserve it, and clearing restores the other.
- Exact success/error reply decorators without fabricated request IDs, timeout, and late replies.
- Embedded close cleanup and the documented explicit-clear requirement for pop-out disposal.
