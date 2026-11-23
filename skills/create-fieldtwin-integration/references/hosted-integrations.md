# Deploying to FieldTwin hosting

Some FieldTwin instances can host a static integration themselves. Its **integration hosting** stores the
built files, serves them from its own hostname, and registers the integration in the account. Use
it for the single-page shape and for any integration that builds to static files. An integration
that needs a backend cannot be deployed this way; use the full repository shape.

`scripts/ft-integrations.mjs` does the work. It needs Node 20.15 or later and has no dependencies.
Add `--json` to every call you parse.

## What a hosted integration must be

- **Static files only.** No server code, no `dynamicPagesUrl`, no proxy, no OAuth client.
- **A `manifest.json` at the root of the build output**, next to `index.html`. With a bundler, put
  it in the folder copied as is to the output (`public/` with Vite) so it lands in `dist/`.
- **Relative manifest URLs.** `url`, `logo`, `backgroundUrl`, `accountSettingsUrl` and
  `projectSettingsUrl` name files inside the bundle (`./index.html`, `./logo.svg`). The instance
  turns them into served URLs. An absolute URL is refused.
- **Bootstrap from the `loaded` message.** The instance forces `useGET: true` and
  `noURLParams: true`: the page gets its JWT from `loaded` and `tokenRefresh`, never from the URL.
  Everything in `develop-fieldtwin-integration` about origins, the in-memory token and teardown
  still applies.
- **Relative asset paths and hash routing.** The page is served under a path, not at the root of
  its host, and unknown paths are not rewritten to `index.html`. With Vite, set `base: './'`.
- **No secrets.** The files are public to anyone who has the URL.
- At most 25 MB zipped, 100 MB unzipped, 2000 files, no symbolic links.

A minimal manifest:

```json
{
  "name": "Connection summary",
  "url": "./index.html",
  "tabPosition": "bottom",
  "showInDesigner": true,
  "showInOperation": true
}
```

## Workflow

1. **Find the target.** Read `.fieldtwin.json` in the project root. If it exists, this project is
   already linked to an integration: a deploy updates that integration.
2. **No `.fieldtwin.json`?** Ask the user for their FieldTwin URL, then run
   `list --url <instance> --json`. Ask whether this is a new integration or an update of one
   marked hosted in that list. For an update, run `link <integrationId>` first.
3. **Build** the integration and check `manifest.json` is in the output folder.
4. **Deploy:** `deploy <output folder> --json`.
5. **Report** the integration name, the account and the URL from the result. Tell the user to
   reload FieldTwin to see a new integration.

Commit `.fieldtwin.json`. It holds the instance URL, the account id and the integration id, and no
secret. It is what makes the next deploy an update instead of a second integration.

## Logging in

When a command exits with code 3 and `"error": "login-required"`, run
`login --url <instance>`. It opens the user's browser on the normal FieldTwin login page and waits
for them to approve. Tell the user a browser tab is opening. Then repeat the command.

- Never ask the user for a password, a token or a code, and never read the stored credentials
  file. The script keeps the token in the user's configuration directory and never prints it.
- The login only allows publishing, updating and deleting hosted integrations on accounts the user
  administers. It is unrelated to the JWT the integration receives at runtime.
- It lasts 7 days. The user can revoke it under Connected Apps in their FieldTwin user settings.
- In a remote or SSH session the browser cannot reach the script. Say so and ask the user to run
  the login on their own machine.

## Other commands

| Command | Use |
| ------- | --- |
| `accounts` | The accounts the user administers. Needed when a deploy answers `account-required`. |
| `list [--account <id>]` | The account's integrations; hosted ones carry a `hosted` object. |
| `link <integrationId>` | Point this project at an existing hosted integration. |
| `zip [dir] [out.zip]` | Write the bundle without deploying it, for an upload through FieldTwin Admin. |
| `pull <integrationId> [dir]` | Download and extract the deployed files. |
| `delete <integrationId> --yes` | Delete a hosted integration. Ask the user before running it. |

## Errors worth handling

| `error` | Meaning and fix |
| ------- | --------------- |
| `hosting-disabled` | This instance does not host integrations. Offer the other deployment paths of this skill. |
| `login-required` (exit 3) | Run `login`, then retry. |
| `account-required` | The user administers several accounts. Show them and pass `--account <id>`. |
| `no-administered-account`, `not-account-admin` | Only an account administrator can deploy. |
| `licence-does-not-allow-integrations` | The account's licence does not include integrations. |
| `missing-manifest`, `invalid-manifest`, `manifest-url-not-in-bundle`, `unsupported-manifest-field` | Fix `manifest.json`; `detail` names the field. |
| `bundle-too-large`, `too-many-files`, `symlink-not-allowed`, `unsafe-entry-name` | Fix the build output; `detail` names the entry. |
| `integration-not-hosted` | The linked integration is not one integration hosting hosts. Deploy as a new one. |
