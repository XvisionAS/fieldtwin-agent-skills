# v1.10 to v2.0 endpoint mapping

Look up every v1.x call here before rewriting it. A call that is not in these tables has no
documented v2.0 form: check the tenant's live OpenAPI document, and if it is not there either, keep
the call on v1.10 and report it.

Reconciled on 2026-11-13 with the FieldTwin Docs page *Public API, 4. Migrate to v2.x* and the
FieldTwin 9.0 API contract. The target tenant's `/API/v2.0/documentation/oas3.json` wins where it
differs.

## Contents

- [Notation](#notation)
- [Account and configuration](#account-and-configuration)
- [Users and roles](#users-and-roles)
- [Projects](#projects)
- [Sub-project lifecycle](#sub-project-lifecycle)
- [Sub-project resources](#sub-project-resources)
- [Documents](#documents)
- [Workflow](#workflow)
- [Metadata](#metadata)
- [Compute and export](#compute-and-export)
- [Readiness and the rest](#readiness-and-the-rest)
- [Renamed and folded concepts](#renamed-and-folded-concepts)
- [No v2.0 equivalent](#no-v20-equivalent)
- [Newer than 9.0.0](#newer-than-900)

## Notation

- v1.10 paths are relative to `/API/v1.10`. The account is implied by the credential.
- `SP/` stands for `/PROJECT_ID/subProject/SUBPROJECT:STREAM/`.
- v2.0 paths are relative to `/API/v2.0`. `ID` is the root ID of the stream in the path.
- "GET accounts `?resourceTypes=X`" means the accounts stream GET filtered to that type.
- `{X}` means the type key `X` in a batch body sent to that stream's `POST`, `PATCH` or `DELETE`.
- `{s}` in a v1.10 path means the plural was optional: both spellings existed.
- v1.9 calls map the same way. v1.10 inherits the v1.9 surface, so normalise the path to its
  v1.10 form and look it up here.

The five v2.0 streams are `accounts` (`/accounts/ACCOUNT_ID`), `projects` (`/projects/PROJECT_ID`),
`subProjects` (`/subProjects/SUBPROJECT:STREAM`), `users` (`/users`) and `workflowTasks`
(`/workflowTasks`).

## Account and configuration

| v1.10 | v2.0 |
| --- | --- |
| `GET /` | `GET /accounts/ID`; add `?resourceTypes=accounts` for the root alone |
| `PATCH /` | `PATCH /accounts/ID` with `{accounts}` (`name`, `accountIdentifier`, `vendorAttributes`, `workflowDefaultTemplate`) |
| `GET /vendorAttributes` | `GET /accounts/ID/vendorAttributes` |
| `GET /assets`, `GET /asset{s}/ID` | GET accounts `?resourceTypes=assets` (library and account assets) |
| `POST /assets`, `PATCH /assets/ID`, `DELETE /assets/ID` | `{virtualAssets}` on the accounts or projects stream |
| `GET /connectionTypes`, `GET /connectionType{s}/ID`, and writes | `connectionTypes` on the accounts and projects streams |
| `GET /connections`, `GET /connection{s}/ID`, `GET /PROJECT_ID/connections`, and writes | `connections` (definitions) on the accounts and projects streams |
| The 11 type families: `connectionSegmentTypes`, `wellBoreTypes`, `layerTypes`, `reservoirTypes`, `gaussianSplatTypes`, `pointCloudTypes`, `connectors`, `shapeTypes`, `wellTypes`, `wellBoreSegmentTypes`, `annotationTypes` (list, single GET, POST, PATCH, DELETE) | `?resourceTypes=FAMILY` and `{FAMILY}` on the accounts and projects streams |
| `GET /allowedConnectionTypes` | The `designTypeByAssetsCategories` attribute of the account |
| `PATCH /allowedConnectionTypes` | `PATCH /accounts/ID` with `{designTypeByAssetsCategories}`; both directions are written, an inner `null` removes one pair |
| `DELETE /allowedConnectionTypes` | The same PATCH with `{}` |
| `GET /integrations`, `POST /integrations` | `customTabs` (v2.0 adds PATCH and DELETE) |
| `PUT /integration{s}/manifest` | `PUT /accounts/ID/customTabs/manifest`; same file or `{ "url": ... }` body, answers `{ "customTabs": ["ID"] }` and `409` for a duplicate ID |
| `GET /customers` | GET accounts `?resourceTypes=customers` (v2.0 adds POST, PATCH and DELETE) |
| `GET /connectionCategories` | `GET /accounts/ID?resourceTypes=connectionCategories`; read-only platform defaults keyed by their numeric ID, the `category` of a connection definition |
| `/tags`, `/treeViewFolders` (all verbs) | `tags`, `treeViewFolders` on the accounts stream |
| `GET /logs` | `GET /accounts/ID/logs` (account admin); `days` and `from` become `from` and `to`, `reverseSortOrder=true` becomes `sortOrder=desc`, and the default order is now oldest first. Sign-ins and access errors are not listed |
| `GET /usage` | Walk `GET /subProjects/ID/logs?from=&to=` per sub-project and count the entries and distinct `userId` values |

## Users and roles

| v1.10 | v2.0 |
| --- | --- |
| `GET /users` | `GET /users` (the credential's account) or GET accounts `?resourceTypes=users` |
| `GET /users/basic` | `GET /users` with header `basic: true` |
| `GET /user{s}/ID` | `GET /users?resourceIds=ID` |
| `POST /user{s}` | Membership: `POST /accounts/ID` with `{users}` (`mail`, required `userRoleId`, `customerId`, `groups`, `administrator`). Organisation record: `POST /users` (JWT of an IT admin) |
| `DELETE /user{s}/ID` | `DELETE /accounts/ID` with `{users}` |
| `DELETE /user{s}/ID` with `delete-from-instance: true` | `DELETE /users` (JWT only; removes every membership unconditionally) |
| `GET /userRoles`, `POST /userRoles`, `PATCH /userRoles/ID` | `userRoles` on the accounts stream (no DELETE in either version) |
| (new) | `GET /users/whoami`, `PATCH /accounts/ID` with `{users}`, `PATCH /users` |

The `delete-from-instance` row is a behaviour change, not a rename. See
[writes-and-batches.md](writes-and-batches.md#users-and-roles) and ask the user before migrating it.

## Projects

| v1.10 | v2.0 |
| --- | --- |
| `POST /project` | `POST /accounts/ID` with `{projects}` |
| `GET /project/ID`, `GET /ID` | `GET /projects/ID` |
| `GET /project/ID/basic`, `GET /ID/basic` | `GET /projects/ID` with header `basic: true` |
| `GET /ID/vendorAttributes` | `GET /projects/ID/vendorAttributes` |
| `PATCH /ID`, `PATCH /project/ID` | `PATCH /projects/ID` with `{projects}`, or `PATCH /accounts/ID` with `{projects}` |
| `DELETE /project/ID`, `DELETE /ID` | `DELETE /accounts/ID` with `{projects}` |
| `PATCH /project{s}/ID/projectWorkflowTemplate` | `workflowTemplate` in `PATCH /projects/ID` under `projects` |
| `GET /ID/logs` | `GET /projects/ID/logs`; the changes inside a sub-project are in `GET /subProjects/ID/logs` |
| `GET /ID/stats` | `GET /projects/ID/resources/count` and `GET /subProjects/ID/summary` for the counts, `lastModified` for the dates |

## Sub-project lifecycle

| v1.10 | v2.0 |
| --- | --- |
| `POST /PROJECT_ID/subProject{s}` | `POST /projects/ID` with `{subProjects}`; returns qualified IDs |
| `GET SP/` | `GET /subProjects/ID`; headers `no-foreign`, `no-metadata`, `no-intermediary`, `raw-intermediary`, `sample-every`, `only-active` |
| `GET SP/vendorAttributes` | `GET /subProjects/ID/vendorAttributes` |
| `PATCH SP/` | `PATCH /subProjects/ID` with `{subProjects}` (itself only), or `PATCH /projects/ID` with `{subProjects}` |
| `DELETE SP/` | `DELETE /projects/ID` with `{subProjects}` |
| `GET SP/shareUrl` | `GET /subProjects/ID/viewOnlies` |
| `GET SP/hierarchy` | `GET /subProjects/ID/hierarchy`; header `flat` (default `true`) |
| `GET SP/tags` | No equivalent; read `?attributes=tags` and aggregate |
| (new) | `GET /subProjects/ID/summary` with `includeIds` and `noExternalParents` |

## Sub-project resources

| v1.10 | v2.0 |
| --- | --- |
| `GET SP/TYPE`, `GET SP/TYPE/ID`, `POST SP/TYPE`, `PATCH SP/TYPE/ID`, `DELETE SP/TYPE/ID` for `stagedAssets`, `connections`, `wells`, `layers`, `sceneModels`, `gaussianSplats`, `reservoirs`, `pointClouds`, `overlays`, `shapes`, `customCosts`, `annotations` | `?resourceTypes=TYPE[&resourceIds=ID]` and `{TYPE}` on the subProjects stream |
| `POST SP/well{s}/WELL_ID/wellBore{s}`, `GET`/`PATCH`/`DELETE SP/wellBore{s}/ID` | `{wellBores}`; the parent moves into the body as `well` (required), `parentBore` optional |
| `.../connection{s}/ID/connectionSegment{s}[/ID]`, `GET SP/connectionSegments` | `{connectionSegments}` with `connection` (required); list one connection's segments with `?resourceTypes=connectionSegments&connection=ID` |
| `.../wellBore{s}/ID/wellBoreSegment{s}[/ID]`, `GET SP/wellBoreSegments` | `{wellBoreSegments}` with `wellBore` (required) |
| `POST`/`PATCH`/`DELETE SP/batch`, `POST SP/TYPE/batch`, `PATCH SP/stagedAssets` | The stream endpoint itself, same `items`, `globals` and `totalNumberOfItems` shape |
| `GET SP/connection{s}/ID/segmentsAboveSurface` | No equivalent |

The single-resource v1.10 routes used singular names (`SP/stagedAsset/ID`); the v2.0 type keys are
always the plural collection names.

## Documents

| v1.10 | v2.0 |
| --- | --- |
| `GET /documents`, `GET /documents/ID` | GET accounts `?resourceTypes=documents,documentRevisions` |
| `PUT /documents` (upload) | `PUT /accounts/ID/documents` (multipart `file[]` with `description`, `creator`, `vendorId`, `vendorAttributes`, `tags`, `documentGroupId`) |
| `POST /documents` (by URL) | `{documents}` on the accounts stream (`fileName`, `fileType`, `url`) |
| `PATCH /documents/ID`, `DELETE /documents/ID` | `{documents}` on the accounts stream; delete removes the revisions too |
| `GET SP/documents`, `GET SP/documentRevisions` | `?resourceTypes=documents,documentRevisions` on the subProjects stream |
| `PUT SP/documents` | `PUT /subProjects/ID/documents`; accepts `relateToId` and `relateToType` |
| `POST SP/documents` | `{documents}` on the subProjects stream, with `relateToId` and `relateToType` together or not at all |
| `PATCH`/`DELETE SP/document{s}/ID` | `{documents}` on the subProjects stream |
| `GET /workflowTask{s}/ID/documents` | `GET /workflowTasks?resourceIds=ID`; the `documents` and `documentRevisions` keys |
| `PUT /workflowTask{s}/ID/document{s}` | `PUT /workflowTasks/ID/documents` |
| `POST`/`PATCH`/`DELETE /workflowTask{s}/ID/document{s}[/ID]` | `{documents}` on the workflowTasks stream, with `workflowTask` in the body on POST |
| Workflow task template documents (`GET`) | Embedded in each `workflowTaskTemplates` entry |
| Workflow task template documents (`PUT`, `POST`) | `PUT /accounts/ID/documents` or `{documents}` on the accounts stream with `relateToType: 'workflowTaskTemplates'` and `relateToId` |
| Workflow task template documents (`PATCH`, `DELETE`) | `{documents}` and `{documentRevisions}` on the accounts stream, with the IDs the template entry lists |
| `DELETE .../documentRevision{s}/ID` on any scope | `{documentRevisions}` on the stream that owns the document |

## Workflow

| v1.10 | v2.0 |
| --- | --- |
| `workflowTemplates`, `workflowColumns`, `workflowTaskTemplates`, `workflowTaskTemplateGroups` (all verbs) | The same type names on the accounts stream |
| `PATCH /accountWorkflowTemplate` | `workflowDefaultTemplate` in `PATCH /accounts/ID` under `accounts` |
| `workflowTaskTemplateLinks`, `workflowTaskTemplateGroupLinks` (GET, POST, DELETE) | The same type names on the accounts stream (no PATCH in either version) |
| `GET /workflowTasks` with `assignedUsers`, `column`, `resources`, `tags`, `startDate`, `endDate`, `done` | `GET /workflowTasks` with the same names as attribute-value filters, except `resources`, which is `linkedResources`; `startDate` matches from, `endDate` matches to |
| `GET /workflowTask{s}/ID` | `GET /workflowTasks?resourceIds=ID` |
| `POST`/`PATCH`/`DELETE /workflowTask{s}[/ID]` | `{workflowTasks}` on the workflowTasks stream |
| `GET /workflowTask{s}/ID/comments` | The `comments` key of `GET /workflowTasks?resourceIds=ID` |
| `POST`/`PATCH`/`DELETE /workflowTask{s}/ID/comment{s}[/ID]` | `{workflowComments}` on the workflowTasks stream, with `task` and `comment` in the body |

## Metadata

| v1.10 | v2.0 |
| --- | --- |
| `/metadatadefinition{s}` (all verbs) | `metaData` on the accounts and projects streams; `type` becomes `kind` |
| `/metadatagroup{s}` (all verbs) | `metaDataGroups` |
| `/metadatumlink{s}` (all verbs) | `metaDatumLinks`; plural `relateToType`, server IDs, no `order` |
| `/metadatagrouplink{s}` (all verbs) | `metaDataGroupLinks` |

## Compute and export

| v1.10 | v2.0 |
| --- | --- |
| `POST SP/connectionCrossing{s}` | `POST /subProjects/ID/connectionCrossings` |
| `POST SP/connectionCrossing{s}/v2` | The same, with header `stream: true` |
| `POST SP/heightSamples` | `POST /subProjects/ID/heightSamples` |
| `GET SP/geojson` | `GET /subProjects/ID/geojson` |
| `POST SP/schematics` | `POST /subProjects/ID/schematics`, with `?format=svg` or `?format=graph` |
| `GET`/`POST SP/changes` | No equivalent; compare `lastModified` |

## Readiness and the rest

| v1.10 | v2.0 |
| --- | --- |
| `GET SP/isReady`, `GET SP/loadingStatus`, `GET SP/reload` | The same names under `/subProjects/ID/`, same status codes |
| `?at=` on reads | Unchanged |
| `include-last-modified` header | Ignored; `lastModified` is always present |
| (new) | `regions`, `projectPhases`, `stagedAssetStatuses`, `arcgisOnlinePortals` on the accounts stream; `/resources` and `/resources/count` on every stream; `/summary`; `/users/whoami` |

## Renamed and folded concepts

| v1.10 | v2.0 |
| --- | --- |
| `allowedConnectionTypes` routes | The account attribute `designTypeByAssetsCategories`, read and patched on the accounts stream |
| `connections` (connection definitions) | The `connections` type on the accounts and projects streams |
| `integrations` | `customTabs` |
| `metadatadefinitions` | `metaData`; the definition's `type` becomes `kind` |
| `metadatagroups`, `metadatumlinks`, `metadatagrouplinks` | `metaDataGroups`, `metaDatumLinks`, `metaDataGroupLinks` |
| `POST /assets` (a virtual asset) | `virtualAssets` |
| `shareUrl` | `GET /subProjects/ID/viewOnlies` |
| `/users/basic`, `/PROJECT_ID/basic` | Header `basic: true` on `GET /users` and `GET /projects/ID` |
| `connectionCrossings/v2` (chunked progress) | `POST /subProjects/ID/connectionCrossings` with header `stream: true` |
| `include-last-modified` header | `lastModified` is always returned |
| Wells `fromWaterLevel` | `referenceLevel` set to `sea` |
| `PATCH /accountWorkflowTemplate` | `workflowDefaultTemplate` in `PATCH /accounts/ID` under `accounts` |
| `PATCH .../projectWorkflowTemplate` | `workflowTemplate` in `PATCH /projects/ID` under `projects` |

One more rename comes from the API field reference rather than the guide: the v1.10 body field
`userEmail` on a project or sub-project PATCH is `updatedBy` in v2.0, the e-mail address of the
user making the change.

Two names moved and are easy to confuse:

- In v2.0, `allowedConnectionTypes` is an attribute of a connection definition, not the account
  matrix that v1.10 patched. The matrix is `designTypeByAssetsCategories`.
- `connections` on the accounts and projects streams are definitions. The connections drawn in a
  sub-project are `connections` on the subProjects stream.

## No v2.0 equivalent

Keep the v1.10 call, or use the alternative. Both versions are served side by side, so keeping a
v1.10 call is a supported outcome, not a failed migration.

| v1.10 | Alternative |
| --- | --- |
| `GET`/`POST .../changes` | Compare `lastModified` between reads |
| `GET .../connection/ID/segmentsAboveSurface` | Compute from the connection's intermediary points |
| `GET .../subProject/ID/tags` | Read `?attributes=tags` and aggregate |

## Newer than 9.0.0

These v2.0 targets were added after the FieldTwin 9.0.0 release. Confirm each one in the tenant's
OpenAPI document before mapping a call to it; where it is missing, keep the v1.10 call.

- `GET /accounts/ID/logs`, `GET /projects/ID/logs` and `GET /subProjects/ID/logs`, which also
  carry the `GET /usage` replacement.
- `PUT /accounts/ID/customTabs/manifest`.
