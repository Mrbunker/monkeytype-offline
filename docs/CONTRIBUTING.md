# Contributing to the local practice fork

This repository derives from official Monkeytype commit
`4bd46c6ca1c2b02ba0203b83b6f0b32a2a5a53ec`. Keep GPL-3.0 and upstream notices.
Report fork-specific issues in this repository.

Use the toolchain and commands in [README](../README.md). New frontend components
use Solid TSX and Tailwind; existing typing logic remains in its original form.
Use `oxlint --type-aware --type-check --format agent` for type-aware checks.

Keep result persistence and backup rules in `frontend/src/ts/offline/`.
Do not add account requirements or runtime external service dependencies.
Verify meaningful data changes with unit and browser tests. Changes to resource
loading must work at both the origin root and a deployment subpath.

The theme, language and quote contribution guides retained in this directory
are upstream reference material. Their upstream contribution links refer to
the official project, not to this fork's maintenance process.

See [OFFLINE.md](OFFLINE.md) for acceptance requirements.
