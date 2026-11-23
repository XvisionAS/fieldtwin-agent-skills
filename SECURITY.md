# Security policy

This repository contains documentation, portable Agent Skill instructions and helper scripts. It does not run a service or collect telemetry. `ft-integrations.mjs` stores a deploy token for the FieldTwin instance you log in to, in your user configuration directory with owner-only permissions; it sends that token only to that instance.

## Reporting a problem

Please do not put tokens, customer data, private endpoints, or exploit details in a public issue. Report security-sensitive findings through [FutureOn's contact channel](https://www.futureon.com/contact), identify the `fieldtwin-agent-skills` repository, and include only the minimum information needed to reproduce the issue securely.

Ordinary documentation corrections and non-sensitive sample problems can use a public repository issue.

## Supported versions

Security and protocol corrections are made on the latest release. Update the installed skill before reporting an issue that may already be fixed.

## Sample-data policy

All sample domains, identifiers, tags, coordinates, assets, and measurements in this repository are fictional. Contributions must not contain real JWTs, API tokens, credentials, customer data, personal data, private hostnames, or internal source paths.
