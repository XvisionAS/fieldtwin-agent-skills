# Security and testing

Treat a FieldTwin integration as a separate web application crossing two trust boundaries: browser messaging with the FieldTwin host and authenticated HTTP calls to the FieldTwin API. Secure both boundaries independently and test the observable protocol rather than relying on implementation details.

Read [documentation-map.md](documentation-map.md) before using this guide. Deployed, released FieldTwin documentation takes precedence over these portable examples.

## Security model

### Pin the host window and origin

Configure the exact HTTPS origins that are allowed to host the integration. During bootstrap, accept `loaded` only when both conditions hold:

1. `event.origin` is an exact member of the configured allowlist.
2. `event.source` is the expected `window.parent` for an iframe or `window.opener` for a pop-out.

After bootstrap, pin that source window and origin. Accept later messages only when both still match, and send every reply to the pinned origin. Origin substring, suffix, and regular-expression matches are unsafe because an attacker can register a look-alike hostname. A wildcard target origin is also inappropriate for authenticated or project-scoped messages.

If an integration is deployed to more than one FieldTwin environment, inject the allowlist through deployment configuration. Do not infer an allowed origin from an arbitrary query parameter or from the first message received.

### Keep credentials ephemeral

- Keep the integration JWT in instance memory only.
- Replace it atomically on `tokenRefresh`.
- Build the `Authorization` header when each API request starts so it uses the current token.
- Never place the JWT in a URL, browser storage, DOM attribute, log, analytics event, error report, screenshot, or repository.
- Clear the in-memory reference during teardown and cancel requests that no longer belong to the active integration instance.

For server-rendered dynamic pages, verify the JWT signature and expected issuer, audience, and expiry before using any claim. Merely decoding the JWT is not authentication. Use verified claims only to choose content the caller is already authorized to see.

### Validate every external message

The message event is untrusted input even after its origin and source are accepted. Validate at the boundary:

- require a plain structured-cloneable object and a known `event` string;
- validate required fields, limits, identifiers, and nested shapes for that event;
- reject or ignore unknown events without executing values from the payload;
- keep top-level fields and `data` fields in the exact location documented for the event;
- correlate replies only through documented fields such as `queryId` and `reqId`;
- never execute payload strings as JavaScript or use them to construct code.

Validate untrusted URLs before opening or fetching them. Permit only the schemes and destinations required by the feature. Render external text as text. If a documented result field permits markup, sanitize it with the application's established sanitizer. Treat a Font Awesome icon name as an identifier selected from a supported allowlist, not as arbitrary HTML.

### Enforce authorization at the API

`canEdit` helps the integration present the correct UI, but it is not an authorization boundary. Every create, update, and delete request must be authorized by the FieldTwin API using the current bearer token. Scope requests to the project, subproject, and stream received from the trusted bootstrap state; do not accept ownership or scope solely from user-controlled input.

Handle readiness and request failures explicitly. Use bounded retries with cancellation for transient readiness, and present a useful error when a user action fails. Do not retry authorization or validation failures in a loop.

### Minimize exposed data

Send only fields needed by the receiving feature. Avoid embedding personal data or credentials in search-result markup, notifications, analytics, or settings. Namespace persisted settings by integration instance where the protocol requires `customTabId`, and never use settings storage for secrets.

### Tear down completely

An integration may be reloaded, hidden, popped out, or opened more than once. A teardown operation should:

- remove the single message listener;
- abort active HTTP requests;
- reject or clear pending correlated requests;
- clear timeouts, intervals, and retry timers;
- release references to the host window, origin, token, and integration state;
- prevent stale asynchronous work from publishing into a new session.

Make setup and teardown idempotent so framework remounts do not create duplicate listeners.

## Test strategy

Use small unit tests for bridge and validation functions, integration tests for browser-message and API boundaries, and a short manual pass inside an authorized FieldTwin environment. Test the protocol in both directions and assert exact envelopes.

### Bridge unit tests

Cover at least these cases:

| Case | Expected result |
| --- | --- |
| `loaded` from the configured origin and expected parent | Bootstrap state is stored and the host is pinned |
| `loaded` from a look-alike or unconfigured origin | Message is rejected and no state is stored |
| Message from the right origin but a different window | Message is rejected |
| Message from the pinned window but a different origin | Message is rejected |
| Valid `tokenRefresh` | The in-memory token is replaced and the next request uses it |
| Malformed or unknown event | No handler side effect occurs |
| Pop-out bootstrap | The opener is pinned instead of the integration's own top-level window |
| Teardown followed by a message | No handler runs and pending work is settled |

Use reserved example domains and synthetic identifiers in fixtures. Never copy a real token or production payload into a test. A useful harness constructs message events with explicit `origin`, `source`, and `data`, then observes only public callbacks and outbound messages.

### API tests

Stub the network boundary and assert:

- the URL is derived from trusted bootstrap scope;
- the current token is read at request time;
- authorization, validation, not-found, readiness, and server errors are distinguished;
- an aborted or stale request cannot update the active UI;
- write controls honor `canEdit`, while the server remains the final authority;
- user-triggered failures produce a recoverable user-facing result without exposing credentials.

For a dynamic page endpoint, add server-side tests for a missing token, invalid signature, wrong issuer or audience, expired token, insufficient rights, and the valid least-privilege case.

### Message contract tests

For every supported event, assert the exact event name and whether each field is top-level or nested under `data`. Include correlation identifiers only where the released protocol defines them. Exercise multiple integration instances so a result, filter, panel request, or reply cannot cross instance boundaries.

When adding or changing a protocol event, test both the producing and consuming side. Retain a compatibility test for any legacy field or behavior that remains supported.

### Operation Mode tests

Operation Mode interactions need separate assertions because selection, focus, and integration actions have different intent:

- a normal result-row click performs the documented selection behavior without moving the camera;
- a double-click emits `operationSearchDoubleClick` once with the stable result ID and configured action arguments;
- an inline Font Awesome button emits `operationSearchAction` and does not also trigger the row interaction;
- keyboard activation matches the documented click or action behavior;
- explicit focus sends the focus message, while selection-only paths do not;
- clearing a query clears results and finishes or clears progress;
- category, tag, and nested-item IDs remain stable across updates;
- markup and labels containing hostile input are rendered safely;
- filter toggles and time-series replies return only to the originating integration instance;
- a late progress or time-series response from a disposed instance is ignored.

### Manual verification

Before release, verify the integration in an authorized test environment:

1. Load it in an iframe and, when supported, a pop-out.
2. Confirm refresh and remount do not duplicate messages.
3. Confirm a token refresh is used without reloading the integration.
4. Exercise read and permitted write calls, readiness, and one recoverable failure.
5. Exercise ordinary selection, explicit focus, inline actions, double-click, query clearing, filters, panels, and time series that the integration supports.
6. Inspect browser storage, URLs, console output, and network-error UI for credential leakage.
7. Close the integration and confirm listeners, requests, and timers stop.

## Public sample and release checklist

Before publishing integration code or this skill package:

- use only fictional `.example` hosts, synthetic IDs, and placeholder credentials in samples;
- remove organization-specific paths, unreleased event names, private endpoints, captured payloads, and internal architecture notes;
- confirm every local documentation link resolves;
- confirm skill metadata and changelog versions agree;
- run `python3 scripts/validate_package.py` from the package root;
- review generated package contents, not only the source directory;
- document the supported FieldTwin release or the date public documentation was last verified.

The package validator catches common publication mistakes, but it does not replace code review, threat modeling, or testing against the released FieldTwin contract.
