---
name: develop-fieldtwin-integration
description: Develop, debug, test, and review FieldTwin integrations. Use for FieldTwin API v1.10/v2.0, resource schemas and metadata, manifests and Account Settings, iframe/pop-out postMessage and JWTs, deployment headers and Tilt/Kubernetes debugging, processing services, Operate search and shared views, system highlighting, integration settings, automations, and webhooks.
license: ISC
metadata:
  author: FutureOn AS
  version: "0.16.3"
---

# Develop FieldTwin integrations

Read only the reference needed for the task. Use the [documentation map](references/documentation-map.md)
for other topics and the [integration guide](integration/README.md) for host examples.
The target release's public contract takes precedence. For a protocol change, update both sides,
document compatibility, and test the changed exchange.

On first use in a task, run `node <skill-dir>/scripts/check-update.mjs`. If it finds a newer
release, tell the user the installed and available versions and the update command for
their installer. Continue if the check is unavailable. Install updates only on request.

## REST API

1. Use the trusted `loaded.backendUrl` (including its base path), `APIVersion`, scope, and current
   bearer JWT. Account Settings may provide a JWT without project API context.
2. Use the [API catalog](references/api-attributes.md) to discover the exact method and path,
   then require one match with `--exact-path`. For v2 stream writes, also query the exact
   stream, resource, and method. Read only the fields you need.
3. Identify where each input comes from and verify its location, scope, type, format, optionality,
   defaults, and constraints. Encode only after choosing the right identifier or value. If the
   catalog omits a required detail, check the matching release's docs or source. Surface any
   unresolved input before issuing the request.
4. For v1.10 metadata definitions, use the REST row's `metaDatumId` or the host `getResources`
   row's `id`. If you have only `definitionId`, use the
   [definitions collection](references/backend-api-v1.10.md#read-metadata-for-a-selection).
5. Follow the [API request and error rules](references/backend-api.md) and
   [batch contract](references/backend-api-batch.md) when applicable. Verify permissions,
   readiness, response status and media type, and empty bodies.

## Browser integration

- [Bridge](references/bridge-and-api.md): register before document load. Accept `loaded` only
  from the allowlisted exact origin and expected parent or opener. Pin both. Keep the JWT in
  memory, replace it on `tokenRefresh`, and remove listeners and cancel requests at teardown.
- [Message catalog](references/postmessage-attributes.md): query by direction, event, and
  variant for exact field placement, instance targeting, and correlation. Keep selection and
  camera focus independent.
- [Manifest and loading](references/manifest-and-loading.md): follow iframe and pop-out
  response-header requirements. Use [security and testing](references/security-and-testing.md)
  for credential handling, malformed inputs, and real host verification.
- For hosted static deployments, use `create-fieldtwin-integration` and
  `scripts/ft-integrations.mjs`. Deploy through the CLI and use the browser for sign-in.
- A static integration needs no backend for a remote API key or its settings. Before writing a
  settings page or remote API call, read that skill's `references/integration-secrets.md`.

## Test in FieldTwin

Whenever a FieldTwin instance and a browser tool are available, test in the real application
before reporting the work done. Unit tests and a page opened on its own do not prove the bridge.

- Open a project the user names, open the integration's tab, and exercise what was built or
  changed: the load, a selection, each API call, and the pop-out when it matters.
- Let the user sign in themselves. Never ask for or type a password.
- Read the console and network errors, fix them, and test again.
- Change project data only when the test needs it and the user agrees.
- If it cannot be tested this way, say so and give the user the steps to check it.

Report in plain words first: what changed for the user, how to see it in FieldTwin, and what they
or an admin still have to do. Then list the checks run and any release-specific compatibility
limits. When something fails, say what it means and the next step.
