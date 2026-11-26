# Migrating reads: streams, filters and the v2.0 envelope

Use this reference for step 5 of the upgrade workflow, after each call has been mapped with
[endpoint-mapping.md](endpoint-mapping.md). All identifiers are fictional.

## Contents

- [The URL model](#the-url-model)
- [One envelope instead of four shapes](#one-envelope-instead-of-four-shapes)
- [Filter instead of choosing a route](#filter-instead-of-choosing-a-route)
- [Every unknown query parameter is a filter](#every-unknown-query-parameter-is-a-filter)
- [Reads that are new in v2.0](#reads-that-are-new-in-v20)
- [Example: read a project](#example-read-a-project)
- [Rewriting the parser](#rewriting-the-parser)

## The URL model

v1.10 had one route per resource, and the account was implied by the credential. v2.0 has five
streams, each with `GET`, `POST`, `PATCH` and `DELETE` on a single path:

| Stream | Path | Holds |
| --- | --- | --- |
| accounts | `/accounts/ACCOUNT_ID` | Account settings, types, metadata definitions, tags, projects, members |
| projects | `/projects/PROJECT_ID` | Project settings, project-level catalogues, sub-projects |
| subProjects | `/subProjects/SUBPROJECT:STREAM` | Assets, connections, wells, layers, shapes, documents, annotations |
| users | `/users` | The caller and organisation-level user records |
| workflowTasks | `/workflowTasks` | Tasks, comments and task documents |

Three rules follow:

- The account ID is explicit and must be the account the credential belongs to. Any other ID gets
  `403`. An embedded integration reads it from the `loaded` message as `account` and uses it as
  it is: FieldTwin checks the token against the account in the URL, so no check call is needed.
- A resource is created and deleted on the stream that owns it. Projects are created and deleted
  on the accounts stream, sub-projects on the projects stream.
- Sub-project IDs keep the `SUBPROJECT:STREAM` form. A bare ID still means the default stream of
  that sub-project, as in v1.10.

There is no prefix rewrite. `/API/v1.10/PROJECT_ID/subProject/SUBPROJECT_ID/stagedAssets` has no
twin at `/API/v2.0/PROJECT_ID/...`; the project segment disappears and the collection becomes a
filter on the subProjects stream.

## One envelope instead of four shapes

v1.10 collections came back in four shapes depending on the route: a map keyed by ID, a map keyed
by type and then ID, a type key holding an array, or a bare array. v2.0 always returns one shape:

```json
{
  "projects": { "project-01": { "id": "project-01" } },
  "subProjects": { "subproject-01:stream-01": { "id": "subproject-01:stream-01" } },
  "wellTypes": { "well-type-01": { "id": "well-type-01" } }
}
```

What changes for the code that reads it:

- **The root sits under its own type key.** Sub-projects are keyed by their qualified ID.
- **Relationships are IDs.** A to-many relationship is an array of IDs where v1.10 returned a
  `{ "ID": true }` map. Nothing is expanded inline: a staged asset's `asset` is an ID, not the
  asset object that the v1.10 single GET embedded.
- **`lastModified` comes back by default.** v1.10 only added it for `include-last-modified: true`;
  v2.0 ignores that header. Two exceptions: an `attributes` projection drops it unless
  `lastModified` is named, and resources that are not stored as events (user settings, for
  example) do not have it.
- **Nulls are omitted.** An unset field is absent, not `null`.
- **Backdrops are flattened.** v1.10 merged backdrop (parent) resources into the collections with
  `merge-foreign`, or nested them under `foreignSubProjects`. v2.0 puts them in the same type maps
  with `isForeign: true`. Send `no-foreign: true` to leave them out. Each foreign resource also
  carries `getFrom` and `getFromSubProject` links to the v2.0 stream of its own sub-project.
- **A missing type key is normal, not an error.** A filtered read (`resourceTypes`,
  `resourceIds` or a value filter) leaves a type out when nothing matched; an unfiltered read
  keeps its empty types. Read an absent type as "nothing returned" and iterate it as empty: code
  that throws on a missing key breaks the first time a sub-project has no connections. Rights and
  filters can also remove data, so absence is not proof that resources were deleted either.

## Filter instead of choosing a route

Where v1.10 had `GET .../stagedAssets`, `GET .../stagedAsset/ID` and `GET .../basic`, v2.0 has
query parameters and headers on the stream GET:

| You want | v2.0 |
| --- | --- |
| One collection | `?resourceTypes=stagedAssets` |
| One resource | `?resourceTypes=stagedAssets&resourceIds=ID` |
| The root alone | `?resourceTypes=projects` (name the root's own type) |
| Only some fields | `?attributes=name,x,y` (`id` is always kept, unknown names are ignored) |
| Resources matching a value | `?resourceTypes=connections&visible=true` (OR within a key, AND across keys) |
| A metadata value, sub-projects only | `?metaData\|DEFINITION_ID=value` |
| The reduced user or project payload | header `basic: true` (replaces `/users/basic` and `/PROJECT_ID/basic`) |
| Sub-project geometry options | headers `no-metadata`, `no-intermediary`, `raw-intermediary`, `sample-every`, `only-active`, `no-foreign` |

Several v1.10 reads usually collapse into one v2.0 request. An integration that fetched staged
assets, connections and wells with three calls can ask for
`?resourceTypes=stagedAssets,connections,wells` once.

`attributes` defines the complete output shape of each resource, not a list of extras. Apart from
`id`, every field that is not named is dropped, including relationships such as a connection's
`from` and `to`, computed fields such as `tags`, `cost`, `length` and `lastModified`, and
`metaData`. Name everything the code reads.

The `at` query parameter (`latest`, a Unix time or an ISO date) keeps working on stream reads.

## Every unknown query parameter is a filter

Any query key that is not `resourceTypes`, `resourceIds`, `attributes`, `at`, `limit`, `after` or
`sortOrder` is treated as an attribute-value filter. A parameter left over from a v1.10 call does
not fail: it silently filters the response down, often to nothing. This is the most common way a
migrated read returns an empty result without an error.

Build every v2.0 query from an explicit list of keys instead of forwarding the old query string.

- An unknown resource type is rejected with `422`:
  `The following resource types are not valid for filtering from accounts: ...`.
- A metadata filter outside the subProjects stream is rejected with
  `metaData filters are not available from accounts, only from subProjects`.

## Reads that are new in v2.0

These have no v1.10 counterpart and often replace client-side work:

- `GET /STREAM/ID/resources?limit=100&after=CURSOR&sortOrder=asc` pages through every resource of
  a stream as a flat list (`limit` 1 to 1000; the last page has no `paging.after`), and
  `GET /STREAM/ID/resources/count` counts them by type.
- `GET /accounts/ID/summary` and `GET /subProjects/ID/summary` give counts without loading the
  data.
- `GET /users/whoami` tells you which credential arrived and what it may do in each account.
- `GET /accounts/ID/logs`, `GET /projects/ID/logs` and `GET /subProjects/ID/logs` page through the
  changes saved to a stream, oldest first by default; narrow them with `from`, `to`, `category`,
  `name` and `resourceId`. Account logs need account admin rights. These three were added after
  the 9.0.0 release, so confirm them in the tenant's OpenAPI document.

## Example: read a project

v1.10 returned the project as one flat object with the sub-projects, admins and members nested
inside it:

```http
GET /API/v1.10/project-01
```

```json
{
  "id": "project-01",
  "name": "Concept study",
  "admins": [{ "name": "Ada Example", "mail": "ada@example.com" }],
  "members": ["..."],
  "userRights": [{ "userId": "user-01", "userRole": "Administrator", "canAdmin": true }],
  "subProjects": {
    "subproject-01:subproject-01": { "id": "...", "name": "Base case", "locked": false }
  }
}
```

v2.0 returns an envelope. The project refers to its users and sub-projects by ID, and each of
those is listed under its own type, together with the project-level catalogues:

```http
GET /API/v2.0/projects/project-01
```

```json
{
  "projects": {
    "project-01": {
      "id": "project-01",
      "name": "Concept study",
      "creator": "ada@example.com",
      "public": true,
      "users": ["user-01", "user-02"],
      "subProjects": ["subproject-01:subproject-01", "subproject-02:subproject-02"],
      "workflowTemplate": "workflow-template-01",
      "lastModified": "2026-06-23T13:43:47.228Z"
    }
  },
  "subProjects": {
    "subproject-01:subproject-01": {
      "id": "subproject-01:subproject-01",
      "name": "Base case",
      "project": "project-01",
      "locked": false,
      "lastModified": "2024-09-23T16:13:28.383Z"
    }
  },
  "users": {
    "user-01": { "id": "user-01", "mail": "ada@example.com", "name": "Ada Example" }
  },
  "wellTypes": { "...": "..." },
  "connectionTypes": { "...": "..." }
}
```

Code that read `project.subProjects[id].name` now reads `envelope.subProjects[id].name`, and code
that read `project.admins` has to resolve user IDs through `envelope.users` and the role data.

## Rewriting the parser

Build the path from a fixed set of keys so nothing from the v1.10 query string leaks through:

```javascript
function streamReadPath(stream, rootId, { resourceTypes, resourceIds, attributes, filters } = {}) {
  const query = new URLSearchParams()
  if (resourceTypes?.length) query.set('resourceTypes', resourceTypes.join(','))
  if (resourceIds?.length) query.set('resourceIds', resourceIds.join(','))
  if (attributes?.length) query.set('attributes', attributes.join(','))
  // Attribute-value filters are opt-in and named by the caller, never forwarded.
  for (const [name, value] of Object.entries(filters || {})) query.set(name, String(value))

  const root = rootId ? `${stream}/${encodeURIComponent(rootId)}` : stream
  const search = query.toString()
  return search ? `${root}?${search}` : root
}
```

Read a collection through the envelope, treating an absent type as empty:

```javascript
function collection(envelope, resourceType) {
  // A filtered read omits a type when nothing matched, so absent and empty read the same.
  return Object.values(envelope[resourceType] ?? {})
}
```

Where one code path has to serve both versions during an incremental migration, normalise
to-many relationships at the boundary instead of branching at every use:

```javascript
// v1.10 returned { "ID": true } maps; v2.0 returns arrays of IDs.
function relationshipIds(value) {
  if (Array.isArray(value)) return value
  return value && typeof value === 'object' ? Object.keys(value) : []
}
```

Checks to run on every migrated read:

- every consumer of a `null` test still works when the field is absent;
- no code path throws, warns or reports a failure when a requested type key is missing;
- every place that used an embedded object (for example `stagedAsset.asset.name`) now looks the
  ID up in the matching type map. That map can live on another stream: asset definitions are
  `assets` on the accounts stream, so this lookup is a second, cacheable request. A staged asset
  built from a virtual asset points at its definition through `virtualAsset`, not `asset`.
  Sub-project reads also accept the header `include-assets: true`, which adds top-level `assets`
  and `virtualAssets` maps for the staged assets returned, so one request resolves both. The
  header was added after 9.0.0 and is not in the migration guide; confirm it in the tenant's
  OpenAPI document before relying on it;
- foreign resources are either wanted (`isForeign` handled) or excluded with `no-foreign: true`;
- nothing depends on array order or on the order of keys in a type map.
