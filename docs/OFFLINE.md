# Monkeytype local practice

This fork starts from the official `monkeytypegame/monkeytype` repository at
`4bd46c6ca1c2b02ba0203b83b6f0b32a2a5a53ec` (26.32.0). It retains GPL-3.0 and
the upstream notices. It does not use the earlier niraj-envision/type project.

## Scope

- Preserve the official typing engine, rendering, time/words/quote/zen/custom
  modes, local language and quote assets, settings, themes, fonts, and sounds.
- Remove remote authentication, API requests, cloud sync, leaderboards,
  social features, ads, telemetry, release checks, and remote text generators.
- Keep configuration persistence and validation. Store completed results in
  IndexedDB. Provide local personal bests, history, filtering, trends, and
  versioned JSON backup/restore with duplicate handling.
- Keep result validity and personal-best eligibility explicit; no simulated
  login, fake API responses, or cloud-authoritative rewards.
- Ship one complete static directory. Local HTTP serving is supported;
  single-file HTML, split/lite builds, and PWA installation are not milestones
  for this version.

## Acceptance

1. Build from the documented toolchain without service credentials or a backend.
2. Exercise official typing modes with real browser input and compare relevant
   calculations against upstream tests/fixtures.
3. Verify settings and result persistence, PB grouping, filtering, deletion,
   backup/restore, malformed imports, and unavailable storage.
4. Deny external requests from first page load; exercise mode, language, theme,
   and sound selection, typing, result saving, and history without errors.
5. Verify the static build at both the origin root and a deployment subpath.
6. Audit reachable source and build artifacts for remote service dependencies.
7. Deliver under `~/codes/lz`, preserve upstream provenance and the previous
   repository history, and push an inspectable branch to GitHub.

## Implementation sequence

1. Establish the upstream baseline and compatible toolchain.
2. Remove online startup, pages, commands, modals, and dependencies.
3. Connect local result persistence and reusable official result UI.
4. Add history, PB, backup/restore, and regression coverage.
5. Audit, document, and publish the verified branch.
