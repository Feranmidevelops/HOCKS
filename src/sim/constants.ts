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

// Ticks the puck stays dead at centre after a goal before play resumes.
export const FREEZE_TICKS = 45

// Phase 0 only: the player can't reach the far half, so a puck that stalls
// there would soft-lock the game. Below MIN_LIVE_SPEED in the far half it
// gets a deterministic nudge back toward the player's side. Remove when a
// real opponent exists (Phase 1+).
export const MIN_LIVE_SPEED = 30
export const RESCUE_SPEED = 140
