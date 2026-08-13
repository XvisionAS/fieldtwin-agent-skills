# FieldTwin Agent Skills

Public, portable [Agent Skills](https://agentskills.io/home) for building secure FieldTwin integrations.

This repository publishes two complementary skills:

- **Create FieldTwin Integration** — scaffold the application, Docker image, Helm chart,
  Environment Modules, Tilt workflow, `devops.sh`, build-bot pipeline, secrets boundary, and
  validation path for a new deployable integration.
- **Develop FieldTwin Integration** — build, run, debug, test, and review FieldTwin custom-tab integrations, including the local Tilt/Helm path, HTTP/HTTPS URL generation, iframe lifecycle, API authentication, `postMessage`, pop-out windows, Operation Mode, settings, and protocol tests.

The skill is documentation and instructions only. It has no MCP server or executable runtime, makes no network requests by itself, and does not collect credentials or usage data.

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
- `Use create-fieldtwin-integration to scaffold a new SvelteKit integration with modules/localdev, devops.sh, and build-pipeline.js.`
- `Use develop-fieldtwin-integration to add Operation Mode search, progress, inline actions, and double-click behavior.`
- `Use develop-fieldtwin-integration to debug a SvelteKit Account Settings iframe that stays on Connecting in local Tilt.`
- `Review this FieldTwin postMessage integration for origin, token, and teardown problems.`
- `Add a dynamic page manifest and API client to this FieldTwin integration.`

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
- authenticated FieldTwin API calls without persisting JWTs;
- exact-origin, exact-source `postMessage` routing;
- common resource, selection, settings, and UI messages;
- Operation Search, inline Font Awesome actions, double-click actions, filters, context menus, dynamic panels, and time series;
- automated and manual protocol testing.

See the [FieldTwin documentation center](https://docs.fieldtwin.com/) and [FieldTwin API documentation](https://api.fieldtwin.com/) for the current product documentation. The bundled protocol guidance was verified against the FieldTwin integration guide revision 52 on 2026-08-12. When a deployed FieldTwin environment differs, its current documented contract takes precedence.

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
    └── references/
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
