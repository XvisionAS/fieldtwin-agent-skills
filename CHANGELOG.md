# Changelog

## 0.2.6 - 2026-08-13

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
