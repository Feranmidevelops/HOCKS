// Table geometry, in logical units. Portrait table; player 0 defends the
// bottom edge, player 1 (a parked paddle in Phase 0) defends the top.
export const TABLE_W = 450
export const TABLE_H = 800
export const GOAL_W = 180

export const PUCK_R = 14
export const PADDLE_R = 28

// The sim only ever advances in fixed DT increments — never variable
// delta-time. Substeps subdivide each tick for collision robustness.
export const TICK_RATE = 60
export const DT = 1 / TICK_RATE
export const SUBSTEPS = 4

export const PADDLE_MAX_SPEED = 900
export const PUCK_MAX_SPEED = 2200
export const WALL_RESTITUTION = 0.99
export const PADDLE_RESTITUTION = 0.9
// Fraction of puck velocity retained per second of glide.
export const FRICTION_RETAIN = 0.6

// Ticks the puck stays dead after a goal before play resumes.
export const FREEZE_TICKS = 45

// Serve rule: after a goal the puck spawns in the CONCEDER's half, at a
// depth the scorer physically cannot reach (their paddle is clamped to the
// other half) — only the loser of the round can strike first.
export const SERVE_DEPTH = 0.28

// Anti-stall: a puck at rest (below MIN_LIVE_SPEED) anywhere on the table
// for STALL_TICKS drifts back toward centre at RESCUE_SPEED. Unsticks
// unreachable pucks, ignored serves, and the solo wall-opponent's serve.
export const MIN_LIVE_SPEED = 30
export const STALL_TICKS = 150
export const RESCUE_SPEED = 140
