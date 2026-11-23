# FieldTwin Agent Skills

Public, portable [Agent Skills](https://agentskills.io/home) for building secure FieldTwin integrations.

This repository publishes two complementary skills:

- **Create FieldTwin Integration** — scaffold the application, Docker image, Helm chart,
  Environment Modules, Tilt workflow, `devops.sh`, build-bot pipeline, secrets boundary, and
  validation path for a new deployable integration.
- **Develop FieldTwin Integration** — build, run, debug, test, and review FieldTwin custom-tab integrations and their Operation Mode host behavior, including the local Tilt/Helm path, HTTP/HTTPS URL generation, iframe lifecycle, API authentication, `postMessage`, pop-out windows, system highlighting, settings, and protocol tests.

The skills are documentation and instructions, plus small helper scripts. There is no MCP server and no telemetry. One script makes network requests: `ft-integrations.mjs` in `create-fieldtwin-integration` deploys a static integration to the FieldTwin instance URL you give it, and to nothing else. To do that it logs you in through your browser and stores the resulting deploy token in your user configuration directory (`~/.config/fieldtwin/integrations.json`, `%APPDATA%` on Windows), readable only by you on macOS and Linux (file mode 0600); on Windows the file relies on your user profile's own protection. The token lets the script list the accounts you may deploy to and their integrations, and create, update, roll back and delete FieldTwin-hosted integrations there (you may deploy to an account if you are its admin, or if your role grants "Can deploy integrations" under a PRO licence and the account has the hosted-integrations module; without admin rights you manage only the integrations you created); it gives no access to project data; it expires after 7 days.

## Install

Use any Agent Skills-compatible installer. The cross-agent `skills` CLI can discover the repository and prompt for the target agent and scope:

```bash
npx skills add XvisionAS/fieldtwin-agent-skills \
  --skill create-fieldtwin-integration
npx skills add XvisionAS/fieldtwin-agent-skills \
  --skill develop-fieldtwin-integration
```

For a user-wide, non-interactive installation, name the agent explicitly. For example:

```bash
npx skills add XvisionAS/fieldtwin-agent-skills \
  --skill create-fieldtwin-integration \
  --global \
  --agent codex \
  --yes
```

Replace `codex` with the identifier for another supported client, such as `claude-code`, `cursor`, or `github-copilot`. To install for several clients, repeat `--agent`.

GitHub CLI 2.90 or later also supports previewing and installing standard skills:

```bash
gh skill preview XvisionAS/fieldtwin-agent-skills create-fieldtwin-integration
gh skill install XvisionAS/fieldtwin-agent-skills create-fieldtwin-integration \
  --agent codex \
  --scope user
```

You can also copy `skills/develop-fieldtwin-integration` into any skill directory supported by your agent. No platform-specific manifest is required.

## Example prompts

- `Use develop-fieldtwin-integration to build a secure browser bridge for my FieldTwin custom tab.`
- `Use create-fieldtwin-integration to turn this prototype into a Dockerized Helm integration with Tilt and build-bot support.`
- `Use create-fieldtwin-integration to build a quick single-page FieldTwin integration I can drop on a static host.`
- `Use create-fieldtwin-integration to scaffold a new SvelteKit integration with modules/localdev, devops.sh, and build-pipeline.js.`
- `Use develop-fieldtwin-integration to add Operation Mode search, progress, inline actions, and double-click behavior.`
- `Use develop-fieldtwin-integration to render Oil and Gas system highlights with opposite directions inside one metadata-backed Bundle connection.`
- `Use develop-fieldtwin-integration to debug a SvelteKit Account Settings iframe that stays on Connecting in local Tilt.`
- `Review this FieldTwin postMessage integration for origin, token, and teardown problems.`
- `Add a dynamic page manifest and API client to this FieldTwin integration.`
- `Build a FieldTwin v1.10 client for account configuration, subproject resources, and batch writes.`
- `Use the tenant OpenAPI to implement FieldTwin API v2.0 stream reads, filters, and batch CRUD.`

- `Use develop-fieldtwin-integration to transform coordinates, convert a DGN/DXF file, and read raster profiles and difference volumes.`

## Update

Update installations managed by the `skills` CLI:

```bash
npx skills update create-fieldtwin-integration
npx skills update develop-fieldtwin-integration
```

## Documentation scope

The bundled [integration guide](skills/develop-fieldtwin-integration/integration/README.md), focused references, and fictional samples cover:

- integration manifests, dynamic pages, background loading, and pop-outs;
- the end-to-end local development path through modules, Tilt, Helm, ingress, and FieldTwin;
- the host-sent `loaded` bootstrap and `tokenRefresh` lifecycle;
- authenticated FieldTwin API calls without persisting JWTs, including version selection,
  account/project/subproject routing, readiness, errors, bounded retry, and media-type handling;
- exhaustive v1.10 account/configuration and subproject endpoint families;
- v2.0 users/account/project/subproject/workflow stream CRUD, filters, specialized operations,
  resource ownership, and tenant OpenAPI discovery;
- v1.10 and v2.0 batch POST/PATCH/DELETE envelopes, ordering, atomicity boundaries, response IDs,
  and ambiguous-failure recovery;
- generated v1.10 operation fields and v2.0 read/write resource schemas, with a narrow command-line
  lookup that preserves method and stream differences;
- generated bidirectional host-client `postMessage` event variants and all effective fields, with a
  narrow lookup for direction, event, variant, surface, delivery, correlation, and replies;
- exact-origin, exact-source `postMessage` routing;
- production HTTP headers for iframe embedding and pop-out opener retention, including CSP,
  `X-Frame-Options`, COOP/COEP, and the non-standard status of `X-IFrame-Allow`;
- the complete integration-to-host event matrix and exact singular `type` versus plural `resourceType` vocabulary;
- Operation Search, inline Font Awesome actions, double-click actions, filters, context menus, dynamic panels, and time series;
- host-side system highlighting for metadata-backed connection bundles with multi-channel colors and independent flow direction;
- walking/swimming water-current requests and depth-profile snapshots, numerical limits, ownership,
  acknowledgement, time changes, and iframe/pop-out cleanup;
- Operate shared views: the `supportShareView` opt-in and versioned integration state captured on
  share and restored after `loaded`;
- projector CRS/axis-order transforms, URL-based vector conversion, and raster profiles, signed
  difference volumes, heat-map metadata and float32 tiles;
- automated and manual protocol testing.

See the [FieldTwin documentation center](https://docs.fieldtwin.com/) and [FieldTwin API documentation](https://api.fieldtwin.com/) for current product documentation. Bundled message guidance was reconciled with integration-guide revision 66 and the matching host contract on 2026-11-18. Verify newer events on the target deployment; its current documented contract takes precedence.

All IDs, origins, assets, tags, and measurements in examples are fictional.

## Repository layout

```text
skills/
├── create-fieldtwin-integration/
│   ├── SKILL.md
│   ├── evals/evals.json
│   └── references/
└── develop-fieldtwin-integration/
    ├── SKILL.md
    ├── integration/README.md
    ├── evals/evals.json
    ├── references/
    └── scripts/
```

## Validate a contribution

```bash
python3 scripts/validate_package.py
skills-ref validate ./skills/create-fieldtwin-integration
skills-ref validate ./skills/develop-fieldtwin-integration
```

The first command uses only the Python standard library. It validates the portable `SKILL.md` contract, bundled files and links, and public-safety rules. The second invokes the Agent Skills reference validator when `skills-ref` is installed.

## License

Distributed under the [ISC License](LICENSE).
