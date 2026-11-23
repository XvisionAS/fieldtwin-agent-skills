# Security policy

This repository contains documentation, portable Agent Skill instructions and helper scripts. It does not run a service or collect telemetry. `ft-integrations.mjs` stores a deploy token for the FieldTwin instance you log in to, in your user configuration directory (file mode 0600 on macOS and Linux; on Windows the file relies on your user profile's own protection); it sends that token only to that instance. The token lets the script list the accounts you administer and their integrations, and create, update and delete FieldTwin-hosted integrations there; it gives no access to project data; it expires after 7 days.

## Reporting a problem

Please do not put tokens, customer data, private endpoints, or exploit details in a public issue. Report security-sensitive findings through [FutureOn's contact channel](https://www.futureon.com/contact), identify the `fieldtwin-agent-skills` repository, and include only the minimum information needed to reproduce the issue securely.

Ordinary documentation corrections and non-sensitive sample problems can use a public repository issue.

## Supported versions

Security and protocol corrections are made on the latest release. Update the installed skill before reporting an issue that may already be fixed.

## Sample-data policy

All sample domains, identifiers, tags, coordinates, assets, and measurements in this repository are fictional. Contributions must not contain real JWTs, API tokens, credentials, customer data, personal data, private hostnames, or internal source paths.
