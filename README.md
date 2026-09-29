# Monkeytype Local Practice

A browser-only fork of [monkeytypegame/monkeytype](https://github.com/monkeytypegame/monkeytype), based on commit `4bd46c6ca1c2b02ba0203b83b6f0b32a2a5a53ec` (26.32.0).

Keeps the official typing engine, interface, scoring, themes, fonts, sounds, languages and quote collections. Removes accounts, cloud sync, APIs, leaderboards, advertising, telemetry and remote text generators. This is an unofficial fork, licensed under GPL-3.0; see [LICENSE](LICENSE).

## Run from source

Requires Node.js 24 and pnpm 11.21.0 (versions are declared in `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Development runs on `http://127.0.0.1:3000`. Dependency installation needs internet access; running a built site does not require external services or credentials.

## Build a static site

```sh
pnpm build
npm run dev
```

Open `http://127.0.0.1:8032`. The repository already includes a verified
`frontend/dist`, so `npm run dev` only needs Node.js: it does not run
`npm install`, rebuild the project, use Python, or access an external service.
Set `PORT=3000 npm run dev` or `HOST=0.0.0.0 npm run dev` to change the listener.

For source development, run `pnpm dev:source`; dependency installation and
builds use pnpm as declared in `package.json`. Copy the complete
`frontend/dist` directory to any static HTTP host. Assets remain local to that
host; the language and quote libraries are included in full. The application
uses hash navigation, so refreshing history/settings does not need server
rewrite rules. Opening `index.html` directly with `file://` is not supported.

For a GitHub Pages project directory, set the deployment base when building:

```sh
BASE_PATH=/monkeytype-offline/ pnpm build
```

Upload the contents of `frontend/dist` to that directory. No Firebase project, database server, environment secrets, service worker or API proxy is required.

## Local data

- Settings, custom themes and favorite quotes stay in this browser.
- Valid completed tests are saved to IndexedDB. History includes filters, result details, charts and personal bests.
- JSON export includes results, settings, custom themes and favorite quotes. Uploaded background/font files are not included.
- Import validates the entire file before writing. Results merge by ID; existing records win. PB flags are recomputed. Saved preferences replace current preferences. If preferences cannot be restored after results are saved, the UI reports the partial restore explicitly; retrying does not duplicate results.
- Deleting a result recalculates PBs. Other tabs refresh after local history changes.
- History supports up to 50,000 records; imports are limited to 50 MB. Export before clearing browser storage. Browser profiles and different origins/ports have separate data.
- Storage failure is visible and does not prevent typing. A failed result save can be retried from the result page.

The original result eligibility rules remain in place: failed, repeated, too-short or otherwise invalid tests are not saved. PB eligibility and grouping follow the official rules. TTS uses installed local browser/OS voices only; availability depends on the device.

## Checks

```sh
pnpm build
pnpm lint
pnpm test
pnpm test:packages
pnpm lint:packages
pnpm check-assets
pnpm --filter @monkeytype/frontend exec playwright install chromium
pnpm --filter @monkeytype/frontend test:browser
```

The browser suite exercises all five main modes with real typing, persistence
across reload, cross-tab history updates, time/word PB tables, backup/import/delete,
malformed imports, unavailable storage, settings navigation and local language,
theme, font and sound assets. External requests are blocked and recorded in every
test. Set `CHROME_PATH` to use an existing Chromium/Chrome executable.

To run the same checks under a deployment subpath (stop any server on port 4173
before switching between root and subpath tests):

```sh
BASE_PATH=/monkeytype-offline/ pnpm --filter @monkeytype/frontend exec vite build --outDir ../dist-subpath/monkeytype-offline
E2E_SUBPATH=true pnpm --filter @monkeytype/frontend test:browser
```

The CI workflow runs both deployments. Source installations use the committed
lockfile; browser binaries are development test dependencies, not runtime needs.

See [docs/OFFLINE.md](docs/OFFLINE.md) for scope and acceptance requirements.
