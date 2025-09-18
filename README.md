# OnBoardPro

## Security Notes

- Dev-only audit warnings: `npm audit` may report moderate vulnerabilities under the Drizzle CLI toolchain (e.g., `@esbuild-kit/core-utils` pulling an older `esbuild`). These are used only during development (migrations/CLI) and are not part of the production build artifacts.
- Production build is clean: `npm audit --production` reports 0 vulnerabilities. The app bundles with Vite 7 and ships only the compiled client assets plus the server bundle.
- Mitigation in place: we pin `esbuild@0.25.0` via `overrides` for most consumers (including Vite and tsx). Some nested dev tools still install their own `esbuild`, which triggers the dev-only advisory, but does not affect runtime.
- How to verify:
  - Run `npm audit --production` to focus on runtime dependencies.
  - Run `npm run build` to generate production artifacts in `dist/`.

## Tooling

- Bundler: Vite 7 with `@vitejs/plugin-react-swc`.
- Node: 18+ recommended (tested with Node 24.x).

## Commands

- Dev: `npm run dev`
- Build: `npm run build`
- Audit (prod only): `npm audit --production`

## Browserslist Data

- If you see a warning about old Browserslist/caniuse-lite data during build, update the local DB:
  - `npx update-browserslist-db@latest`
  - Optionally add an npm script: `"browserslist:update": "npx update-browserslist-db@latest"`
  - More info: https://github.com/browserslist/update-db

## Upgrading To Vite 7

- Summary
  - Upgraded `vite` to `^7.1.6` and switched to `@vitejs/plugin-react-swc` for faster React transforms.
  - Removed unused `@tailwindcss/vite` (was not referenced in `vite.config.ts`).
  - Bumped `@types/node` to satisfy Vite 7 peer requirement.
  - Kept `overrides` to pin `esbuild@0.25.0` due to dev-tooling chain (`drizzle-kit`/`@esbuild-kit`).
- Config changes
  - `vite.config.ts` now imports `@vitejs/plugin-react-swc` and keeps existing aliases/root/outDir.
- Requirements
  - Node 18+ (tested with Node 24.x).
- Verification
  - `npm install`
  - `npm run dev` and `npm run build`
  - `npm audit --production` should report 0 vulnerabilities.
