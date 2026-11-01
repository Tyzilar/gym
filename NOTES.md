# Gym (standalone) — for friends

A copy of the CinemaApp Gym app that runs entirely in the phone's browser, with an
iOS-style interface (light/dark follow the phone).
Live at https://tyzilar.github.io/gym/ (GitHub repo Tyzilar/gym, Pages from `main` / root).

- Tabs: Workout (`/`), History, Progress (+ `/progress/exercise?id=`), Program (+ `/program/session?id=`).
  The logging screen is `/workout?d=YYYY-MM-DD` (static export has no dynamic routes).
- Data: localStorage on the phone (`src/lib/gym/localStore.ts`), keys `gym:v1:*`. Domain logic is the
  CinemaApp gym's (`src/lib/gym/domain.ts`). Export/Import backup on the Program tab (same file format as CinemaApp).
- UI: `src/app/app.css` (Apple system colours, SF Pro / Inter, grouped lists), primitives in `src/components/ui.tsx`.
- Rest timer: `src/lib/restTimer.ts` (end-time based, survives the phone locking). Default rest is
  `settings.restDefaults.default`; per-exercise overrides use the exercise id.
- Offline: `scripts/make-sw.mjs` writes `out/sw.js` (precache of the whole build) after `next build`.

## Update the live site
1. `npm install` (once), then `npm run build` → `out/`
2. Copy everything in `out/` into the repo root (keep README.md), commit, push to `main`.
   Pages republishes in about a minute. Phones pick up the new version the next time they open it with signal.
