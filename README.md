# HOCKS 🏒

Real-time multiplayer air hockey, built in public — one netcode concept at a time.

The goal isn't the game; it's the networking. Each phase adds one technique real multiplayer games use (snapshot interpolation, client-side prediction, server reconciliation) and documents how the game feels before and after.

## Roadmap

- [x] **Phase 0** — Deterministic local sim: fixed 60Hz timestep, pure `(state, inputs) → nextState`, interpolated rendering, determinism test
- [x] **Phase 1** — Authoritative server + network conditions simulator
- [x] **Phase 2** — Snapshot interpolation for remote entities
- [ ] **Phase 3** — Client-side prediction for your own paddle
- [ ] **Phase 4** — Puck prediction & reconciliation
- [ ] **Phase 5** — Error correction that doesn't look like teleporting
- [ ] **Phase 6** — Contested outcomes, reconnects, rematch flow
- [ ] **Phase 7** — Debug overlay + measured numbers from real regions

## Run it

Two terminals:

```
npm run dev:server   # authoritative ws server on :8081 (60Hz sim, 20Hz snapshots)
npm run dev          # vite client on :5173
```

Open http://localhost:5173 in two browser windows — first one in is blue, second is red. Each player sees their own goal at the bottom (the view is rotated 180° for player 1).

The panel in the corner is the network conditions simulator: drag latency to 150ms and feel it. Phase 1 (render snapshots verbatim) surfaced two distinct problems:

1. **Your own paddle lags your finger** — every input rides a full round trip before you see its effect. Fixed by client-side prediction (Phase 3).
2. **Everything stutters** — snapshots arrive at 20Hz and were drawn as-is. ~~Fixed by snapshot interpolation (Phase 2).~~ **Fixed**: the client now renders ~100ms in the past, interpolating between the two snapshots that straddle render time. Measured on a client at 150ms latency + 60ms jitter + 5% loss: the raw feed changed the puck's position on 18 of 60 render frames; the interpolated view on 59 of 60.

The Phase 2 trade is explicit: another 100ms of view delay bought per-frame smoothness and loss headroom (a dropped snapshot just widens the interpolation pair). Interpolation deliberately never extrapolates — guessing physics is prediction's job (Phases 3–4), not the renderer's.

## Tests

```
npm test
```

The important one is `determinism.test.ts`: the sim run twice over the same recorded input script must produce identical state hashes, tick for tick. Every later phase leans on that property.

## Stack

TypeScript, Vite, Canvas 2D, Vitest. No game engine and no runtime dependencies — the point is to build the moving parts by hand.
