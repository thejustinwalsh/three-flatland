# ZzFX Sound Design for Mini-Games

This document covers retro sound effect design using ZzFX parameter arrays.

---

## ZzFX Parameter Format

Mini-games use raw ZzFX parameter arrays for maximum flexibility:

```typescript
type ZzFXParams = [
  volume?: number,      // 0: Volume (0-1, default 1)
  randomness?: number,  // 1: Randomness (0-1, adds variation)
  frequency?: number,   // 2: Frequency in Hz (default 220)
  attack?: number,      // 3: Attack time in seconds
  sustain?: number,     // 4: Sustain time in seconds
  release?: number,     // 5: Release/decay time in seconds
  shape?: number,       // 6: Waveform (0=sine, 1=square, 2=saw, 3=tri, 4=noise)
  shapeCurve?: number,  // 7: Shape curve (1=normal, higher=sharper)
  slide?: number,       // 8: Pitch slide per second
  deltaSlide?: number,  // 9: Pitch slide acceleration
  pitchJump?: number,   // 10: Pitch jump in Hz
  pitchJumpTime?: number, // 11: When to jump (seconds)
  repeatTime?: number,  // 12: Repeat period (seconds)
  noise?: number,       // 13: Noise added to signal
  modulation?: number,  // 14: Frequency modulation
  bitCrush?: number,    // 15: Bit crush (0=off, higher=more)
  delay?: number,       // 16: Delay before sound starts
  sustainVolume?: number, // 17: Volume during sustain (0-1)
  decay?: number,       // 18: Decay time after attack
  tremolo?: number,     // 19: Tremolo/vibrato amount
  filter?: number,      // 20: Low-pass filter (0=off)
]
```

---

## Sound Bridge Interface

Mini-games receive a `zzfx` function prop that matches the native ZzFX API:

```typescript
// In mini-game component
export interface MiniGameProps {
  zzfx?: (...params: ZzFXParams) => void
}

// Usage - just call like native zzfx
function Game({ zzfx = () => {} }: MiniGameProps) {
  const playBounce = () => {
    zzfx(0.4, 0, 400, 0, 0.015, 0.035, 3)
  }
}
```

---

## Waveform Selection

| Shape | Value | Character | Best For |
|-------|-------|-----------|----------|
| Sine | 0 | Soft, pure | Gentle tones, UI feedback |
| Square | 1 | Retro, buzzy | Classic arcade, 8-bit |
| Sawtooth | 2 | Harsh, bright | Aggressive sounds |
| Triangle | 3 | Warm, mellow | Soft taps, bounces |
| Noise | 4 | White noise | Impacts, explosions |

---

## Frequency Guidelines

| Range | Frequency | Character |
|-------|-----------|-----------|
| Bass | 80-200 Hz | Deep, rumbling |
| Low-mid | 200-400 Hz | Warm, full |
| Mid | 400-800 Hz | Clear, present |
| High-mid | 800-1200 Hz | Bright, chime-like |
| High | 1200-2000 Hz | Piercing, alert |

---

## Envelope Patterns

### Quick Tap (UI click)
```
Attack: 0        ───┐
Sustain: 0.01       │▄
Release: 0.03    ───┴──
```
```typescript
[0.5, 0, 500, 0, 0.01, 0.03, 3]
```

### Soft Bounce
```
Attack: 0        ───┐
Sustain: 0.015      │▄▄
Release: 0.035   ───┴───
```
```typescript
[0.4, 0, 400, 0, 0.015, 0.035, 3]
```

### Impact/Hit
```
Attack: 0        ───┐
Sustain: 0.05       │▄▄▄▄
Release: 0.1     ───┴─────
```
```typescript
[0.6, 0.1, 100, 0, 0.05, 0.1, 4] // Noise burst
```

### Rising Tone (Jump)
```
Pitch:     ╱
          ╱
Slide: +400
```
```typescript
[0.5, 0, 200, 0, 0.05, 0.1, 0, 1, 400]
```

### Descending Tone (Fall/Lose)
```
Pitch: ╲
        ╲
Slide: -200
```
```typescript
[0.5, 0, 400, 0, 0.2, 0.3, 0, 1, -200]
```

---

## Sound Preset Library

### Positive Feedback

```typescript
// Jump - quick rising chirp
const JUMP = [0.5, 0, 200, 0, 0.05, 0.1, 0, 1, 400]

// Collect/coin - bright double-tap
const COLLECT = [0.5, 0, 600, 0, 0.02, 0.05, 0, 1, 0, 0, 200, 0.03]

// Level up - triumphant rise
const LEVEL_UP = [0.6, 0, 300, 0, 0.1, 0.2, 0, 1, 100, 0, 400, 0.05]

// Block break - satisfying chime
const BLOCK_BREAK = [0.5, 0, 800, 0, 0.02, 0.08, 0]

// Power up - ascending sweep
const POWER_UP = [0.5, 0, 200, 0.02, 0.1, 0.15, 0, 1, 50, 0, 300, 0.05]
```

### Neutral Feedback

```typescript
// Bounce - warm tap
const BOUNCE = [0.4, 0, 400, 0, 0.015, 0.035, 3]

// Wall hit - soft thud
const WALL_HIT = [0.3, 0.05, 150, 0, 0.02, 0.04, 3]

// Paddle hit - satisfying pop
const PADDLE_HIT = [0.5, 0, 300, 0, 0.02, 0.05, 1]

// UI click - subtle tick
const CLICK = [0.3, 0, 500, 0, 0.01, 0.03, 3]
```

### Negative Feedback

```typescript
// Hit/damage - noise burst
const DAMAGE = [0.6, 0.1, 100, 0, 0.05, 0.1, 4, 1, 0, 0, 0, 0, 0, 0.5]

// Game over - descending sad trombone
const GAME_OVER = [0.5, 0, 400, 0, 0.2, 0.3, 0, 1, -150, 0, -100, 0.1]

// Miss - quick low thud
const MISS = [0.4, 0.1, 100, 0, 0.03, 0.08, 4]

// Warning - alert beep
const WARNING = [0.5, 0, 600, 0, 0.05, 0.05, 1, 1, 0, 0, -100, 0.03, 0.1]
```

---

## Design Principles

### 1. Frequency Matching
Match sound frequency to visual scale:
- Small objects (balls, particles) → Higher frequencies (400-800 Hz)
- Large objects (paddle, walls) → Lower frequencies (150-300 Hz)

### 2. Action Matching
- Quick actions → Short sounds (< 0.1s total)
- Significant events → Longer, more complex sounds
- Background/ambient → Subtle, low volume

### 3. Contrast for Clarity
- Positive events → Rising pitch, bright tones
- Negative events → Falling pitch, noise/harsh tones
- Neutral events → Stable pitch, warm tones

### 4. Layering
For important events, consider layering:
```typescript
// Satisfying block break: chime + thud
const blockBreak = () => {
  zzfx(0.5, 0, 800, 0, 0.02, 0.08, 0)      // Bright chime
  zzfx(0.3, 0.1, 150, 0, 0.01, 0.05, 4)    // Subtle impact
}
```

### 5. Volume Balance
- Primary actions: 0.4-0.6 volume
- Secondary feedback: 0.2-0.4 volume
- Ambient/subtle: 0.1-0.3 volume

---

## Testing Sounds

### ZzFX Designer
Use the online tool to experiment: https://killedbyapixel.github.io/ZzFX/

### Quick Test in Console
```javascript
// Paste ZzFX micro and test
zzfx(...[0.5, 0, 400, 0, 0.015, 0.035, 3])
```

### A/B Testing
Try multiple variations and pick the most satisfying:
```typescript
// Variation A - brighter
const bounceA = [0.4, 0, 500, 0, 0.01, 0.03, 3]

// Variation B - warmer
const bounceB = [0.4, 0, 350, 0, 0.02, 0.04, 3]

// Variation C - snappier
const bounceC = [0.5, 0, 400, 0, 0.008, 0.025, 1]
```

---

## Performance Tips

1. **Don't spam sounds** - Debounce rapid-fire events
2. **Volume ramp** - Start quiet after mute toggle
3. **Respect user preference** - Always check if sound is enabled
4. **Keep sounds short** - Long sounds can overlap unpleasantly

```typescript
// Debounce example
let lastSoundTime = 0
const MIN_SOUND_INTERVAL = 50 // ms

function playSoundDebounced(params: ZzFXParams) {
  const now = Date.now()
  if (now - lastSoundTime > MIN_SOUND_INTERVAL) {
    zzfx(...params)
    lastSoundTime = now
  }
}
```
