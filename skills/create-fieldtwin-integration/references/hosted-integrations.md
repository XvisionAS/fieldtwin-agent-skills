# Deploying to FieldTwin hosting

Some FieldTwin instances can host a static integration themselves: the instance stores the built
files, serves them under `<instance>/integration/`, and registers the integration in the account. Use it for
the single-page shape and for any integration that builds to static files. An integration that
needs a backend cannot be deployed this way; use the full repository shape. Calling a remote API
with a key is not a reason for a backend: FieldTwin stores the key and makes the call, as
[integration-secrets.md](integration-secrets.md) describes.

`scripts/ft-integrations.mjs` does the work. It needs Node 20.15 or later and has no dependencies.
Add `--json` to every call you parse.

## Who may deploy

- Account admins, and members whose user role grants "Can deploy integrations" under a PRO or PRO
  Design licence. The account must also have the `hosted-integrations` module turned on.
- Admin access is not needed. Users find their integrations, their versions and the zip of each
  version in their FieldTwin profile, tab Integrations.
- A member who is not an account admin manages only the integrations they deployed themselves.

## What a hosted integration must be

- **Static files only.** No server code, no proxy, no OAuth client.
- **Several tabs come from a pages file.** Set `dynamicPagesUrl` to a JSON file of the bundle
  (`./pages.json`) holding an array of pages. Each page has a `title` and an `iframeUrl`, and may
  set `path`, `logo`, `tabPosition`, `showInDesigner` and `showInOperation`. `iframeUrl` and `logo`
  name files of the bundle, relative to the pages file. `url` may then be omitted. An instance
  that does not support this yet answers `unsupported-manifest-field`: keep the views in one page
  with hash routing instead.
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
- **No secrets in the files.** They are public to anyone who has the URL. An API key is entered
  by an account admin on the integration's settings page and kept by FieldTwin; non-secret setup
  goes in `vendorAttributes`. Both are in [integration-secrets.md](integration-secrets.md).
- **Only public files are packaged.** Dot-files (`.env`, `.fieldtwin.json`), dot-directories
  (`.git`) and `node_modules` are never uploaded, at any depth; the script says how many it left
  out. A single-page integration should still live in a folder of its own that holds only what is
  meant to be public, rather than in a project root.
- At most 25 MB zipped, 100 MB unzipped, 2000 files, no symbolic links.

A pages file with a panel and an export dialog:

```json
[
  { "title": "Overview", "path": "overview", "iframeUrl": "./index.html" },
  { "title": "Export", "path": "export", "iframeUrl": "./export.html", "tabPosition": "main-toolbar-dialog" }
]
```

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

Deploy only with the script. Never upload, create or edit the integration through FieldTwin Admin
or by driving a browser, even when a command fails: report its `error` and the fix below. The
instance chooses the URLs the integration is served from; never build or change them yourself.

1. **Find the target.** Read `.fieldtwin.json` in the project root. If it exists, this project is
   already linked to an integration: a deploy updates that integration. Confirm its `instanceUrl`
   is the instance the user means; the script refuses a deploy when the link and the target
   disagree (`project-link-mismatch`).
2. **No `.fieldtwin.json`?** Ask the user for their FieldTwin URL, then run
   `list --url <instance> --json`. Ask whether this is a new integration or an update of one
   marked hosted in that list. For an update, run `link <integrationId>` first.
3. **Build** the integration and check `manifest.json` is in the output folder.
4. **Deploy:** `deploy <output folder> --json`.
5. **Report** the integration name, the account and the URL from the result. Tell the user to
   reload FieldTwin to see a new integration. A deploy of unchanged files answers
   `"unchanged": true`: say the integration was already up to date.

Commit `.fieldtwin.json`. It holds the instance URL, the account id and the integration id, and no
secret. It is what makes the next deploy an update instead of a second integration.

## Logging in

When a command exits with code 3 and `"error": "login-required"`, run
`login --url <instance>`. It opens the user's browser on the normal FieldTwin login page and waits
for them to approve. Tell the user a browser tab is opening. Then repeat the command.

- `--no-browser` prints the login URL without opening it. The callback still arrives on this
  machine's loopback address, so it does not make a remote or SSH session work.
- When the login page is on a different host than the instance, the script never opens it: it
  only prints the URL, and the user should check it before opening it.

- Never ask the user for a password, a token or a code, and never read the stored credentials
  file. The script keeps the token in the user's configuration directory and never prints it.
- The login only allows publishing, updating and deleting hosted integrations on accounts the user
  may deploy to. It is unrelated to the JWT the integration receives at runtime.
- It lasts 7 days. The user can revoke it under Connected Apps in their FieldTwin user settings.
- A user has one login per instance: logging in again, for example from another machine, ends the
  login of the first machine. The script then drops the stored login and answers `login-required`;
  run `login` again.
- In a remote or SSH session the browser cannot reach the script. Say so and ask the user to run
  the login on their own machine.

## Versions and rollback

FieldTwin keeps ten versions of each integration: the live one and up to nine earlier ones,
newest first in the `hosted.history` of `list --json`. Each deploy of changed files adds a version
and the oldest falls away. `rollback <integrationId> --version N` makes a kept version live again
as a new deploy would, so the integration keeps its URL and settings. `pull --version N` downloads
a kept version without changing what is live.

## Other commands

| Command | Use |
| ------- | --- |
| `accounts` | The accounts the user may deploy to. Needed when a deploy answers `account-required`. |
| `list [--account <id>]` | The account's integrations; hosted ones carry a `hosted` object. |
| `link <integrationId>` | Point this project at an existing hosted integration. |
| `zip [dir] [out.zip]` | Write the bundle without deploying it, only when the user asks for the file to upload it through FieldTwin Admin themselves. |
| `pull <integrationId> [dir] [--version N]` | Download and extract the deployed files, or those of a kept version. |
| `rollback <integrationId> --version N` | Make a kept version live again. Ask the user which version first. |
| `delete <integrationId> --yes` | Delete a hosted integration. Ask the user before running it. |
| `logout` | Remove the stored login for that instance. The grant itself is revoked under Connected Apps in the user's FieldTwin settings. |
| `self-check` | Check the script's packaging on this machine. Needs no login and no network. |

## Errors worth handling

| `error` | Meaning and fix |
| ------- | --------------- |
| `hosting-disabled` | This instance does not host integrations. Offer the other deployment paths of this skill. |
| `login-required` (exit 3) | Run `login`, then retry. |
| `account-required` | The user may deploy to several accounts. Show them and pass `--account <id>`. |
| `no-deployable-account` | The user may deploy to no account of this instance. A FieldTwin super admin must turn on the `hosted-integrations` module for the account, and an account admin must give the user's role "Can deploy integrations" (PRO licence required). |
| `not-allowed` | The user may not deploy to this account, or the integration was deployed by someone else. |
| `module-not-enabled` | The account does not have the `hosted-integrations` module. Only a FieldTwin super admin can turn it on. |
| `version-required` | `rollback` needs `--version N`; `list --json` shows the kept versions. |
| `version-not-kept` | That version is no longer kept. Choose one listed in `hosted.history` or the live one. |
| `licence-does-not-allow-integrations` | The account's licence does not include integrations. |
| `missing-manifest`, `invalid-manifest`, `manifest-url-not-in-bundle`, `unsupported-manifest-field` | Fix `manifest.json`; `detail` names the field. |
| `invalid-dynamic-pages` | Fix the pages file `dynamicPagesUrl` names; `detail` names the page and field. Every page needs a `title` and an `iframeUrl` that is a file of the bundle. |
| `bundle-too-large`, `too-many-files`, `symlink-not-allowed`, `unsafe-entry-name` | Fix the build output; `detail` names the entry. |
| `project-link-mismatch` | `.fieldtwin.json` points at another instance or account than this deploy. Pass the matching `--url` and `--account`, or remove the file. |
| `insecure-instance-url` | The instance URL must be `https`. Correct `--url`. |
| `invalid-login-url` | The instance gave a login URL that is not `https`. Do not log in; tell the user. |
| `integration-id-required` | `link`, `pull` and `delete` need the integration id; get it from `list`. |
| `integration-not-found` | The integration `.fieldtwin.json` points at was deleted. Ask the user, then remove `.fieldtwin.json` and deploy as a new integration. |
| `request-failed` | The instance could not be reached; `detail` has the reason. Check the URL and the network, then retry. In a sandbox without network access (the default in some agents), ask the user to allow network access for the script and run it again. |
| `invalid-token-response` | The instance answered the login with an unusable token response. Retry the login; report it if it repeats. |
| `invalid-instance-url` | `--url` is not a valid URL. Use `https://<instance>`. |
| `instance-required` | No instance is known. Ask the user for their FieldTwin URL and pass `--url`. |
| `login-denied` | The user cancelled the login in the browser. Ask whether to try again. |
| `login-timeout` | No login was completed within 5 minutes. Run `login` again. |
| `login-failed` | The login callback carried no authorization code. Run `login` again. |
| `unsupported-zip-entry` | A downloaded bundle uses a compression method other than stored or deflate. Report it; `pull` cannot extract it. |
| `integration-not-hosted` | The linked integration is not one integration hosting hosts. Deploy as a new one. |
