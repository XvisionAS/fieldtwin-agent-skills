# Deploying to FieldTwin hosting

Some FieldTwin instances can host a static integration themselves: the instance stores the built
files, serves them under `<instance>/integration/`, and registers the integration in the account. Use it for
the single-page shape and for any integration that builds to static files. An integration that
needs a backend cannot be deployed this way; use the full repository shape.

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
- **Only public files are packaged.** Dot-files (`.env`, `.fieldtwin.json`), dot-directories
  (`.git`) and `node_modules` are never uploaded, at any depth; the script says how many it left
  out. A single-page integration should still live in a folder of its own that holds only what is
  meant to be public, rather than in a project root.
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
  administers. It is unrelated to the JWT the integration receives at runtime.
- It lasts 7 days. The user can revoke it under Connected Apps in their FieldTwin user settings.
- A user has one login per instance: logging in again, for example from another machine, ends the
  login of the first machine. The script then drops the stored login and answers `login-required`;
  run `login` again.
- In a remote or SSH session the browser cannot reach the script. Say so and ask the user to run
  the login on their own machine.

## Other commands

| Command | Use |
| ------- | --- |
| `accounts` | The accounts the user administers. Needed when a deploy answers `account-required`. |
| `list [--account <id>]` | The account's integrations; hosted ones carry a `hosted` object. |
| `link <integrationId>` | Point this project at an existing hosted integration. |
| `zip [dir] [out.zip]` | Write the bundle without deploying it, only when the user asks for the file to upload it through FieldTwin Admin themselves. |
| `pull <integrationId> [dir]` | Download and extract the deployed files. |
| `delete <integrationId> --yes` | Delete a hosted integration. Ask the user before running it. |
| `logout` | Remove the stored login for that instance. The grant itself is revoked under Connected Apps in the user's FieldTwin settings. |
| `self-check` | Check the script's packaging on this machine. Needs no login and no network. |

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
