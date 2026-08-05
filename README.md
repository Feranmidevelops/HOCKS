# HOCKS 🏒

Real-time multiplayer air hockey, built in public — one netcode concept at a time.

The goal isn't the game; it's the networking. Each phase adds one technique real multiplayer games use (snapshot interpolation, client-side prediction, server reconciliation) and documents how the game feels before and after.

## Roadmap

- [x] **Phase 0** — Deterministic local sim: fixed 60Hz timestep, pure `(state, inputs) → nextState`, interpolated rendering, determinism test
- [x] **Phase 1** — Authoritative server + network conditions simulator
- [x] **Phase 2** — Snapshot interpolation for remote entities
- [x] **Phase 3** — Client-side prediction for your own paddle
- [x] **Phase 4** — Puck prediction & reconciliation
- [x] **Phase 5** — Error correction that doesn't look like teleporting
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

1. **Your own paddle lags your finger** — every input rides a full round trip before you see its effect. ~~Fixed by client-side prediction (Phase 3).~~ **Fixed**: the client runs the exact server movement code (`movePaddle`, same substeps) locally and renders the result immediately. Measured at 200ms one-way latency after a fast sweep: the predicted paddle reached the target in 200ms (pure travel time), the server's echo started moving at ~400ms (the RTT) and arrived at 600ms — at *exactly* the predicted position. The paddle is the easy prediction case: it depends only on your own input, which you know instantly and perfectly. The shared puck depends on the opponent's input too — that's Phase 4.
2. **Everything stutters** — snapshots arrive at 20Hz and were drawn as-is. ~~Fixed by snapshot interpolation (Phase 2).~~ **Fixed**: the client now renders ~100ms in the past, interpolating between the two snapshots that straddle render time. Measured on a client at 150ms latency + 60ms jitter + 5% loss: the raw feed changed the puck's position on 18 of 60 render frames; the interpolated view on 59 of 60.

The Phase 2 trade is explicit: another 100ms of view delay bought per-frame smoothness and loss headroom (a dropped snapshot just widens the interpolation pair). Interpolation deliberately never extrapolates — guessing physics is prediction's job (Phases 3–4), not the renderer's.

## Phase 4: the puck at present time

Every client tick sends an input tagged with a sequence number and keeps it in an unacked buffer. Snapshots are personalized: each player's carries the highest own-input seq the state reflects. On every snapshot the client **resets to the server's state, drops acked inputs, and resimulates the unacked rest** — so the puck (and own paddle) render at present time instead of one RTT in the past. The unacked count in the status bar is literally your RTT expressed in ticks.

Measured at 150ms one-way latency: after striking the puck, the predicted puck moves at local contact; the server echo follows **366ms later**.

During resimulation the opponent is frozen at their last known position — their future inputs are the one thing the client cannot know. So misprediction isn't an edge case; it's **guaranteed**, and it concentrates exactly at the moment the opponent strikes. Measured: an opponent strike produced a **67-unit single-frame jump** in the predicted puck (physics allows ~37u/frame max — the rest is the correction teleporting). Phase 4 renders that jump raw, deliberately. Making it not look like teleporting is Phase 5.

One free lunch: because the client corrects *toward the server's state* rather than running lockstep, floating-point drift between Node and the browser doesn't matter here. Rollback fighting games need bit-exactness across machines; this architecture doesn't.

## Phase 5: corrections that don't teleport

The sim corrects instantly (physics never lies); only the *display* blends. On each reconciliation, the gap between what was shown and the corrected truth becomes an error offset — position **and** velocity — that decays to zero. Velocity error is integrated into position error, so the displayed puck keeps a ghost of its old momentum and *curves* onto the true path instead of kinking sideways.

Thresholds, chosen by feel and written down:

- **Snap above 140u** (~⅓ table width): beyond that the puck isn't slightly off, it's somewhere else — easing would show it gliding through paddles and walls, which lies harder than an honest teleport. Goals and freeze resets always snap for the same reason.
- **Decay: position τ=80ms, velocity τ=60ms** — ~85% of the error is gone by 150ms (the roadmap's 100–200ms window); velocity decays faster than position so the ghost momentum can't overshoot.

Measured on the Phase 4 scenario (opponent strike, 150ms latency): a correction that peaked at **36u** of error rendered with a maximum frame-to-frame movement of **21u — inside the 37u/frame physics ceiling** — and fully released 333ms after peak. The same class of event in Phase 4 teleported 67u in one frame. The status bar shows `smoothing Nu` while an offset is live.

## Tests

```
npm test
```

The important one is `determinism.test.ts`: the sim run twice over the same recorded input script must produce identical state hashes, tick for tick. Every later phase leans on that property.

## Stack

TypeScript, Vite, Canvas 2D, Vitest. No game engine and no runtime dependencies — the point is to build the moving parts by hand.
