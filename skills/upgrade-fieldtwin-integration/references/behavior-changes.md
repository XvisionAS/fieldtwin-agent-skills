# What stays, what behaves differently, and the checklist

Use this reference for steps 7 and 8 of the upgrade workflow: deciding what does not need to
change, re-testing behaviour that shifted, and signing the migration off.

## What stays the same

Leave this code alone. Rewriting it adds risk without moving the integration closer to v2.0.

- **v1.10 keeps working.** FieldTwin 9.0 serves `/API/v1.10` and `/API/v2.0` side by side. There
  is no retirement date for v1.10; FutureOn will announce one in advance. New capabilities only
  arrive in v2.0, so plan the move, but it does not have to happen in one release.
- **Credentials.** Send an API token in the `token` header, or a user JWT as
  `Authorization: Bearer <JWT>`, exactly as in v1.10. Send one or the other; if both arrive, the
  API token is used. `401` still means the credential was missing or invalid, `403` that the
  caller was recognised but lacks the right. A JWT user still needs a Design or Pro licence; any
  other licence gets `403` with the message `Not accessible with current user license`.
- **Host.** Since 9.0 both versions answer on the tenant host, for example
  `https://TENANT.fieldtwin.com/API/v2.0/...`. The older `/backend/API/...` prefix is still accepted.
  Keep using the backend URL the integration was given; do not rebuild it from a hostname.
- **Readiness.** A sub-project is loaded on its first request and can take minutes. `isReady` and
  `loadingStatus` keep their paths and status codes, and a sub-project that is still loading
  answers `503` with `Retry-After: 10`. Keep the readiness loop as it is.
- **Point-in-time reads.** The `at` query parameter (`latest`, a Unix time or an ISO date) works
  on the v2.0 stream reads as before.
- **The embedded bootstrap.** Embedded integrations still receive `APIVersion` set to `1.10` in
  the `loaded` event on 9.0. An integration that wants v2.0 chooses it deliberately in its own
  configuration. The same event carries `account`, the ID that accounts-stream URLs need. The
  `postMessage` bridge, origin checks, `tokenRefresh` handling and the JWT itself are untouched
  by this migration.

## Behaviour that changed

Re-test each of these when the integration relies on it. None of them shows up as a compile error
or a changed path.

- Numeric strings such as `"10"` are no longer accepted where a number is expected.
- An unknown `connectionDefinition` on a connection answers `422`; v1.10 fell back to a default.
- A connection's `designType` is checked again after the whole body is applied, not only when it
  is sent.
- Duplicate values in `tags` answer `422`.
- Overlays need `x` and `y`, and a client-chosen ID on an overlay or custom cost is dropped.
- `vendorAttributes: null` clears the attributes; in v1.10 it did nothing.
- Deleting a well clears the `well` of the staged assets that used it.
- Connection types and connection definitions share one ID space across the account and its
  projects; a project cannot create a definition with an ID the account already uses.
- A malformed workflow task filter matches nothing instead of answering `400`.
- Custom costs can be locked with `isLocked`.

The first one is the most likely to bite an existing integration: values read from a form, a
spreadsheet or an environment variable are strings, so convert them before building the body.

Also re-test the changes that the read and write references describe, because they alter
behaviour without changing a path:

- relationships arrive as IDs and to-many relationships as arrays;
- unset fields are absent instead of `null`;
- a filtered read leaves a type key out when nothing matched;
- `lastModified` is returned by default, but an `attributes` projection drops it unless it is
  named;
- `DELETE /users` removes every membership, unlike `delete-from-instance`;
- account logs default to oldest first and no longer list sign-ins or access errors.

## What v2.0 does not offer

| v1.10 | Alternative |
| --- | --- |
| `GET`/`POST .../changes` | Compare `lastModified` between reads |
| `GET .../connection/ID/segmentsAboveSurface` | Compute from the connection's intermediary points |
| `GET .../subProject/ID/tags` | Read `?attributes=tags` and aggregate |

Keeping the v1.10 call is the low-risk choice while v1.10 is served. Choose the alternative when
the user wants the integration fully on v2.0, and say that the result is computed client-side.

## Migration checklist

1. List every v1.10 call the integration makes, with its method, path, headers and query
   parameters.
2. Map each one with the endpoint table. Note the ones with no equivalent and decide whether to
   keep them on v1.10.
3. Add the account ID to every account-level call.
4. Replace per-resource reads with one stream GET plus `resourceTypes`, `resourceIds` and
   `attributes`. Remove every other query parameter that is no longer needed.
5. Rewrite parsers for the envelope: type, then ID, relationships as IDs, `lastModified` present,
   nulls absent.
6. Group writes into batches per stream, in dependency order, and read results back by ID instead
   of using the response body.
7. Keep the readiness loop and the `at` handling as they are.
8. Run the integration against a QA tenant with a credential that has the same role as in
   production, and compare the results with the v1.10 output.
9. Keep the API version in configuration, not in code, so a tenant can be switched back if needed.

## Comparing v1.10 and v2.0 output

For item 8, compare meaning, not bytes. Expected differences that are not regressions:

- the container shape (type, then ID) and the root sitting under its own type key;
- IDs where objects used to be embedded, and arrays where `{ "ID": true }` maps used to be;
- absent keys where v1.10 returned `null`, and an absent type where a filtered read matched
  nothing;
- `lastModified` on every stored resource, unless an `attributes` projection left it out;
- foreign resources inside the type maps with `isForeign: true` instead of a separate container;
- flat `x`, `y`, `z`, `rotation` and `scale` on staged assets where writes used `initialState`.

Anything else that differs, such as a missing resource, a changed value or a different count, is
a finding. A count that dropped to zero usually means a leftover query parameter became a filter.
