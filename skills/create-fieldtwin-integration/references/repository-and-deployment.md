# Repository and deployment reference

Use this reference to create or review the standard deployable repository surface. Adapt names and omit components the integration does not need; keep one build and deployment path.

## Canonical tree

```text
integration-repository/
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── Tiltfile
├── devops.sh
├── build-pipeline.js
├── modules/
│   ├── localdev
│   ├── dev
│   └── shared-environment.example.com
├── helm/integration/
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── values.schema.json
│   └── templates/
└── fullstacks/main/
    ├── Dockerfile
    ├── .dockerignore
    ├── package.json
    ├── package-lock.json
    ├── .env.example
    ├── migrations/
    ├── src/
    └── tests/
```

The component key `main` is an orchestration interface, not an acceptable global image name. Map it once:

```text
build component: main
source directory: fullstacks/main
OCI repository: equipment-insights-main
Helm workload: equipment-insights-main
```

## Root package contract

Use root scripts as stable developer entrypoints:

| Script | Purpose |
| --- | --- |
| `setup` | Install application dependencies. |
| `start` | Start Tilt for the loaded module. |
| `start:app` | Run the built Node application directly. |
| `build` / `build:all` | Build the application and optional worker. |
| `check` | Run framework and type diagnostics. |
| `lint` | Run formatting and static lint. |
| `test:unit` | Run deterministic unit tests once. |
| `tilt-down` | Remove resources managed by the Tilt session. |

Do not make `npm start` silently run a different deployment path than the rest of the team.

## Environment Modules contract

Modules may define:

- build target and tag strategy;
- image registry;
- Kubernetes context, control namespace, runtime namespace, and build namespace;
- Helm release and DNS domain;
- worker enablement;
- pull-secret names; and
- non-secret application settings encoded as Helm values.

Modules must not contain credentials. A local module should run without placeholder cluster objects. If it disables the worker, the rendered chart must also omit worker Deployments, worker service accounts, worker RBAC, worker namespaces, build quotas, and credential Secret references.

## Docker contract

Use stages for dependencies, development, build, and production where the stack benefits from them. The production image should:

- contain only production dependencies and compiled outputs;
- run as an unprivileged fixed UID/GID;
- listen on the documented container port;
- support a read-only root filesystem with explicit temporary mounts;
- contain both web and worker outputs when both use the same image; and
- expose a health check or work with Kubernetes HTTP probes.

Keep package-lock files synchronized and prefer deterministic installation such as `npm ci`.
Production pods should use a read-only root filesystem. A local Vite/Tilt development pod may set
it writable when live sync, Vite's temporary config bundle, or dependency installation writes under
the application directory; keep that exception in the local module rather than weakening shared
environments. Give the local development pod enough memory for dependency optimization and live
transforms; do not assume production server limits are sufficient for a development toolchain.

## Helm contract

The chart should render:

- web Deployment, Service, Ingress, optional disruption budget, and web service account;
- optional worker Deployment and only its required service account/RBAC;
- optional build/runtime namespace resources only when the worker is enabled;
- probes, resource requests/limits, security contexts, image pull secrets, and labels; and
- direct environment entries plus an optional credential Secret reference.

Avoid required ConfigMaps for plain environment variables. Use a ConfigMap only when configuration has an independent lifecycle or must be mounted as a file. Never render empty `envFrom` entries.

## Tilt contract

Tilt should:

1. require a selected context and namespace;
2. use a program-qualified image repository;
3. build the application Dockerfile with the module-selected target;
4. pass the same image repository and tag to Helm;
5. parse module Helm values without losing string intent;
6. register only resources the chart renders;
7. create only enabled namespaces; and
8. live-sync only paths compatible with the selected Docker stage.

Local defaults must be safe if an old terminal lacks a newly introduced module variable. For example, a minikube development context should default an optional credential-dependent worker to disabled.

## Build-bot contract

Keep `build-pipeline.js` declarative. Its component list calls:

```text
devops.sh build <component>
devops.sh push <component>
devops.sh deploy
```

`devops.sh` owns tag generation, component-to-image mapping, Docker paths, Helm values, namespace setup, and registry-secret handling. The pipeline must not reimplement them.

## Validation matrix

| Surface | Required evidence |
| --- | --- |
| Local module | One expected web workload, program-qualified image, direct non-secret env, no missing object references. |
| Worker module | Worker plus scoped RBAC/limits, external credential Secret reference, build/runtime configuration. |
| Helm | Lint succeeds; each module renders; schema rejects invalid types. |
| Kubernetes | Client dry-run accepts every rendered object. |
| Tilt | Evaluation names the expected Dockerfile, OCI repository, and Kubernetes resources. |
| Application | Format, lint, type checks, tests, web build, and worker build pass. |
| Container | Image builds and starts as non-root when a Docker daemon is available. |
| FieldTwin | Manifest loads; trusted `loaded` and `tokenRefresh` work; dynamic pages are authenticated and tenant-scoped. |

Do not mutate a shared or production cluster merely to prove rendering. Deploy only when the user asks or the existing workflow clearly authorizes it.
