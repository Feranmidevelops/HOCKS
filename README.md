# HOCKS 🏒

Real-time multiplayer air hockey, built in public — one netcode concept at a time.

The goal isn't the game; it's the networking. Each phase adds one technique real multiplayer games use (snapshot interpolation, client-side prediction, server reconciliation) and documents how the game feels before and after.

## Roadmap

- [x] **Phase 0** — Deterministic local sim: fixed 60Hz timestep, pure `(state, inputs) → nextState`, interpolated rendering, determinism test
- [ ] **Phase 1** — Authoritative server + network conditions simulator
- [ ] **Phase 2** — Snapshot interpolation for remote entities
- [ ] **Phase 3** — Client-side prediction for your own paddle
- [ ] **Phase 4** — Puck prediction & reconciliation
- [ ] **Phase 5** — Error correction that doesn't look like teleporting
- [ ] **Phase 6** — Contested outcomes, reconnects, rematch flow
- [ ] **Phase 7** — Debug overlay + measured numbers from real regions

## Run it

```
npm install
npm run dev
```

## Tests

```
npm test
```

The important one is `determinism.test.ts`: the sim run twice over the same recorded input script must produce identical state hashes, tick for tick. Every later phase leans on that property.

## Stack

TypeScript, Vite, Canvas 2D, Vitest. No game engine and no runtime dependencies — the point is to build the moving parts by hand.
