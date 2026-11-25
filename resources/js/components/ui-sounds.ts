export type UiSound = "fold" | "unfold" | "drop" | "tick" | "pop" | "success" | "error";

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio() {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    context = new Ctx();
  }
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context;
}

function noiseBuffer(ctx: AudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** A burst of filtered noise. */
function burst(ctx: AudioContext, out: AudioNode, at: number, length: number, { type = "bandpass", from = 2000, to = from, q = 0.9, level = 0.5 }: { type?: BiquadFilterType; from?: number; to?: number; q?: number; level?: number }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + Math.min(0.012, length / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter).connect(gain).connect(out);
  src.start(at, Math.random() * 0.3, length + 0.02);
}

/** A tone that glides from one pitch to another. */
function tone(ctx: AudioContext, out: AudioNode, at: number, length: number, { type = "sine", from, to = from, level = 0.4 }: { type?: OscillatorType; from: number; to?: number; level?: number }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** Plays one sound. `volume` is 0 to 1; the default sits quietly under an interface. */
export function playSound(name: UiSound, volume = 0.5) {
  const ctx = audio();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume)) * 0.5;
  out.connect(ctx.destination);
  const t = ctx.currentTime + 0.005;
  switch (name) {
    case "fold":
      burst(ctx, out, t, 0.05, { type: "highpass", from: 2600, q: 0.7, level: 0.45 });
      burst(ctx, out, t + 0.07, 0.07, { type: "bandpass", from: 3200, to: 1800, q: 1.2, level: 0.35 });
      break;
    case "unfold":
      burst(ctx, out, t, 0.16, { type: "bandpass", from: 900, to: 2800, q: 0.8, level: 0.3 });
      break;
    case "drop":
      tone(ctx, out, t, 0.12, { from: 180, to: 70, level: 0.55 });
      burst(ctx, out, t, 0.03, { type: "lowpass", from: 1200, q: 0.5, level: 0.2 });
      break;
    case "tick":
      tone(ctx, out, t, 0.025, { type: "triangle", from: 1900, to: 1500, level: 0.25 });
      break;
    case "pop":
      tone(ctx, out, t, 0.06, { from: 620, to: 980, level: 0.3 });
      break;
    case "success":
      tone(ctx, out, t, 0.11, { from: 660, level: 0.22 });
      tone(ctx, out, t + 0.09, 0.16, { from: 990, level: 0.22 });
      break;
    case "error":
      tone(ctx, out, t, 0.12, { type: "triangle", from: 330, level: 0.25 });
      tone(ctx, out, t + 0.1, 0.18, { type: "triangle", from: 247, level: 0.25 });
      break;
  }
  window.setTimeout(() => out.disconnect(), 600);
}
