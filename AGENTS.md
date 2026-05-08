# AGENTS.md

## Build

`npm run build` runs `vue-tsc -b && vite build` — typecheck before bundling.

## Verified Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Frontend dev server (:3001) |
| `npm run dev:server` | Backend only (`--env-file=.env` required) |
| `npm run dev:all` | Frontend + backend concurrently |
| `npm run build` | Typecheck → Vite build |
| `npm run start` | Production backend |

**CI mismatch**: `.github/workflows/ci-cd.yml` references `npm run lint`, `npm run type-check`, `npm run test:coverage` — **none are implemented**. No ESLint or Prettier configured.

## Testing

Vitest is in devDependencies but **not configured**: no `vitest.config.*`, no test script, no `*.test.{ts,js,vue}` files. Verification is currently `npm run build` + manual smoke tests.

## Environment

Backend requires `--env-file=.env` (Node.js native env loading). Copy `.env.example` → `.env`.
Gateway: `ws://127.0.0.1:18789` (use IP, not domain).
Hermes Agent optional: Web UI `http://localhost:9119`, API `http://localhost:8642`.

## Code Style (verified)

Vue 3 + `<script setup lang="ts">`, 2-space indent, single quotes, trailing commas, no semicolons.
`@/` → `src/` (vite.config.ts + tsconfig).
Naming: components `PascalCase.vue`, pages `*Page.vue`, stores/composables `camelCase.ts`.

Strict mode enabled in tsconfig (`tsconfig.app.json`).

## Constitution

1. **Fact first**: read code before editing; no RPC/type changes by guesswork
2. **Single source**: one canonical entry per capability, no page/store duplication
3. **Compatibility first**: adapt to existing Gateway RPC; no unverified protocol branches
4. **Progressive refactoring**: minimal viable loop first, then enhance
5. **Security by default**: credentials never echoed in plaintext; never submit credential patch without new input
6. **Theme consistency**: use `--bg-*`/`--text-*`/`--border-color` vars; no hardcoded colors
7. **Render boundaries**: `v-html` + `<style scoped>` requires `:deep(...)` for injected nodes
8. **Verifiable**: every change must build; document impact and regression points

## Known Pitfalls

- Collapse components have `first-child` rules — check source before changing spacing
- Use gap OR margin exclusively — mixing causes visual inconsistency
- Dark mode: drive via theme variables; scope selectors to avoid cross-page pollution
- Spacing anomalies involve `margin/padding/border` stacking — check all layers
- UI tweaks: preserve information architecture first, then converge spacing/density
