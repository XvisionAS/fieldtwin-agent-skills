# API keys and settings without a backend

A static integration (a single page, or one deployed to FieldTwin hosting) has no server to keep a
secret. FieldTwin can keep it instead:

- **A secret** (an API key, a token) is stored by an account admin on the FieldTwin backend. It can
  be written and replaced, never read back. The integration asks the backend to call the remote API
  with it, and receives the answer as a stream. The page never holds the key.
- **Non-secret setup** (a base URL, a default unit, a list of asset types to show) goes in
  `vendorAttributes` of the account or the project. See the last section.

This works for every integration of an account, hosted by FieldTwin or not. Use it when calling a
remote API with a key is the only reason the integration would need a server. An OAuth flow, an
inbound webhook, a background worker or per-user credentials still need the full repository shape.

## What a secret is

One record per account, integration and name:

| Field | Meaning |
| ----- | ------- |
| `value` | The secret. Single line, at most 8192 characters. Write-only. |
| `urlPrefix` | `https` URL every request using the secret must start with. No credentials, query or fragment. |
| `header` | Request header that carries the secret, for example `Authorization` or `X-Api-Key`. |
| `format` | Header value with `{secret}` where the secret goes. Defaults to `{secret}`. Use `Bearer {secret}` for a bearer token. |

The destination is stored with the value and is not chosen per request: whoever can open the
integration can send requests with the secret, but only to URLs under `urlPrefix`, and only in
`header`. Changing `urlPrefix`, `header` or `format` means sending the value again.

Make `urlPrefix` as narrow as the integration needs, ending with `/`:
`https://api.example.com/v1/` rather than `https://api.example.com/`. Every user of the integration
can make any request under it with the key, including writes when the remote API allows them. Say
so to the user when the key grants more than the integration uses, and ask for a read-only or
scoped key when the provider offers one.

At most 20 secrets per integration. The secret can only go in a header: an API that wants its key
in the query string or the body, or HTTP Basic with a computed value, is not covered. For Basic, the
admin can enter the already encoded `user:password` and use `format: "Basic {secret}"`.

## Routes

All under `<backendUrl>/integrations/accounts/<account>/integrations/<customTabId>`, where
`backendUrl`, `account` and `customTabId` come from the trusted `loaded` message. Keep the base
path of `backendUrl`. Send the JWT from `loaded` or `tokenRefresh` as `Authorization: Bearer`.

| Call | Who | Result |
| ---- | --- | ------ |
| `GET /secrets` | Account admin | `[{ name, urlPrefix, header, format, updatedAt, updatedBy }]`. Never a value. |
| `PUT /secrets/<name>` with `{ value, urlPrefix, header, format? }` | Account admin | The stored destination. Creates or replaces. `name` matches `[A-Za-z0-9_-]{1,64}`. |
| `DELETE /secrets/<name>` | Account admin | `{ deleted: true }` |
| `POST /request` with `{ url, method?, headers?, body?, secrets: [name, ...] }` | Any user of the integration, and account admins | The remote API's answer, streamed |

"Account admin" is checked on the server from the user of the token. The token of the Account
Settings page works, and so does the token a normal tab receives when its user is an account admin.
A token issued for another integration is always refused.

## The settings page

Declare `accountSettingsUrl` in the manifest (`./settings.html` for a hosted integration) and
generate a page that:

1. Bootstraps from `loaded` like every other page, with exact origin and source checks, and keeps
   `token`, `backendUrl`, `account` and `customTabId` in memory. On an instance where the Account
   Settings `loaded` has no `customTabId`, integration secrets are not available: say so in the page
   instead of guessing an id.
2. Calls `GET /secrets` and shows, per secret, whether it is set, when and for which `urlPrefix`.
   There is no value to show: never render a masked or partial one.
3. Has one password input per secret, empty on every load, with `autocomplete="off"`. An empty input
   means "keep the stored value": send nothing. A filled input is sent with `PUT`.
4. Keeps `urlPrefix`, `header` and `format` in the page's code as constants when the API is fixed.
   Offer an input for `urlPrefix` only when the admin really chooses the server (a self-hosted
   product), and then show the stored prefix beside it.
5. After a `PUT`, clears the input, drops the value from every variable, and reloads the list.
6. Offers a **Test connection** button that sends one harmless `POST /request` and shows the
   remote status. An admin may call `/request` from the settings page.
7. Shows failures with their `error` and `detail`, and keeps what the admin typed so they can retry.

Never put the secret in `localStorage`, a URL, `vendorAttributes`, a log or an error report. Never
ship a default or example key in the files: a hosted bundle is public.

```js
const secretsBase = (context) =>
  `${context.backendUrl.replace(/\/+$/, '')}/integrations/accounts/${context.account}` +
  `/integrations/${context.customTabId}`

async function saveApiKey(context, value) {
  const response = await fetch(`${secretsBase(context)}/secrets/apiKey`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      value,
      urlPrefix: 'https://api.example.com/v1/',
      header: 'Authorization',
      format: 'Bearer {secret}',
    }),
  })
  if (!response.ok) {
    const { error, detail } = await response.json()
    throw new Error(detail ? `${error}: ${detail}` : error)
  }
}
```

## Calling the remote API

```js
async function callRemote(context, path, { method = 'GET', headers, body } = {}) {
  const response = await fetch(`${secretsBase(context)}/request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://api.example.com/v1/${path}`,
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      secrets: ['apiKey'],
    }),
  })
  // Present only when the answer comes from the remote API. Without it, FieldTwin refused.
  if (!response.headers.has('X-FieldTwin-Upstream-Status')) {
    const { error, detail } = await response.json()
    throw new Error(detail ? `${error}: ${detail}` : error)
  }
  return response
}
```

- The call itself is always a `POST` to FieldTwin; `method` is what the remote API receives: `GET`,
  `HEAD`, `POST`, `PUT`, `PATCH` or `DELETE`.
- `body` is a string. Set the remote `Content-Type` in `headers`.
- `headers` may not set a header that a named secret owns, nor `Host`, `Cookie`, `Content-Length`,
  `Connection` or `Transfer-Encoding`.
- The response carries the remote status, `Content-Type`, `Content-Encoding`, `Content-Length`,
  `Content-Disposition` and `Retry-After`. Other remote headers, cookies included, are dropped.
  Read it as a stream, as JSON or as a blob like any `fetch` response.
- Redirects are not followed: a 3xx comes back as is, without its `Location`. Use the final URL.
- The request times out after 60 seconds.
- Use the current token: retry once with the token from `tokenRefresh` after a 403
  `Invalid credential.`.

| `error` | Meaning and fix |
| ------- | --------------- |
| `not-allowed` | The token is not for this integration and account, or a secret route was called by someone who is not an account admin. |
| `secret-not-found` | No secret with that name is stored. Tell the user an account admin must open the integration's settings. |
| `secret-unreadable` | The stored secret can no longer be decrypted. An account admin must enter it again. |
| `url-not-allowed` | `url` is outside the secret's `urlPrefix`. Fix the URL; do not widen the prefix to make it pass. |
| `header-not-allowed` | A header in `headers` is reserved or belongs to a secret. |
| `invalid-request`, `invalid-secret` | `detail` names the field. |
| `too-many-secrets` | The integration already has 20 secrets. |
| `destination-blocked` | The URL points inside the FieldTwin deployment. Use the public address of the API. |
| `upstream-unreachable` | The remote API did not answer; `detail` has the network error code. |
| `secrets-unavailable` | This instance cannot store secrets. Report it. |

When no secret is set yet, the integration's main page should say so plainly and tell the user that
an account admin sets it up under Admin, Integrations, the integration, Settings.

## Non-secret setup: vendorAttributes

Settings that are not secret do not need this mechanism. Store them in `vendorAttributes`, a free
JSON object FieldTwin keeps on the account, on each project and on each subproject, through the
normal API with the host-issued token:

| Scope | Read | Write |
| ----- | ---- | ----- |
| Account | `GET /API/v1.10/vendorAttributes` | `PATCH /API/v1.10` with `{ "vendorAttributes": { ... } }` |
| Project | `GET /API/v1.10/projects/{id}/vendorAttributes` | `PATCH /API/v1.10/{projectId}` with `{ "vendorAttributes": { ... } }` |

- Use the account for setup shared by every project (which remote workspace, which units), and the
  project for what differs per project (which remote site this field maps to).
- Other integrations share the same object. Keep everything under one key named after the
  integration, for example `vendorAttributes["connection-summary"] = { ... }`, and send only that
  key. Setting a key to `null` removes it.
- The whole object is limited to 51200 characters. It is for configuration, not for data.
- Writing needs the rights of the user: account admin for the account, edit rights for the project.
  Put account-level setup on the settings page next to the secrets.
- Everyone who can read the account or the project can read it. Never store a secret there.

Confirm the exact routes and fields with `develop-fieldtwin-integration`'s API attribute query
script before coding against them.
