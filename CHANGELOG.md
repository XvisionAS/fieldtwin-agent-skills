# Changelog

## 0.3.2 - 2026-08-20

- Added host-side Operation Mode guidance for resolving direct connection-kind metadata as stable
  logical channels on a physical connection, including defaults, project overrides, repeated
  categories, and an explicit non-recursive constituent scope.
- Defined per-channel direction precedence and endpoint-relative semantics so one metadata-backed
  bundle can display Oil and Gas flowing independently without matching customer-defined labels.
- Documented single-pass lateral-band rendering, segment phase propagation, live metadata
  invalidation, regeneration/disposal behavior, large-bundle policy, and focused regression tests.
- Clarified that built-in system highlighting is host-owned and must not overload
  `visualFilteringUpdate` or silently create a new integration protocol contract.

## 0.3.1 - 2026-08-19

- Added a complete integration-to-host event matrix with exact payload placement, reply events,
  correlation fields, and links to the deeper Operation Mode contracts.
- Distinguished singular selection/navigation `type` values such as `stagedAsset` from canonical
  plural collection values such as `stagedAssets` and `subProjects` used by `resourceType` and
  `resourceTypes` fields.
- Documented `getResources` aliases, missing-resource behavior, canonical root-resource values,
  and fully qualified `resourceId:streamId` handling, including the main-stream short-ID fallback.
- Corrected existing resource-query examples and added an evaluation that rejects `subProject` and
  `stagedAsset` when used as collection `resourceType` values.

## 0.3.0 - 2026-08-14

- Documented the FieldTwin automation contract for integrations: the `automationDescriptor`
  declaration (attributes and functions with https-only `readUrl`/`invokeUrl`, entry and size
  caps, authoring-only entries without a URL), the short-lived JWT the automation service sends
  when invoking declared endpoints, and the `POST /automation/event` webhook that fires
  attribute-triggered automations without an open client.
- Added the `attributeUpdated` postMessage (client cache refresh only - never starts a run) and
  a copy-ready "Participate in FieldTwin automations" recipe covering declaration, endpoint
  serving, and backend-originated webhook signalling.
- Documented the complete automation value-type vocabulary (`string`, `number`, `boolean`,
  `date`, `tags`, `resource`, `resources`, `object`, `any`) with JSON wire shapes for attribute
  types, function parameter types, and function returns; the host drops entries declaring
  anything outside it.
- Documented multi-output automation functions: `returns` as an array of unique named
  `{ id, type }` outputs, the object-keyed response contract, per-output wiring in the
  automation editor, and the explicit failure when a declared multi-output function responds
  with a non-object.

## 0.2.9 - 2026-08-13

- Added a complete GitLab provider contract with exact allowlisted HTTPS SaaS/self-managed origins,
  state and S256 PKCE, `api read_repository`, atomic vaulted access/refresh rotation, bounded
  Maintainer project discovery, and project-hook lifecycle reconciliation.
- Versioned GitLab Standard Webhooks HMAC verification separately from legacy plaintext
  `X-Gitlab-Token`, kept GitHub's raw-body `X-Hub-Signature-256` construction distinct, and added
  rotation, unwatch, disconnect, replay, and partial-cleanup requirements.
- Clarified that full account-keyed webhook URLs are displayable routing metadata rather than
  authentication, corrected exactly-empty versus whitespace-only secret behavior, and required
  opaque constant-time secret comparison without trimming, case folding, or Unicode normalization.
- Expanded create/develop evaluations for both GitHub and GitLab provider, token, webhook, routing,
  and cleanup lifecycles.

## 0.2.8 - 2026-08-13

- Added the account-scoped provider administration contract: exact safe DTOs, blank secret inputs,
  configured booleans, dirty-only PATCH, server-side semantic comparison, revision CAS, and no-op
  persistence when a submitted secret is unchanged.
- Replaced the GitHub App installation recipe with a standard GitHub OAuth App user flow using
  state, S256 PKCE, vaulted user tokens, bounded admin-capable repository discovery, and
  per-repository webhook reconciliation.
- Added per-tenant opaque webhook routing, server-only signing-secret resolution, and regression
  requirements for secret non-disclosure, cross-tenant isolation, revision drift, and vault safety.

## 0.2.7 - 2026-08-13

- Added provider readiness validation before intent/state mutation, sanitized unavailable errors,
  and external Secret wiring requirements for local Tilt as well as shared deployments.
- Documented production `Secure` `__Host-` callback cookies and the separate, explicitly selected
  non-Secure host-only cookie required by an HTTP-only local workflow.
- Added the complete two-stage GitHub App installation/user-OAuth validation path and an optional
  encrypted single-node file-vault contract with security and regression requirements.
- Distinguished browser callback reachability from GitHub webhook reachability for local ingress
  and required exact App URL updates when an HTTPS tunnel is used.

## 0.2.6 - 2026-08-13

- Updated the creation skill to scaffold Account Settings provider administration, deployment-
  bootstrap-only Kubernetes Secrets, standard GitHub OAuth user authorization, normal
  per-repository hooks, tenant-scoped webhook routing, and vault-only provider credentials.
- Added one end-to-end FieldTwin development workflow connecting repository conventions,
  Environment Modules, Tilt, Helm, program-qualified images, file-backed persistence, public URL
  generation, CORS, iframe policy, Account Settings, dynamic pages, bootstrap, and server auth.
- Added a symptom-first diagnostic matrix for missed `loaded`, verifier failures, local scheme
  mismatches, iframe blocks, missing ConfigMaps, generic images, and persistent-volume mistakes.
- Expanded the development skill trigger and evaluation set so local Kubernetes and Account
  Settings failures select and exercise the complete workflow.

## 0.2.5 - 2026-08-13

- Corrected SvelteKit bootstrap guidance: `hooks.client` is dynamically imported and can run after
  FieldTwin posts from the iframe `load` callback, so capture must start from a parser-time module
  loaded by `app.html` before the framework body/bootstrap.
- Required the bounded token-bearing queue to remain in that module's private closure and added a
  real browser-order regression case.
- Applied explicit local-HTTP policy to the host-supplied `backendUrl`, required preservation of
  backend base paths, and documented the legacy FieldTwin public-key JWT profile.

## 0.2.4 - 2026-08-13

- Documented that local HTTP changes the trusted FieldTwin parent message origin as well as the
  generated integration URL.
- Required local modules to configure the actual exact HTTP parent and gate acceptance through the
  same explicit TLS/development mode, while keeping shared and production origins HTTPS-only.
- Added regression requirements for accepted explicit local HTTP parents and fail-closed HTTP
  configuration outside local mode.

## 0.2.3 - 2026-08-13

- Required `loaded` capture before framework mount or hydration because FieldTwin has no client
  readiness handshake, with a bounded module-private handoff that reuses normal trust validation.
- Documented page-specific bootstrap validation so Account Settings can authenticate same-origin
  control-plane requests without unused project API fields while API helpers remain fail-closed.
- Added regression coverage requirements for early trusted and untrusted bootstrap messages,
  minimal Account Settings payloads, cleanup, and token non-disclosure.

## 0.2.2 - 2026-08-12

- Added mode-aware iframe response guidance: exact `frame-ancestors` for HTTPS deployments and a
  narrowly scoped omission for explicitly enabled local HTTP mode.
- Added diagnosis for child `frame-ancestors`/`X-Frame-Options`, parent `frame-src`, and browser
  mixed-content blocking, with ingress-header and real-iframe validation requirements.

## 0.2.1 - 2026-08-12

- Added production manifest and dynamic-page CORS requirements to both integration skills,
  including preflight behavior, exact-origin guidance for authenticated endpoints, and validation
  through the deployed ingress.
- Clarified that CORS and iframe `frame-ancestors` are independent browser security controls.
- Added one-origin URL generation guidance so HTTP-only Tilt environments and HTTPS deployments
  consistently generate manifest, icon, dynamic-page, callback, webhook, and worker URLs.

## 0.2.0 - 2026-08-12

- Added `create-fieldtwin-integration` for repository scaffolding, program-qualified image naming,
  Docker, Helm, Environment Modules, Tilt, build-bot, secrets, and deployment validation workflows.
- Generalized package validation and documentation for multiple complementary skills.

## 0.1.0 - 2026-08-12

- Initial public Agent Skill following the open Agent Skills specification.
- Added secure iframe bootstrap, token refresh, API, and pop-out guidance.
- Added manifests, dynamic pages, common message recipes, and testing guidance.
- Added Operation Search results, progress, Font Awesome actions, double-click actions, visual filters, context menus, navigation, and time-series examples.
