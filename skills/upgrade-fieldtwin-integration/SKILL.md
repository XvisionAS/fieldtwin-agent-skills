---
name: upgrade-fieldtwin-integration
description: Upgrade a FieldTwin integration, script, or server client from FieldTwin API v1.x (v1.9 or v1.10) to API v2.0. ALWAYS use when migrating, porting, converting, or modernising FieldTwin API calls to v2.0 or v2.x; when code with /API/v1.10 or /API/v1.9 paths, /subProject/ routes, /batch routes, initialState, metadatadefinition, shareUrl, or allowedConnectionTypes should move to stream endpoints; when asked for the v2.0 equivalent of a v1.10 endpoint, field, header, or response shape; when a call has no v2.0 equivalent; when planning, estimating, or reviewing a v1.10 to v2.0 migration for FieldTwin 9.0; or when a migrated call returns an empty result, 403, 409, or 422. Covers the complete endpoint mapping, the five streams and the account ID in the URL, the type-keyed response envelope and filters, batch writes with IDs-only responses, ID and ordering rules, users and roles, behaviour changes, calls that stay on v1.10, configuration-driven rollout and rollback, and validation.
license: ISC
metadata:
  author: FutureOn AS
  version: "0.11.0"
---

# Upgrade FieldTwin Integrations to API v2.0

Move an integration from FieldTwin API v1.x to v2.0 call by call, from a documented mapping,
without changing what the integration does for its users.

v2.0 is not a new prefix on the same routes. Three things change at once: the **URL model** (five
streams, with the account ID in the URL), the **response envelope** (one shape: type, then ID) and
the **write model** (type-keyed batches that answer with IDs only). A search-and-replace from
`v1.10` to `v2.0` produces requests that fail, or worse, requests that succeed and return nothing.

FieldTwin 9.0 serves both versions side by side and v1.10 has no retirement date yet, so the
migration can be incremental. That is what makes a careful, reversible upgrade possible: a call
that cannot move stays on v1.10, and a tenant can be switched back.

## Choose the references

Read [references/endpoint-mapping.md](references/endpoint-mapping.md) before rewriting any call;
it is the lookup table for the whole upgrade. Then read what the integration needs:

- [references/reads-and-envelope.md](references/reads-and-envelope.md) for the stream URL model,
  the response envelope, filters and headers, reads that are new in v2.0, and parser rewrites.
- [references/writes-and-batches.md](references/writes-and-batches.md) for batch bodies and
  responses, stream ownership, ordering, ID rules, worked before-and-after examples, uploads, and
  users and roles.
- [references/behavior-changes.md](references/behavior-changes.md) for what stays the same,
  behaviour that changed without a path change, the migration checklist, and how to compare
  v1.10 and v2.0 output.

Field-level truth lives outside this skill. The tenant's own reference at
`/API/v2.0/documentation`, with its OpenAPI document at `/API/v2.0/documentation/oas3.json`, has
the exact fields for each operation and wins over anything written here. The public references
are [API v2.0](https://api.fieldtwin.com/) and [API v1.10](https://api-1-10.fieldtwin.com/).

Use `develop-fieldtwin-integration` alongside this skill when it is installed. It owns the
browser bridge, the `loaded` and `tokenRefresh` lifecycle, authentication, URL safety and
readiness, and its attribute catalog answers "which fields does this operation accept" offline.

## Match the effort to the request

The eight steps below describe migrating a whole integration. Many requests are smaller, and
running the full procedure on them costs time without adding accuracy.

- **One call, one field or one symptom** ("what is the v2.0 form of this POST", "why does this
  v2.0 read return nothing"): look the call up in the endpoint mapping, read the one reference
  that covers it (reads or writes), and answer directly with the v2.0 request, what changed in
  the body and the response, and the caveats that apply to that call. Skip the inventory table,
  the transport rework and the handoff report unless the user asks for them.
- **A function or a small module**: do the same per call, and add the version switch from step 4
  only if the code selects the API version itself.
- **An integration or a codebase**: run all eight steps.

At every size, separate what is documented from what you inferred. State API behaviour as fact
only when it is in the mapping, these references or the tenant's OpenAPI document; label anything
else as an inference to verify.

## Ground rules

Each rule exists because the failure it prevents is quiet.

1. **Map each call; never rewrite the prefix.** A v1.10 path has no twin under `/API/v2.0`.
2. **Use only documented mappings.** Take the v2.0 form from the endpoint mapping or the tenant's
   OpenAPI document. Do not infer one from naming symmetry; several names moved or changed meaning.
3. **Keeping a call on v1.10 is a valid result.** Three endpoints have no v2.0 equivalent, and
   some targets are newer than 9.0.0. Report what stayed and why instead of inventing a replacement.
4. **Do not change behaviour silently.** Where v2.0 does something different, such as removing a
   user from every account, show the difference and let the user decide.
5. **Touch only the API layer.** The bridge, origin checks, token handling and readiness loop do
   not change in this migration. Editing them widens the blast radius for no gain.
6. **A write is not migrated until it has been read back.** v2.0 drops unknown type keys and
   fields and still answers `200`, so a successful status proves nothing about the body.

## 1. Confirm the target

Establish these before reading code, and ask the user for anything that cannot be found:

- **Tenant and version.** v2.0 needs FieldTwin 9.0 or later. Fetch the tenant's
  `/API/v2.0/documentation/oas3.json` when it is reachable and confirm the operations the
  integration will need. If it is not reachable, continue from the mapping and say in the handoff
  that the tenant was not checked.
- **Credential.** An embedded integration uses the short-lived JWT from `loaded`; a server uses an
  account API token in the `token` header. The type matters: `/users` writes accept a JWT only,
  and an API token must name `updatedBy` on project and sub-project PATCHes.
- **Scope of the move.** Full cutover, or incremental with both versions in use. Default to
  incremental: it matches how the platform is served and keeps rollback cheap.

## 2. Inventory every v1.x call

List each call with its method, path, headers, query parameters, request body shape, the response
fields the code actually consumes, and where its IDs come from. The consumed fields matter as much
as the path, because most of the work is in the parsers.

Search for these, then trace every helper that builds a path from fragments or configuration:

| Look for | It indicates |
| --- | --- |
| `API/v1.`, `APIVersion`, `/subProject/`, `/subProjects/` | Any v1.x call or version selection |
| `/batch` | v1.10 batch routes, which become the stream endpoint itself |
| `stagedAsset/`, `connection/`, `well/`, `wellBore/`, `layer/` | Singular per-resource routes and nested parents |
| `initialState`, `fromWaterLevel` | Fields that are flattened or replaced |
| `include-last-modified`, `merge-foreign`, `foreignSubProjects` | Headers and containers that no longer exist |
| `/basic`, `shareUrl`, `allowedConnectionTypes`, `integrations` | Renamed or folded concepts |
| `metadatadefinition`, `metadatagroup`, `metadatumlink`, `metadatagrouplink` | Lower-case metadata routes, with `type` becoming `kind` |
| `delete-from-instance`, `/users`, `/userRoles` | User management, including one behaviour change |
| `/changes`, `segmentsAboveSurface`, `/tags` | Endpoints with no v2.0 equivalent |
| `connectionCrossings/v2`, `accountWorkflowTemplate`, `projectWorkflowTemplate` | Routes folded into a header or an attribute |

Include tests, mocks and recorded fixtures. Fixtures encode v1.10 response shapes, and a test that
still passes against an old fixture hides an unmigrated parser.

## 3. Map, classify, and confirm

Look up every inventoried call in
[references/endpoint-mapping.md](references/endpoint-mapping.md) and give it one class:

- **Direct**: same operation on a stream path, such as `heightSamples` or `geojson`.
- **Reshaped**: same data through a stream GET with filters, or a batch body.
- **Moved**: created or deleted on the owning stream, or the parent moved from the path into the
  body.
- **Folded**: became an attribute, a header or a different type name.
- **No equivalent**: stays on v1.10 or takes the documented alternative.
- **Behaviour change**: the nearest v2.0 form does something different.

Show the result as a table before editing anything:

```markdown
| # | v1.x call | Used for | v2.0 form | Class | Decision needed |
| --- | --- | --- | --- | --- | --- |
| 1 | GET SP/stagedAssets | Asset list panel | GET /subProjects/ID?resourceTypes=stagedAssets | Reshaped | None |
| 2 | GET SP/tags | Tag filter | None | No equivalent | Keep on v1.10, or aggregate ?attributes=tags |
```

Then ask the user to confirm it in one question that names every **No equivalent** and
**Behaviour change** row and gives a recommendation for each. Proceed with the rest while waiting
only when those rows are independent of it. This checkpoint is where a wrong assumption is cheap
to fix.

## 4. Rework the transport

- **Take the version from configuration, not from `loaded` and not from a constant.** On 9.0 the
  `loaded` event still names v1.10, so reading it would never select v2.0, and hard-coding v2.0
  removes the way back. One setting per deployment lets a tenant be switched back.
- **Hold one API root per version** while both are in use, built from the same trusted backend
  URL with its base path preserved.
- **Make the account ID explicit.** Every accounts-stream call needs it, and any account other
  than the credential's own gets `403`. `GET /users/whoami` is the reliable source: `me.account`
  is the one account an API token or an embedded-integration token is scoped to. A plain user JWT
  has no single account; its accounts are the keys of `me.accounts`, so the integration has to
  know which one it works in. Where configuration or the host's `loaded.account` supplies an
  expected ID, compare it with `whoami` once per session instead of trusting it.
- **Leave authentication, the readiness loop and qualified `SUBPROJECT:STREAM` IDs as they are.**

```javascript
// One root per version. Both are built from the backend URL the integration already trusts.
function apiRootFor(backendUrl, version) {
  const base = new URL(backendUrl)
  base.pathname = `${base.pathname.replace(/\/$/, '')}/API/${version}/`
  base.search = ''
  base.hash = ''
  return base
}

// `fetchV2` is the integration's existing authenticated fetch, bound to the v2.0 root.
async function resolveAccountId(fetchV2, expectedAccountId) {
  const response = await fetchV2('users/whoami')
  if (!response.ok) {
    throw new Error(`FieldTwin API returned ${response.status}`)
  }
  const { me } = await response.json()
  // API tokens and embedded-integration tokens are scoped to one account: `me.account`.
  // A plain user JWT has none, so it needs the expected ID and must be a member of it.
  const accountId = me?.account ?? expectedAccountId
  const reachable = me?.account ? [me.account] : Object.keys(me?.accounts ?? {})
  if (!accountId || !reachable.includes(accountId)) {
    throw new Error('FieldTwin account is unknown or does not belong to this credential')
  }
  if (expectedAccountId && accountId !== expectedAccountId) {
    throw new Error('FieldTwin account does not match the configured account')
  }
  return accountId
}
```

## 5. Migrate the reads

Follow [references/reads-and-envelope.md](references/reads-and-envelope.md).

- Replace per-resource and per-collection routes with one stream GET and `resourceTypes`,
  `resourceIds` and `attributes`. Merge reads that hit the same stream.
- Build each query from an explicit list of keys. Any other query parameter becomes an
  attribute-value filter and can empty the response without an error.
- Replace `/basic` routes and `include-last-modified` with headers, or drop them.
- Rewrite every parser: type, then ID; the root under its own type key; relationships as IDs and
  to-many relationships as arrays; unset fields absent instead of `null`; backdrop resources in
  the same maps with `isForeign: true`.
- Treat a missing type key as an empty result, never as an error. A filtered read leaves a type
  out when nothing matched.
- With `attributes`, name every field the code reads. Everything else except `id` is dropped,
  `lastModified` included.
- Where the code used an embedded object, look the ID up in the matching type map, which may be
  on another stream.

## 6. Migrate the writes

Follow [references/writes-and-batches.md](references/writes-and-batches.md).

- Turn each mutation into a batch on the stream that owns the resource. Projects are created and
  deleted on the accounts stream, sub-projects on the projects stream.
- Order type keys by dependency. There are no temporary IDs, and sub-project IDs are generated by
  the server, so a new parent and its new child take two requests there. Handle the case where the
  second fails after the first has committed.
- Move parents from the path into the body (`well`, `connection`, `wellBore`) and apply field
  changes such as `initialState` to flat `x` and `y`, and metadata `type` to `kind`.
- Stop using response bodies as the new state. POST answers IDs, PATCH answers `{}`, DELETE
  answers an empty body; read the result back by ID.
- Add `updatedBy`, the e-mail address of the user making the change, where an API token patches a
  project or sub-project. It replaces the v1.10 `userEmail` field.
- Check every field of a migrated body against the operation's schema. A field that kept its
  v1.10 name is dropped without an error.

## 7. Handle gaps and behaviour changes

Follow [references/behavior-changes.md](references/behavior-changes.md).

- For each **No equivalent** call, apply the user's decision: keep it on v1.10 through the v1.10
  root, or implement the documented alternative and say that it is now computed client-side.
- Walk the behaviour-change list against what the integration relies on. Numeric strings are the
  usual casualty: convert values that come from forms, spreadsheets or environment variables.
- For targets marked newer than 9.0.0, confirm them in the tenant's OpenAPI document or leave the
  call on v1.10.

## 8. Validate

- Run the migration checklist in [references/behavior-changes.md](references/behavior-changes.md).
- Update tests and fixtures to v2.0 shapes; do not leave a parser tested only against v1.10 data.
- Against a QA tenant, use a credential with the same role as production and compare v1.10 and
  v2.0 results by meaning. A count that dropped to zero usually means a leftover query parameter.
- Exercise one write of each migrated type end to end: send, read back, compare.
- Flip the version setting back to v1.10 and confirm the integration still works. A rollback that
  was never exercised is not a rollback.

State plainly what was verified against a live tenant and what was verified only against the
mapping.

## Handoff format

Report:

- **Mapping**: the confirmed table, with the class of every call.
- **Changed**: transport, reads, writes, tests and fixtures.
- **Kept on v1.10**: each call and the reason.
- **Decisions**: every behaviour change and what the user chose.
- **Validation**: what ran against a tenant, what did not, and the comparison result.
- **Rollback**: the setting that selects the version and the result of switching it back.
