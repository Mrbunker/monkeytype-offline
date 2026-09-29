# Static hosting

Build with Node.js 24 and pnpm 11.21.0:

```sh
pnpm install --frozen-lockfile
pnpm build
python3 -m http.server 8080 --directory frontend/dist
```

Serve the complete `frontend/dist` directory. No application server, database,
service credentials or API proxy is needed. Dependencies require internet access
at installation time; the built application uses same-origin static resources.
Opening `index.html` using `file://` is not supported.

For a project subpath, build with `BASE_PATH=/monkeytype-offline/ pnpm build`.
Hash routes allow reloading history and settings on a plain static server.

Data belongs to the browser profile and origin. Changing the hostname, protocol
or port gives a separate history. Export JSON before moving to a new origin.
See [README](../README.md) for backup scope and browser storage limitations.
