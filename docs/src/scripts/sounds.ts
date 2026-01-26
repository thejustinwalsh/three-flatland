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
const zzfxV = 0.08; // Master volume
let zzfxX: AudioContext | null = null;

// Lazy-load ZzFX audio context
async function initAudio(): Promise<boolean> {
  if (zzfxLoaded) return true;

  try {
    // Create audio context on first user interaction
    zzfxX = new AudioContext();
    zzfxLoaded = true;
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
    data[i] = sample * d * volume * zzfxV;
  }

  const source = zzfxX.createBufferSource();
  source.buffer = buffer;
  source.connect(zzfxX.destination);
  source.start();
  return source;
}

// Sound presets with subtle randomization
// Each sound has base parameters that get slight random variation

// Satisfying click - consistent sound every time
function playClick() {
  if (!isSoundEnabled()) return;
  zzfx(0.05, 0, 650, 0, 0.02, 0.05, 1, 0.5, 0, 0, 0, 0, 0, 0.1, 0, 8);
}

// Button press - deeper, more tactile, consistent
function playButtonPress() {
  if (!isSoundEnabled()) return;
  zzfx(0.08, 0, 420, 0.01, 0.03, 0.08, 1, 0.3, -20, 0, 0, 0, 0, 0.15, 0, 8);
}

// Hover - subtle high-pitched tick
function playHover() {
  if (!isSoundEnabled()) return;
  const pitch = 1200 + Math.random() * 200; // 1200-1400 Hz
  zzfx(0.04, 0.05, pitch, 0, 0.01, 0.02, 1, 0.8, 0, 0, 0, 0, 0, 0, 0, 12);
}

// Card hover - clean sweep with subtle pitch rise
function playCardHover() {
  if (!isSoundEnabled()) return;
  const pitch = 350 + Math.random() * 30;
  zzfx(0.08, 0, pitch, 0, 0.03, 0.06, 0, 1, 0, 0, 80, 0.02, 0, 0, 0, 0);
}

// Toggle on - rising blip
function playToggleOn() {
  if (!isSoundEnabled()) return;
  zzfx(0.08, 0, 500, 0, 0.02, 0.06, 1, 0.5, 100, 0, 0, 0, 0, 0.1, 0, 8);
}

// Toggle off - falling blip
function playToggleOff() {
  if (!isSoundEnabled()) return;
  zzfx(0.08, 0, 600, 0, 0.02, 0.06, 1, 0.5, -100, 0, 0, 0, 0, 0.1, 0, 8);
}

// Accordion open - clean rising two-tone
function playAccordionOpen() {
  if (!isSoundEnabled()) return;
  zzfx(0.05, 0, 300, 0, 0.03, 0.05, 0, 1, 0, 0, 150, 0.03, 0, 0, 0, 0);
}

// Accordion close - clean falling two-tone
function playAccordionClose() {
  if (!isSoundEnabled()) return;
  zzfx(0.05, 0, 450, 0, 0.03, 0.05, 0, 1, 0, 0, -150, 0.03, 0, 0, 0, 0);
}

// Mute/unmute state
const SOUND_STORAGE_KEY = 'flatland-sound-enabled';

function isSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const stored = localStorage.getItem(SOUND_STORAGE_KEY);
  // Default to muted - user must opt-in
  return stored === 'true';
}

function setSoundEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));

  // Initialize audio on first enable
  if (enabled && !zzfxLoaded) {
    initAudio();
  }
}

function toggleSound(): boolean {
  const newState = !isSoundEnabled();
  setSoundEnabled(newState);

  // Play feedback sound when enabling
  if (newState) {
    initAudio().then(() => {
      playToggleOn();
    });
  }

  return newState;
}

// Track which elements we're currently hovering to avoid repeat sounds
const hoveredElements = new WeakSet<Element>();

// Sound type definitions for data-sound attribute
type SoundType = 'card' | 'button' | 'hover' | 'click' | 'accordion' | 'none';

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

// Event handler helpers - attach to elements
function setupSoundEvents() {
  // Wait for DOM to be ready
  if (typeof document === 'undefined') return;

  // Initialize audio context on first user interaction if sounds are enabled
  const initOnInteraction = async () => {
    if (isSoundEnabled()) {
      await initAudio();
    }
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
    if (sound === 'card') {
      playCardHover();
    } else if (sound === 'hover' || sound === 'button' || sound === 'click') {
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
    if (sound === 'button') {
      playButtonPress();
    } else if (sound === 'click' || sound === 'hover' || sound === 'card') {
      playClick();
    }
  }, true);

}

// Re-setup after view transitions (SPA navigation)
function setupViewTransitionSupport() {
  if (typeof document === 'undefined') return;

  // Listen for Astro's page swap event (view transitions)
  document.addEventListener('astro:page-load', () => {
    // Clear hover state on navigation
    // WeakSet entries will be garbage collected naturally
  });

}

// Export for use in components
export {
  initAudio,
  isSoundEnabled,
  setSoundEnabled,
  toggleSound,
  playClick,
  playButtonPress,
  playHover,
  playCardHover,
  playToggleOn,
  playToggleOff,
  playAccordionOpen,
  playAccordionClose,
  setupSoundEvents,
  setupViewTransitionSupport,
};
