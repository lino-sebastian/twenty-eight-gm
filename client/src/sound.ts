/**
 * Game sounds, synthesised with the Web Audio API (no audio files needed).
 * Browsers only allow audio after the user has interacted with the page, so the
 * context is created lazily and resumed on the first click or tap.
 */

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let enabled = readEnabled();

function readEnabled(): boolean {
  try {
    return localStorage.getItem('t28.sound') !== 'off';
  } catch {
    return true;
  }
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem('t28.sound', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  if (on) audio();
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

// Unlock audio on the first interaction.
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function noiseBurst(
  ac: AudioContext,
  at: number,
  dur: number,
  filter: { type: BiquadFilterType; from: number; to?: number; q?: number },
  peak: number,
) {
  const src = ac.createBufferSource();
  src.buffer = noise;
  const f = ac.createBiquadFilter();
  f.type = filter.type;
  f.Q.value = filter.q ?? 1;
  f.frequency.setValueAtTime(filter.from, at);
  if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, at + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.012, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(at, Math.random() * 0.5, dur + 0.05);
}

/** A card flicked off the deck and landing. */
export function playDealFlick(delayMs = 0) {
  const ac = audio();
  if (!ac) return;
  const at = ac.currentTime + delayMs / 1000;
  noiseBurst(ac, at, 0.07, { type: 'bandpass', from: 2400 + Math.random() * 800, to: 1200, q: 0.8 }, 0.35);
  noiseBurst(ac, at + 0.05, 0.05, { type: 'lowpass', from: 900, q: 0.7 }, 0.25);
}

/** The sound of a whole deal: one flick per card. */
export function playDeal(cards: number, stepMs: number) {
  for (let i = 0; i < cards; i++) playDealFlick(i * stepMs + 60);
}

/** A card placed on the table. */
export function playCardDown() {
  const ac = audio();
  if (!ac) return;
  const at = ac.currentTime;
  noiseBurst(ac, at, 0.09, { type: 'lowpass', from: 1600, to: 500, q: 0.6 }, 0.45);
}

/** A sword swing and ring, for a trump cutting a trick. */
export function playSwordSwing() {
  const ac = audio();
  if (!ac) return;
  const at = ac.currentTime;
  // Whoosh: noise swept up through a bandpass filter.
  noiseBurst(ac, at, 0.32, { type: 'bandpass', from: 350, to: 4500, q: 1.6 }, 0.6);
  // Blade ring: a few inharmonic partials with a quick attack and a long fade.
  const ring = at + 0.22;
  for (const [freq, vol] of [
    [2793, 0.12],
    [3951, 0.08],
    [5274, 0.05],
    [6644, 0.03],
  ] as const) {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, ring);
    o.frequency.exponentialRampToValueAtTime(freq * 0.995, ring + 0.9);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ring);
    g.gain.exponentialRampToValueAtTime(vol, ring + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ring + 0.9);
    o.connect(g).connect(ac.destination);
    o.start(ring);
    o.stop(ring + 0.95);
  }
  // Metallic scrape at the moment of impact.
  noiseBurst(ac, ring, 0.12, { type: 'highpass', from: 5000, q: 0.5 }, 0.25);
}
