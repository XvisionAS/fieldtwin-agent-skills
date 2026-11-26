# Documentation map

Use this page to choose a source before implementing a FieldTwin integration.

This bundle's message guidance was reconciled with FieldTwin integration-guide revision 66 and
the matching host contract on 2026-11-18. API catalogs are generated from the v1.10 ApiDoc and v2.0 OpenAPI and schemas in the source checkout. Backend/API guidance was verified against the public API
guidance and v1.10/v2.0 server contracts on 2026-11-13. Treat these dates as provenance, not as a
promise that every deployment exposes the same revision; verify newer events on the target host.

## Source priority

1. The contract documented for the FieldTwin environment the user is integrating with.
2. Current public FieldTwin documentation:
   - [FieldTwin documentation center](https://docs.fieldtwin.com/)
   - [FieldTwin API v2.0 reference](https://api.fieldtwin.com/) and
     [v1.10 reference](https://api-1-10.fieldtwin.com/)
   - [FieldTwin Admin integration configuration](https://docs.fieldtwin.com/admin/b_integrations/)
3. The user's working integration code, tests, and captured messages.
4. These bundled references and fictional samples.

FieldTwin deployments can differ by release and configuration. If a current documented message differs from this bundle, follow the deployed contract and update tests and documentation together.

## Bundled references

| Need | Read |
| --- | --- |
| End-to-end development, Tilt/Helm, local HTTP, bootstrap/auth diagnosis | [development-workflow.md](development-workflow.md) |
| Static manifest, dynamic pages, placement, background behavior, pop-outs | [manifest-and-loading.md](manifest-and-loading.md) |
| Secure `postMessage` bridge, `loaded`, token refresh, API calls, teardown | [bridge-and-api.md](bridge-and-api.md) |
| Backend/API authentication, version choice, URL safety, readiness, errors | [backend-api.md](backend-api.md) |
| Coordinate projection, uploaded vector conversion, raster profiles/volumes/heat maps/tiles | [processing-services.md](processing-services.md) |
| v1.10 account/configuration and subproject endpoint catalog | [backend-api-v1.10.md](backend-api-v1.10.md) |
| v2.0 stream CRUD, GET filters, resource ownership, specialized endpoints | [backend-api-v2.0.md](backend-api-v2.0.md) |
| v1.10 and v2.0 batch envelopes, ordering, failure and recovery | [backend-api-batch.md](backend-api-batch.md) |
| Moving existing v1.x calls to v2.0: endpoint mapping, envelope and batch changes, rollback | The `upgrade-fieldtwin-integration` skill; never translate paths or payloads by naming symmetry |
| Complete readable/writable API field catalog and narrow lookup commands | [api-attributes.md](api-attributes.md) |
| Complete bidirectional postMessage event/field catalog and narrow lookup commands | [postmessage-attributes.md](postmessage-attributes.md) |
| Common event names and payload placement, automation descriptors and attribute webhooks | [message-catalog.md](message-catalog.md) |
| Walking/swimming water current, depth profiles, limits, ownership, acknowledgement, clearing | [water-current.md](water-current.md) |
| Operate shared views: `supportShareView`, capture/restore messages, versioned integration state | [shared-views.md](shared-views.md) |
| Complete integration-to-host event matrix and canonical resource-type values | [integration-to-host-events.md](integration-to-host-events.md) |
| Operation Search, actions, filters, menus, panels, time series | [operation-mode.md](operation-mode.md) |
| Host-side system highlighting, metadata-backed connection bundles, multi-channel flow and direction | [system-highlighting.md](system-highlighting.md) |
| Resource queries, selection, focus, settings, notifications, automation participation | [recipes.md](recipes.md) |
| Threat model, review checklist, automated/manual tests | [security-and-testing.md](security-and-testing.md) |

Processing-service contracts were verified on 2026-10-01. Service URLs and availability are
deployment-specific; they are separate from both postMessage and the versioned project API.

## Public-sample policy

Every bundled domain, token, identifier, tag, coordinate, asset name, and measurement is fictional. Replace placeholders through deployment configuration; do not hard-code a production tenant or customer value into reusable integration code.

Do not copy examples that:

- send normal production messages with `targetOrigin: '*'`;
- accept origins with substring or prefix matching;
- decode a JWT without verifying it when authorization depends on its claims;
- print or persist a JWT;
- place a JWT or user identifier in an iframe URL;
- leave listeners, timers, or pending-request maps alive after unmount.
