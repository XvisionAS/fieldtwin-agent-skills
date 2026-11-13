# FieldTwin API v2.0

API v2.0 normalizes FieldTwin data around event-stream roots. Each root has one GET and one batch
POST/PATCH/DELETE surface, with a small set of specialized endpoints. It is available from
FieldTwin 9.0, served next to v1.10. Use it only after verifying that the target tenant exposes the
required v2 operations.

Read [backend-api.md](backend-api.md) first and [backend-api-batch.md](backend-api-batch.md) before
mutations. Query [api-attributes.md](api-attributes.md) for the exact readable and writable fields
of a stream/resource/method tuple.

This reference describes the v2.0 contract. To move existing v1.10 calls to it, use the
`upgrade-fieldtwin-integration` skill, which carries the endpoint-by-endpoint mapping.

## Availability and live OpenAPI

The target tenant is authoritative. Check:

```text
GET {backendUrl}/API/v2.0/documentation
GET {backendUrl}/API/v2.0/documentation/oas3.json
```

The documentation endpoints can be public while data routes require authentication. Some older
pre-release material used a different OAS path; prefer the path advertised by the deployed
documentation page. Do not infer support from the version number alone: check the operation and
schema in the live OAS document. The public [API v2.0 reference](https://api.fieldtwin.com/) shows
the current release; a tenant on an earlier 9.x build can lack its newest operations.

Operations added after the 9.0.0 release, which a 9.0.0 tenant does not serve: the three `/logs`
endpoints, `PUT /accounts/{accountId}/customTabs/manifest`, and the `include-assets` header.

## Stream roots

| Stream | CRUD path | What the selected stream owns |
| --- | --- | --- |
| Users | `/API/v2.0/users` | Instance users |
| Account | `/API/v2.0/accounts/{accountId}` | One account and its account-owned configuration/resources |
| Project | `/API/v2.0/projects/{projectId}` | One project and its project-owned configuration/subprojects |
| Subproject | `/API/v2.0/subProjects/{qualifiedSubProjectId}` | One branch's layout resources plus readable parents |
| Workflow tasks | `/API/v2.0/workflowTasks` | Workflow tasks, comments, and task documents visible in scope |

The authenticated gateway confirms that path IDs belong to the credential's account/project
scope. Do not set context headers yourself. The account ID in the path must be the account the
credential belongs to; any other ID gets `403`. `GET /users/whoami` reports that account.

Users and workflow tasks have one logical root route without a path ID. Account, project, and
subproject routes require the root ID. A subproject ID keeps the `{id}:{streamId}` form; a bare ID
means the default stream of that subproject.

## Uniform CRUD meanings

| Method | Meaning | Body/response |
| --- | --- | --- |
| `GET` | Read selected stream resources | Response maps plural resource types to ID-keyed objects |
| `POST` | Create supported resources in the selected stream | Body has per-type `{ items, globals?, totalNumberOfItems? }`; response maps types to created ID arrays |
| `PATCH` | Partially update supported resources in the selected stream | Body has per-type ID-keyed patches plus optional `globals`; `200` with `{}` |
| `DELETE` | Delete supported resources from the selected stream | Body maps types to ID arrays; `200` with an empty body |

This is not REST CRUD on the root path object alone. The URL chooses a stream; the body chooses
which resource types inside that stream to mutate. No mutation returns the changed resources:
read them back by ID.

## GET response envelope

```json
{
  "subProjects": {
    "subproject-01:stream-02": {
      "id": "subproject-01:stream-02",
      "name": "Concept A"
    }
  },
  "stagedAssets": {
    "asset-01": {
      "id": "asset-01",
      "name": "Manifold M-01"
    }
  },
  "connections": {
    "connection-01": {
      "id": "connection-01",
      "from": "asset-01",
      "to": "asset-02"
    }
  }
}
```

Every top-level collection name is plural and every collection is an object keyed by resource ID.
The root resource appears under its own plural resource type when included by filtering.

Rules that hold for every stream:

- Relationships are IDs, never expanded resources. A to-many relationship is an array of IDs.
- `lastModified` is returned by default; the v1.10 `include-last-modified` header is ignored. An
  `attributes` projection drops it unless it is named, and resources that are not stored as
  events do not have it.
- Nulls are omitted: an unset field is absent, not `null`.
- A missing type key is normal, not an error. A filtered read leaves a type out when nothing
  matched, while an unfiltered read keeps its empty types. Iterate an absent type as empty.
  Rights and filters can also remove data, so absence does not prove that resources were deleted.

For subprojects:

- the response can include the requested subproject and readable local/external parents;
- calculated metadata is attached as `metaData` on the owning resource rather than returned as a
  standalone `metaDatumValues` collection;
- staged-asset sockets can be calculated/augmented;
- connections can include sampled geometry when requested;
- backdrop (parent) resources sit in the same type maps with `isForeign: true`, and each carries
  `getFrom` and `getFromSubProject` links to the v2.0 stream of its own subproject. Send
  `no-foreign: true` to leave them out.

## GET filtering

The generic stream GET supports:

- `resourceTypes`: comma-separated plural resource-type names;
- `resourceIds`: comma-separated IDs;
- `attributes`: comma-separated attribute names that define each resource's complete output
  shape. `id` is always kept and unknown names are ignored; every other field that is not named
  is dropped, including relationships, computed fields such as `lastModified`, and `metaData`;
- `at`: a point in time (`latest`, a Unix time or an ISO date) on stream reads that support it;
- attribute-value filters: any other query key, described below.

Build them with `URLSearchParams`:

```javascript
const query = new URLSearchParams({
  resourceTypes: ['subProjects', 'stagedAssets', 'connections'].join(','),
  resourceIds: ['asset-01', 'connection-01'].join(','),
})

const path = `subProjects/${encodeURIComponent(qualifiedId)}?${query}`
```

Rules:

1. An unknown `resourceTypes` value is rejected with `422` and a message naming the invalid types.
2. When `resourceTypes` is present, only those types are considered.
3. `resourceIds` then filters resources inside that selected set.
4. Without `resourceTypes`, `resourceIds` searches all filterable types in the stream.
5. A root resource is filtered like any other resource. It appears only when its type is selected,
   or when an untyped `resourceIds` query matches it.
6. Root IDs accept plain document IDs and qualified `{id}:{streamId}` forms where applicable.
7. No match leaves that resource type out; it is not necessarily an error.

Root-type filtering applies to accounts, projects, and subprojects. Users and workflow tasks always
return their root resources and reject non-applicable root-type values.

Filtering covers the resources augmented into each stream, including account projects and folders,
project subprojects/connection configuration, subproject layout relationships, users by ID, and
workflow task relationships.

### Attribute-value filters

Every query key that is not `resourceTypes`, `resourceIds`, `attributes`, `at`, `limit`, `after`
or `sortOrder` is treated as an attribute-value filter:

```text
GET /API/v2.0/subProjects/{id}?resourceTypes=connections&visible=true
```

- Values within one key are combined with OR; different keys are combined with AND.
- A metadata value is filtered with `metaData|{definitionId}=value`, on the subprojects stream
  only. Any other stream answers `422`.
- An unrecognised key does not fail. It filters the response, often down to nothing. Never
  forward an arbitrary or legacy query string to a stream GET; build the query from named keys.

### Workflow task filters

`GET /API/v2.0/workflowTasks` applies these as attribute-value filters, some with their own
matching rule:

| Query | Type | Match |
| --- | --- | --- |
| `assignedUsers` | comma-separated user IDs | Any listed user |
| `column` | one column ID or vendor ID | Task's workflow column |
| `linkedResources` | comma-separated resource IDs | Any linked resource |
| `tags` | comma-separated tags | Any listed tag |
| `startDate` | Unix timestamp integer | Task starts on or after it |
| `endDate` | Unix timestamp integer | Task ends on or before it |
| `done` | boolean | Completion state |
| `project` | project ID | Exact owning project |
| `subProject` | subproject ID | Owning subproject; normalized to its qualified main-stream form where needed |

Different provided filters are combined with AND. Values within `assignedUsers`,
`linkedResources`, and `tags` use any-match semantics. A malformed filter value matches nothing;
it does not answer `400`. v1.10 called the `linkedResources` filter `resources`.

## GET option headers by stream

Send only the options documented for that stream:

| Stream | Supported response options |
| --- | --- |
| Users | `basic`, `include-visibility-settings` |
| Accounts | None on the generic stream GET |
| Projects | `basic` |
| Subprojects | `no-foreign`, `no-metadata`, `no-intermediary`, `raw-intermediary`, `sample-every`, `only-active`, `include-assets` |
| Workflow tasks | None on the generic stream GET |

`basic: true` replaces the v1.10 `/users/basic` and `/{projectId}/basic` routes.
`include-assets: true` adds top-level `assets` and `virtualAssets` maps holding the definitions of
the returned staged assets, so one request resolves a staged asset's `asset` ID; it was added
after 9.0.0. The same headers apply to a stream's `/resources` and `/resources/count` endpoints. Special endpoints define their
own headers and query parameters.

## Supported mutation resource types

The live OpenAPI is the exact source because schemas expand as FieldTwin models evolve. The
following catalog documents the current normalized families and the important ownership boundary.

### Users stream

- POST/PATCH/DELETE: `users`.
- User POST does not support generating anonymous/default entries with `totalNumberOfItems`; each
  user requires its identifying fields.
- License and instance-administrator fields require corresponding administrative rights.

### Account stream

Common POST families:

- child root: `projects`;
- account documents, tags, customers, users, user roles, regions, project phases, tree-view folders;
- workflow templates, columns, task templates, template groups, template links, and group links;
- metadata definitions (`metaData`), metadata links, groups, and group links;
- virtual assets and custom tabs;
- connection definitions (`connections`), connection types, connection segment types, connectors;
- well, well-bore, well-bore-segment, layer, reservoir, point-cloud, Gaussian-splat, shape, and
  annotation types;
- staged-asset statuses and ArcGIS Online portals.

PATCH supports the account root (`accounts`) plus most account-owned families, and
`designTypeByAssetsCategories`, the account matrix that v1.10 exposed as
`allowedConnectionTypes`. The workflow task template links and group links can be created and
deleted but not patched. DELETE supports child projects, `documentRevisions` and the deletable
account-owned resources, but not the account root itself and not `userRoles`.

`users` on the account stream is account membership: POST needs `mail` and `userRoleId` and sends
the invitation, and DELETE removes the user from the account and its projects without deleting
the user. Organisation-level user records are the separate users stream.

`connections` here are connection definitions. The connections drawn in a layout are `connections`
on the subproject stream.

### Project stream

Common POST families:

- child root: `subProjects`;
- project metadata definitions/links/groups/group links and virtual assets;
- connection definitions/types and resource type definitions for connections, wells, bores,
  segments, connectors, layers, reservoirs, point clouds, Gaussian splats, shapes, and annotations.

PATCH supports the project root (`projects`), child `subProjects`, and the project-owned
configuration families exposed by OAS. DELETE removes child subprojects and deletable project
configuration, not the project root.

### Subproject stream

POST:

- `stagedAssets`, `connections`, `connectionSegments`;
- `wells`, `wellBores`, `wellBoreSegments`;
- `layers`, `overlays`, `customCosts`, `shapes`, `annotations`, `documents`;
- `reservoirs`, `pointClouds`, `gaussianSplats`, `sceneModels`.

PATCH additionally exposes the root `subProjects` resource. DELETE exposes the layout resources
and `documentRevisions`, but not the root subproject itself. Create/delete the subproject root
through its owning project stream.

Children name their parent in the body: `wellBores` require `well`, `connectionSegments` require
`connection`, and `wellBoreSegments` require `wellBore`. Every ID in this stream is generated by
the server; a client-supplied `id` is dropped.

### Workflow-task stream

POST/PATCH/DELETE:

- `workflowTasks`;
- `workflowComments`;
- `documents` linked to workflow tasks.

DELETE additionally accepts `documentRevisions`. The workflow task root is intentionally mutable
in this stream because the endpoint represents the shared workflow-task stream rather than one
task ID path.

## Root ownership examples

Create a subproject in a project stream:

```http
POST /API/v2.0/projects/project-01
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "subProjects": {
    "items": [
      { "name": "Concept B" }
    ]
  }
}
```

Delete it from the same parent stream:

```http
DELETE /API/v2.0/projects/project-01
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "subProjects": ["subproject-02"]
}
```

Sending a stream's own root to its own `DELETE` is refused with `403`.

Patch the existing root from its own stream:

```http
PATCH /API/v2.0/subProjects/subproject-02%3Astream-03
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "subProjects": {
    "subproject-02:stream-03": {
      "name": "Concept B reviewed"
    }
  }
}
```

## Specialized endpoints

| Method/path | Purpose |
| --- | --- |
| `GET /users/whoami` | Which credential arrived (`jwt`, `apiToken` or `delegated`), the account it is scoped to, and its role and rights per account and project. |
| `GET /{stream}/{id}/resources` | Every resource of a stream as one flat list, whole or paged with `limit` (1 to 1000), `after` and `sortOrder`; the last page has no `paging.after`. `/users/resources` and `/workflowTasks/resources` take no ID. |
| `GET /{stream}/{id}/resources/count` | Resource counts by type for the same filters. |
| `GET /accounts/{accountId}/summary` | Account size as counts: projects, subprojects, members and catalogues. |
| `GET /accounts/{accountId}/logs`, `GET /projects/{projectId}/logs`, `GET /subProjects/{id}/logs` | Changes saved to the stream, paged, oldest first by default; narrow with `from`, `to`, `category`, `name` and `resourceId`. Account logs need account admin rights. Added after 9.0.0. |
| `PUT /accounts/{accountId}/customTabs/manifest` | Create a custom tab from an integration manifest file or a `{ "url": ... }` body; answers `{ "customTabs": ["ID"] }`, or `409` for a duplicate ID. Added after 9.0.0. |
| `PUT /accounts/{accountId}/documents` | Upload a file and create an account document. |
| `PUT /subProjects/{id}/documents` | Upload a file and create a subproject document. |
| `PUT /workflowTasks/{taskId}/documents` | Upload a file and create a task document. |
| `GET /subProjects/{id}/loadingStatus` | Loading and readiness state as a `200` body, including layer progress. The sibling `isReady` uses the state as its HTTP status. |
| `GET /accounts/{accountId}/vendorAttributes` | Account, ancestor, project, and subproject vendor attributes visible in scope. |
| `GET /projects/{projectId}/vendorAttributes` | Project vendor attributes. |
| `GET /subProjects/{id}/vendorAttributes` | Subproject vendor attributes without loading the full layout pod. |
| `GET /subProjects/{id}/viewOnlies` | Generate/return a view-only URL; v1.10 calls this `shareUrl`. |
| `GET /subProjects/{id}/summary` | Cheap account-side layout inventory; does not start the complete subproject pod. |
| `GET /subProjects/{id}/hierarchy` | Parent hierarchy; `flat` defaults true, `false` asks for a nested tree. |
| `GET /subProjects/{id}/geojson` | GeoJSON representation of the layout. |
| `POST /subProjects/{id}/heightSamples` | Sample a list of points against layers. |
| `POST /subProjects/{id}/connectionCrossings` | Detect crossings; supports calculation and optional streaming headers. |
| `POST /subProjects/{id}/schematics` | Generate SVG by default or topology JSON with `?format=graph`. |

Document uploads use multipart form data and are limited to 50 MB per request. Let the browser set
its `Content-Type` boundary. Use the live OAS document for field names and response schemas.

The chunked crossing feed that v1.10 exposed as `connectionCrossings/v2` is the same
`connectionCrossings` endpoint with the header `stream: true`.

### Schematics media types

- omitted `format` or `?format=svg`: `image/svg+xml`;
- `?format=graph`: `application/json` topology without layout coordinates.

Check `Content-Type` before parsing.

### Connection-crossing modes

Supported options can include `sample-every`, `use-depth`, `depth-tolerance`,
`use-foreign-connections`, `cluster-distance`, and `stream`. When `stream: true` selects a chunked
progress feed, consume it incrementally and cancel the reader on teardown; do not call
`response.json()` on the whole stream.

## Subproject summary

`GET /subProjects/{id}/summary` returns one entry per subproject contributing to the visible layout
plus totals across the layout:

```json
{
  "subProjects": {
    "subproject-01": {
      "id": "subproject-01:stream-01",
      "name": "Concept A",
      "isForeign": false,
      "connections": 20,
      "stagedAssets": 8
    },
    "parent-01": {
      "id": "parent-01:parent-stream-01",
      "name": "Shared base",
      "isForeign": true,
      "connections": 3,
      "stagedAssets": 1
    }
  },
  "connections": 23,
  "stagedAssets": 9
}
```

- Counts are the default and every supported type is listed, including zero values.
- `?includeIds=true` replaces counts with deduplicated ID arrays.
- Top-level values are totals across the displayed layout, not a simple concatenation if an ID is
  visible more than once.
- `isForeign` distinguishes the requested subproject from backdrop/parent entries.
- A parent in another FieldTwin instance is keyed with a qualified ID and can include `backendUrl`.
- Remote parents are recursively summarized only within the safety boundary documented by the
  serving instances; the call does not continue through a third instance.
- If an external parent cannot be read, the whole request fails with `502`; never treat the partial
  layout as complete.
- `?noExternalParents=true` excludes other-instance parents and is also used between instances to
  terminate recursion.

Use summary for counts/navigation decisions. Use the generic subproject GET when the integration
needs actual resources.

## Example: get selected layout types

```javascript
async function getLayoutResources(bridge, resourceTypes) {
  const context = bridge.getContext()
  const qualifiedId = qualifySubProjectId(context.subProject, context.stream)
  const query = new URLSearchParams({ resourceTypes: resourceTypes.join(',') })
  const path = `subProjects/${encodeURIComponent(qualifiedId)}?${query}`
  const response = await bridge.apiFetch(path)

  if (!response.ok) {
    throw await readFieldTwinError(response)
  }
  return response.json()
}

const layout = await getLayoutResources(bridge, [
  'subProjects',
  'stagedAssets',
  'connections',
])
```

This helper assumes the bridge was bootstrapped with `APIVersion: "v2.0"`. Do not use it through a
bridge whose trusted context says `v1.10`.

## v2 validation checklist

- Fetch the tenant OAS document and confirm every required operation/schema.
- Keep plural resource type names exact and reject unknown requested types locally; the API
  answers `422` for them.
- Test `resourceTypes`, `resourceIds`, `attributes`, their precedence, and root inclusion.
- Confirm no unintended query key reaches a stream GET, where it would act as a filter.
- Test plain and qualified subproject IDs, including parents.
- Confirm GET containers are type maps keyed by IDs, with relationships as IDs and unset fields
  absent.
- Create/delete child roots through the parent stream.
- Keep every mutation in one stream, use the returned ID arrays, and read results back.
- Handle the `{}` PATCH body and the empty DELETE body.
- Parse SVG, JSON, multipart, and chunked endpoints by media type.
- Use summary without waiting for a layout pod; use the full GET only when data is needed.
- Treat external-parent `502` as a failed complete result.
- Do not depend on v1.10 singular item routes or response wrappers in v2 code.
