# Local practice fork

Follow [AGENTS.md](../AGENTS.md) for coding conventions.

The workspace contains the official Monkeytype frontend (Vite and SolidJS)
and shared packages. New components use Solid TSX. Keep the official typing
engine and scoring behavior; local persistence belongs in `frontend/src/ts/offline/`.

Use `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm test:packages`,
`pnpm lint:packages` and `pnpm check-assets`.
See [README](../README.md) for browser tests and static deployment.
