# Temple Runner

Temple Run-inspired endless runner in the browser. Three.js + TypeScript + Vite,
with a pure-TypeScript track-space core that is unit-tested without WebGL.

Live: https://temple.ziniewicz.eu

## Develop (Docker only, nothing on the host)

```bash
docker compose --profile dev up dev          # http://localhost:3001, hot reload (DEV_PORT=… to change)
docker compose --profile dev run --rm dev npm test
docker compose --profile dev run --rm dev npx tsc --noEmit
```

## Deploy

Static site served by Caddy. `compose.yaml` is the Komodo stack (`temple-runner`,
server mail.ziniewicz.eu); Traefik routes `temple.ziniewicz.eu` to it from
`homecloud/traefik/dynamic/temple-runner.yml`. Push to `main` redeploys.

## Docs

- `docs/superpowers/specs/` — design specs (start with the track-space core).
- `AI.md` — module map and constants for the current code.
- `AI-original-spec.md` — the original v1 game design brief.
