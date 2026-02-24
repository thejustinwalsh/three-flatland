// Game world dimensions (centered at origin)
export const WORLD_WIDTH = 6
export const WORLD_HEIGHT = 4
export const WORLD_LEFT = -WORLD_WIDTH / 2
export const WORLD_RIGHT = WORLD_WIDTH / 2
export const WORLD_TOP = WORLD_HEIGHT / 2
export const WORLD_BOTTOM = -WORLD_HEIGHT / 2

// Paddle
export const PADDLE_WIDTH = 1.2
export const PADDLE_HEIGHT = 0.15
export const PADDLE_Y = WORLD_BOTTOM + 0.3
export const PADDLE_BUMP_FORCE = 8
export const PADDLE_BUMP_DECAY = 12
export const PADDLE_MAX_BUMP = 0.8

// Ball
export const BALL_SIZE = 0.2
export const BALL_SPEED = 3.5
export const BALL_SPEED_INCREASE = 0.1 // Per block hit

// Blocks
export const BLOCK_ROWS = 4
export const BLOCK_COLS = 8
export const BLOCK_WIDTH = 0.6
export const BLOCK_HEIGHT = 0.25
export const BLOCK_GAP = 0.08
export const BLOCK_START_Y = WORLD_TOP - 0.8

// Timing
export const GAME_OVER_DURATION = 2.5 // Seconds before returning to attract
export const READY_DURATION = 2.0 // Seconds for 3-2-1 countdown before ball launch
export const ATTRACT_BALL_SPEED = 2.5 // Slower in attract mode

// Scoring
export const POINTS_PER_BLOCK = 10
export const STREAK_INTERVAL = 8 // Blocks between multiplier bumps
