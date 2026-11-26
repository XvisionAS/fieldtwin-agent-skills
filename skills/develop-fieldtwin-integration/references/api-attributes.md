# FieldTwin API attribute catalog

Use these catalogs to confirm the public contract of one method and path at a time. The v1.10
catalog indexes ApiDoc, including inherited v1.9 operations. The v2.0 catalog indexes OpenAPI
operations plus stream-specific Joi write schemas and manifest read fields. Neither can fill
gaps in the documentation for a target release.

## Resolve an operation

1. Select the deployed API version and use `--list-operations` with discovery filters
   (`--path`, `--group`, or `--resource`) to locate the documented path template.
2. Copy the full template and supply its method to `--exact-path`. A missing or ambiguous match
   fails. Inspect path, query, headers, body and response separately with `--location`. For v2
   stream writes, also look up the exact `--stream`, `--resource`, and `--method` for item fields.
3. For each value, establish its source and meaning before serializing it. Check the resource
   type and ownership, identifier namespace, branch qualification, units, enum values,
   wire format, optionality, default and conditional requirements. Check the response status,
   media type, and envelope before selecting fields. Follow the release's authentication and
   paging or filter rules for that operation.
4. Use the target release's ApiDoc/OpenAPI and released source or tests for any detail the
   catalog cannot settle. Ask for the missing input or report the gap when these sources
   cannot resolve it. A similarly named parameter in another operation is insufficient.

Run from the skill directory. Quote the exact path template, including placeholders:

```bash
python3 scripts/query-api-attributes.py --version v1.10 --method get --path metadatadefinition --list-operations
python3 scripts/query-api-attributes.py --version v1.10 --method get --exact-path '/API/v1.10/metadatadefinition/:metaDataDefinitionId' --location path
python3 scripts/query-api-attributes.py --version v2.0 --method get --exact-path '/API/v2.0/subProjects/{subProjectId}' --location query
python3 scripts/query-api-attributes.py --version v2.0 --stream subProjects --resource stagedAssets --method patch --field initialState
python3 scripts/query-api-attributes.py --version v2.0 --method get --exact-path '/API/v2.0/users/whoami'
python3 scripts/query-api-attributes.py --version v2.0 --method get --path /resources --list-operations
```

Use `--field` for a substring within the selected operation. Use `--json` to see available
machine-readable details such as query serialization, numeric bounds, and validation rules.
Keep media types, success statuses and alternatives distinct. Consult the actual OpenAPI for
composition and global security declarations. See [backend-api.md](backend-api.md) for common
authentication and routing, and [backend-api-v2.0.md](backend-api-v2.0.md) for stream filters,
including supported dynamic query keys. Avoid opening the generated JSON files wholesale.

## Interpret the results

### v1.10

Each operation owns its attribute list. A field has one of these locations:

| Location | Meaning |
| --- | --- |
| `header` | Accepted request header documented by the operation. |
| `path` | URL path parameter. |
| `query` | Query-string parameter. |
| `body` | Request-body field. |
| `response` | Successful response field. |

`optional: false` on a body/path/query/header field means the ApiDoc contract did not wrap the
field in brackets. It does not override conditional requirements explained in the description.
Nested paths use dots exactly as the public operation documentation does.

The effective v1.10 catalog starts with v1.9 operations because v1.10 inherits that surface, then
applies v1.10 definitions and operation replacements. `sourceVersion` and `inherited` preserve
that provenance.

### v2.0 reads

The base readable resource field set comes from the events manifest. Query with `--method get` and
the stream whenever the real call is known, because response transformations can:

- remove a manifest attribute;
- add calculated attributes to the root resource;
- add calculated attributes to a related resource; or
- synthesize a relationship collection in the stream envelope.

Path notation is:

| Notation | Meaning |
| --- | --- |
| `a.b` | Property `b` nested in object `a`. |
| `items[].id` | Property `id` on each array item. |
| `resources{}.name` | Property `name` on each value of an ID-keyed map. |

`readOnly: true` is an explicit manifest restriction. Fields with `documented: false` are present
in the manifest but lack a public description; report that fact instead of inventing semantics.

### v2.0 writes

POST, PATCH, and DELETE fields are derived from the exact Joi schema for a `(stream,
resourceType, method)` tuple. Always name all four parts in an implementation or review. The same
resource type can have different fields in different streams; for example, account-scoped user
creation adds account membership fields that the standalone users stream does not accept.

`required` reflects the Joi presence rule for that operation. `allowedValues`, defaults, and
validation rules are included when the schema exposes them. PATCH is not assumed to be POST with
every field optional: query PATCH separately.

User-role `userRights` is an open object because integrations may receive tab-specific keys. The
catalog also expands every concrete built-in right available in the source contract as
`userRights.can...` boolean paths; it preserves the documented dynamic
`canEditTab{customTabId}`/`canViewTab{customTabId}` convention without inventing instance IDs.

## Batch payloads

Attribute availability inside batch requests is unchanged by batching:

- v1.10 `/batch` items use the body attributes documented for the corresponding resource
  operation, plus the batch envelope and globals described in `backend-api-batch.md`.
- v2.0 type-keyed POST/PATCH/DELETE batches use the catalog entry for that stream, method, and
  resource type. The top-level type key is an envelope key, not a resource attribute.

Do not include calculated GET-only attributes in POST or PATCH payloads. Do not include IDs inside
v2 POST objects unless the queried POST schema explicitly exposes an ID field.

## Regenerate after an API contract change

From this skill directory, point the generator at a FieldTwin source checkout:

```bash
node scripts/generate-api-attributes.mjs --source /path/to/FieldTwin
```

The generator uses the checkout’s ApiDoc annotations and runs its OpenAPI builder with a
local Events manifest. It does not start services or fetch the manifest over the network. Review
the summary counts, compare the v2 operation list with the tenant's
`/API/v2.0/documentation/oas3.json`, query representative root/related resources in every stream,
and run the package validator. Commit both generated JSON files with the source documentation or
schema change so the skill never describes a newer or older contract than its catalogs.
