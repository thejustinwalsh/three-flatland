/**
 * Retro sound effects using ZzFX (lazy-loaded)
 * Provides satisfying click and hover sounds with subtle randomization
 */

// ZzFX micro - Zuper Zmall Zound Zynth
// Minified version - https://github.com/KilledByAPixel/ZzFX
type ZzFXParams = [
  volume?: number,
  randomness?: number,
  frequency?: number,
  attack?: number,
  sustain?: number,
  release?: number,
  shape?: number,
  shapeCurve?: number,
  slide?: number,
  deltaSlide?: number,
  pitchJump?: number,
  pitchJumpTime?: number,
  repeatTime?: number,
  noise?: number,
  modulation?: number,
  bitCrush?: number,
  delay?: number,
  sustainVolume?: number,
  decay?: number,
  tremolo?: number,
  filter?: number,
];

let zzfxLoaded = false;
let zzfxX: AudioContext | null = null;

// Callbacks for when audio state changes
type AudioStateCallback = (initialized: boolean) => void;
const audioStateCallbacks: Set<AudioStateCallback> = new Set();

function onAudioStateChange(callback: AudioStateCallback): () => void {
  audioStateCallbacks.add(callback);
  // Return unsubscribe function
  return () => audioStateCallbacks.delete(callback);
}

function notifyAudioStateChange(): void {
  audioStateCallbacks.forEach(cb => cb(zzfxLoaded));
}

function isAudioInitialized(): boolean {
  return zzfxLoaded;
}

// Volume levels: 0 = mute, 1 = low, 2 = medium, 3 = high
export type VolumeLevel = 0 | 1 | 2 | 3;
const VOLUME_LEVELS: Record<VolumeLevel, number> = {
  0: 0,      // Mute
  1: 0.024,  // Low (30% of max)
  2: 0.048,  // Medium (60% of max)
  3: 0.08,   // High (100% - original master volume)
};

// Current volume level (default to muted)
let currentVolumeLevel: VolumeLevel = 0;

// Get the actual volume multiplier for the current level
function getZzfxV(): number {
  return VOLUME_LEVELS[currentVolumeLevel];
}

/**
 * Compute a normalized volume that compensates for perceptual loudness differences.
 * Based on simplified equal-loudness contours (Fletcher-Munson curves) and waveform energy.
 *
 * @param baseVolume - The desired perceptual volume (0-1 scale)
 * @param frequency - The fundamental frequency in Hz
 * @param shape - The waveform shape (0=sine, 1=square, 2=saw, 3=triangle, 4=noise)
 * @returns Adjusted volume that should sound perceptually similar across different sounds
 */
function normalizeVolume(baseVolume: number, frequency: number, shape: number = 0): number {
  // Frequency compensation based on simplified A-weighting curve
  // Reference point is 1000 Hz (most sensitive range)
  // Lower frequencies need boost, very high frequencies need slight reduction
  let freqCompensation: number;
  if (frequency < 200) {
    freqCompensation = 2.0; // Bass needs significant boost
  } else if (frequency < 500) {
    freqCompensation = 1.4 + (500 - frequency) / 500 * 0.6; // 1.4 - 2.0
  } else if (frequency < 1000) {
    freqCompensation = 1.0 + (1000 - frequency) / 500 * 0.4; // 1.0 - 1.4
  } else if (frequency < 2000) {
    freqCompensation = 1.0; // Most sensitive range
  } else if (frequency < 4000) {
    freqCompensation = 0.9; // Still sensitive
  } else {
    freqCompensation = 0.8; // High frequencies roll off
  }

  // Waveform compensation - square/saw have more energy than sine
  const shapeCompensation: Record<number, number> = {
    0: 1.0,   // Sine - reference
    1: 0.65,  // Square - much more energy (harmonics)
    2: 0.75,  // Sawtooth - more energy
    3: 0.9,   // Triangle - slightly more than sine
    4: 0.7,   // Noise - lots of energy
  };
  const shapeComp = shapeCompensation[shape] ?? 1.0;

  return baseVolume * freqCompensation * shapeComp;
}

// Lazy-load ZzFX audio context
async function initAudio(): Promise<boolean> {
  if (zzfxLoaded) return true;

  try {
    // Create audio context on first user interaction
    zzfxX = new AudioContext();
    zzfxLoaded = true;
    notifyAudioStateChange();
    return true;
  } catch {
    console.warn('Audio not available');
    return false;
  }
}

// ZzFX sound generator (inlined to avoid external dependency)
function zzfx(...params: ZzFXParams): AudioBufferSourceNode | undefined {
  if (!zzfxX || !zzfxLoaded) return;

  const [
    volume = 1,
    randomness = 0.05,
    frequency = 220,
    attack = 0,
    sustain = 0,
    release = 0.1,
    shape = 0,
    shapeCurve = 1,
    slide = 0,
    deltaSlide = 0,
    pitchJump = 0,
    pitchJumpTime = 0,
    repeatTime = 0,
    noise = 0,
    modulation = 0,
    bitCrush = 0,
    delay = 0,
    sustainVolume = 1,
    decay = 0,
    tremolo = 0,
    filter = 0,
  ] = params;

  const sampleRate = zzfxX.sampleRate;
  const PI2 = Math.PI * 2;

  // Apply randomness
  const startFrequency = frequency * (1 + randomness * 2 * (Math.random() - 0.5));
  const startSlide = slide * (1 + randomness * 2 * (Math.random() - 0.5));

  // Calculate duration
  const duration = attack + sustain + release + delay;
  const length = (duration * sampleRate) | 0;

  if (length <= 0) return;

  const buffer = zzfxX.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let f = startFrequency;
  let t = 0;
  let tm = 0;
  let j = 1;
  let r = 0;
  let c = 0;
  let s = 0;
  let d = 1;
  const attackTime = attack * sampleRate;
  const sustainTime = (attack + sustain) * sampleRate;
  const releaseTime = (attack + sustain + release) * sampleRate;
  const decayTime = decay * sampleRate;

  for (let i = 0; i < length; i++) {
    // Apply envelope
    if (i < attackTime) {
      d = i / attackTime;
    } else if (i < decayTime + attackTime) {
      d = 1 - (1 - sustainVolume) * ((i - attackTime) / decayTime);
    } else if (i < sustainTime) {
      d = sustainVolume;
    } else if (i < releaseTime) {
      d = sustainVolume * (1 - (i - sustainTime) / (release * sampleRate));
    } else {
      d = 0;
    }

    // Apply slide
    f += startSlide + deltaSlide;

    // Apply pitch jump
    if (pitchJump && ++j > pitchJumpTime * sampleRate) {
      f += pitchJump;
      j = 0;
    }

    // Apply repeat
    if (repeatTime && ++r > repeatTime * sampleRate) {
      f = startFrequency;
      r = 0;
    }

    // Oscillator
    t += f * PI2 / sampleRate;
    tm += (f + modulation * noise) * PI2 / sampleRate;

    // Generate waveform
    let sample = 0;
    if (shape === 0) {
      sample = Math.sin(t); // Sine
    } else if (shape === 1) {
      sample = Math.sin(t) > 0 ? 1 : -1; // Square
    } else if (shape === 2) {
      sample = (t / PI2) % 1 * 2 - 1; // Sawtooth
    } else if (shape === 3) {
      sample = 1 - Math.abs((t / PI2) % 1 * 2 - 1) * 2; // Triangle
    } else if (shape === 4) {
      // Noise
      sample = Math.random() * 2 - 1;
    }

    // Apply shape curve
    if (shapeCurve !== 1) {
      sample = Math.sign(sample) * Math.pow(Math.abs(sample), shapeCurve);
    }

    // Apply noise
    if (noise) {
      sample += noise * (Math.random() * 2 - 1);
    }

    // Apply tremolo
    if (tremolo) {
      sample *= 1 - tremolo * (0.5 + 0.5 * Math.sin(PI2 * i / sampleRate / 0.02));
    }

    // Apply bit crush
    if (bitCrush) {
      const bits = Math.pow(2, bitCrush);
      sample = Math.round(sample * bits) / bits;
    }

    // Apply filter
    if (filter) {
      c += (sample - s) * filter;
      s += c;
      c *= 0.99 - filter * 0.4;
      sample = s;
    }

    // Apply delay
    if (i < delay * sampleRate) {
      sample = 0;
    }

    // Apply volume and envelope
    data[i] = sample * d * volume * getZzfxV();
  }

  const source = zzfxX.createBufferSource();
  source.buffer = buffer;
  source.connect(zzfxX.destination);
  source.start();
  return source;
}

// Sound presets with normalized volumes for consistent perceived loudness
// Base volume is the target perceptual level, normalizeVolume adjusts for freq/shape

const BASE_VOL = 0.5; // Target perceptual volume (before master volume scaling)

// Satisfying click - soft, warm tap
function playClick() {
  if (!isSoundEnabled()) return;
  const freq = 400, shape = 3; // Triangle wave, warm tone
  zzfx(normalizeVolume(BASE_VOL * 0.7, freq, shape), 0, freq, 0, 0.015, 0.035, shape, 1, 0, 0, 0, 0, 0, 0, 0, 0);
}

// Button press - deeper, more tactile, consistent
function playButtonPress() {
  if (!isSoundEnabled()) return;
  const freq = 420, shape = 1;
  zzfx(normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0.01, 0.03, 0.08, shape, 0.3, -20, 0, 0, 0, 0, 0.15, 0, 8);
}

// Hover - subtle soft tick with slight variation
function playHover() {
  if (!isSoundEnabled()) return;
  const freq = 500 + Math.random() * 100, shape = 3; // 500-600 Hz, triangle wave
  zzfx(normalizeVolume(BASE_VOL * 0.6, freq, shape), 0.05, freq, 0, 0.015, 0.03, shape, 1, 0, 0, 0, 0, 0, 0, 0, 0);
}

// Card hover - clean sweep with subtle pitch rise
function playCardHover() {
  if (!isSoundEnabled()) return;
  const freq = 350 + Math.random() * 30, shape = 0;
  zzfx(normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0, 0.03, 0.06, shape, 1, 0, 0, 80, 0.02, 0, 0, 0, 0);
}

// Toggle on - pleasant two-tone chirp
function playToggleOn() {
  if (!isSoundEnabled()) return;
  const freq = 280, shape = 0; // Sine wave, warm low tone
  zzfx(normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0, 0.04, 0.08, shape, 1, 0, 0, 180, 0.025, 0, 0, 0, 0);
}

// Toggle off - descending two-tone chirp
function playToggleOff() {
  if (!isSoundEnabled()) return;
  const freq = 380, shape = 0; // Sine wave, starts higher then drops
  zzfx(normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0, 0.04, 0.08, shape, 1, 0, 0, -120, 0.025, 0, 0, 0, 0);
}

// Accordion open - clean rising two-tone
function playAccordionOpen() {
  if (!isSoundEnabled()) return;
  const freq = 300, shape = 0;
  zzfx(normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0, 0.03, 0.05, shape, 1, 0, 0, 150, 0.03, 0, 0, 0, 0);
}

// Accordion close - clean falling two-tone
function playAccordionClose() {
  if (!isSoundEnabled()) return;
  const freq = 450, shape = 0;
  zzfx(normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0, 0.03, 0.05, shape, 1, 0, 0, -150, 0.03, 0, 0, 0, 0);
}

// Warp - retro teleport/transition sound for navigating home
function playWarp() {
  if (!isSoundEnabled()) return;
  const freq = 220, shape = 0; // Sine wave base
  // Rising sweep with pitch jump for that classic warp feel
  zzfx(normalizeVolume(BASE_VOL * 0.8, freq, shape), 0, freq, 0.02, 0.08, 0.15, shape, 1, 50, 0, 200, 0.04, 0, 0, 0, 4);
}

// Volume state management
const SOUND_STORAGE_KEY = 'flatland-sound-volume';

function isSoundEnabled(): boolean {
  return currentVolumeLevel > 0;
}

function getVolumeLevel(): VolumeLevel {
  return currentVolumeLevel;
}

function setVolumeLevel(level: VolumeLevel): void {
  currentVolumeLevel = level;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SOUND_STORAGE_KEY, String(level));
  }

  // Initialize audio on first non-mute
  if (level > 0 && !zzfxLoaded) {
    initAudio();
  }
}

// Check if user has ever set a volume preference
function hasVolumePreference(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(SOUND_STORAGE_KEY) !== null ||
         localStorage.getItem('flatland-sound-enabled') !== null;
}

function loadVolumeLevel(): VolumeLevel {
  if (typeof localStorage === 'undefined') return 0;

  // Check new storage key first
  const stored = localStorage.getItem(SOUND_STORAGE_KEY);
  if (stored !== null) {
    const level = parseInt(stored, 10);
    if (level >= 0 && level <= 3) {
      return level as VolumeLevel;
    }
  }

  // Migration: check old boolean storage key
  const oldStored = localStorage.getItem('flatland-sound-enabled');
  if (oldStored === 'true') {
    // Was enabled, migrate to medium (not max, for smoother experience)
    localStorage.removeItem('flatland-sound-enabled');
    return 2;
  } else if (oldStored === 'false') {
    // Was disabled, migrate to mute
    localStorage.removeItem('flatland-sound-enabled');
    return 0;
  }

  // No preference stored - default to muted
  return 0;
}

// Cycle through volume levels: mute -> low -> medium -> high -> mute
function cycleVolumeLevel(): VolumeLevel {
  const nextLevel = ((currentVolumeLevel + 1) % 4) as VolumeLevel;
  setVolumeLevel(nextLevel);
  return nextLevel;
}

// Legacy toggle function for backwards compatibility
function toggleSound(): boolean {
  if (isSoundEnabled()) {
    setVolumeLevel(0);
    return false;
  } else {
    setVolumeLevel(3);
    initAudio().then(() => {
      playToggleOn();
    });
    return true;
  }
}

// Initialize volume level from storage
function initVolumeLevel(): void {
  currentVolumeLevel = loadVolumeLevel();
}

// Track which elements we're currently hovering to avoid repeat sounds
const hoveredElements = new WeakSet<Element>();

// Sound type definitions for data-sound attribute
type SoundType = 'card' | 'button' | 'hover' | 'click' | 'accordion' | 'warp' | 'none';

// Find the sound element and its type
function findSoundElement(target: HTMLElement): { element: Element; sound: SoundType } | null {
  // First check for explicit data-sound attribute
  const soundElement = target.closest('[data-sound]');
  if (soundElement) {
    const sound = soundElement.getAttribute('data-sound') as SoundType;
    if (sound === 'none') return null;
    return { element: soundElement, sound };
  }

  // Fallback: infer sound from element type for non-decorated elements
  const button = target.closest('button');
  if (button) return { element: button, sound: 'button' };

  const link = target.closest('a[href]');
  if (link) return { element: link, sound: 'hover' };

  return null;
}

// Track if event handlers have been set up (prevent duplicate listeners)
let soundEventsSetup = false;

// Event handler helpers - attach to elements
function setupSoundEvents() {
  // Wait for DOM to be ready
  if (typeof document === 'undefined') return;

  // Prevent duplicate event listeners on repeated calls (view transitions, HMR)
  if (soundEventsSetup) return;
  soundEventsSetup = true;

  // Initialize audio context on first user interaction
  // Always init so UI can show correct state (muted vs disabled)
  const initOnInteraction = async () => {
    await initAudio();
    document.removeEventListener('click', initOnInteraction);
    document.removeEventListener('keydown', initOnInteraction);
  };
  document.addEventListener('click', initOnInteraction, { once: true });
  document.addEventListener('keydown', initOnInteraction, { once: true });

  // Debounce hover sounds to avoid rapid firing
  let lastHoverTime = 0;
  const HOVER_DEBOUNCE = 80; // ms

  // Hover sounds using data-sound attribute
  document.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    const result = findSoundElement(target);
    if (!result) return;

    const { element, sound } = result;

    // Skip if we're already hovering this element
    if (hoveredElements.has(element)) return;
    hoveredElements.add(element);

    // Debounce
    const now = Date.now();
    if (now - lastHoverTime < HOVER_DEBOUNCE) return;
    lastHoverTime = now;

    // Play appropriate hover sound
    // Note: 'click' type intentionally excluded - only plays on click, not hover
    if (sound === 'card') {
      playCardHover();
    } else if (sound === 'hover' || sound === 'button') {
      playHover();
    }
  });

  // Clear hover state when mouse leaves
  document.addEventListener('mouseout', (e) => {
    const target = e.target as HTMLElement;
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!target) return;

    const result = findSoundElement(target);
    if (!result) return;

    const { element } = result;

    // Check if we're moving to another element within the same interactive parent
    if (relatedTarget && element.contains(relatedTarget)) {
      return;
    }

    hoveredElements.delete(element);
  });

  // Click sounds
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    // Sidebar accordion (details/summary)
    const summary = target.closest('summary');
    if (summary) {
      const details = summary.closest('details');
      if (details) {
        // Check current state (before toggle happens)
        if (details.open) {
          playAccordionClose();
        } else {
          playAccordionOpen();
        }
        return;
      }
    }

    const result = findSoundElement(target);
    if (!result) return;

    const { sound } = result;

    // Play appropriate click sound
    if (sound === 'warp') {
      playWarp();
    } else if (sound === 'button') {
      playButtonPress();
    } else if (sound === 'click' || sound === 'hover' || sound === 'card') {
      playClick();
    }
  }, true);

}

// Track mouse position for view transition handling
let lastMouseX = 0;
let lastMouseY = 0;

// Re-setup after view transitions (SPA navigation)
function setupViewTransitionSupport() {
  if (typeof document === 'undefined') return;

  // Track mouse position so we know what's under cursor after page swap
  document.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }, { passive: true });

  // After view transition swaps DOM, pre-populate hoveredElements with
  // whatever is now under the cursor. This prevents spurious hover sounds
  // when new elements appear under the cursor during navigation.
  document.addEventListener('astro:after-swap', () => {
    const elementsUnderCursor = document.elementsFromPoint(lastMouseX, lastMouseY);
    for (const el of elementsUnderCursor) {
      const result = findSoundElement(el as HTMLElement);
      if (result) {
        hoveredElements.add(result.element);
      }
    }
  });
}

// Export for use in components
export {
  initAudio,
  isAudioInitialized,
  onAudioStateChange,
  isSoundEnabled,
  hasVolumePreference,
  getVolumeLevel,
  setVolumeLevel,
  cycleVolumeLevel,
  initVolumeLevel,
  toggleSound,
  playClick,
  playButtonPress,
  playHover,
  playCardHover,
  playToggleOn,
  playToggleOff,
  playAccordionOpen,
  playAccordionClose,
  playWarp,
  setupSoundEvents,
  setupViewTransitionSupport,
};
