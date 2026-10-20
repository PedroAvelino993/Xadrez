// Small synthesized sound set (Web Audio API) — no audio files, no autoplay:
// the AudioContext is only created after the first user gesture.
import { getState } from "../storage/store";

export type SoundName = "move" | "capture" | "check" | "mate" | "promote" | "castle" | "gameEnd" | "correct" | "wrong" | "illegal" | "notify";

let ctx: AudioContext | null = null;
let unlocked = false;

function unlock() {
  unlocked = true;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === "suspended") void ctx.resume();
}
if (typeof window !== "undefined") {
  for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, unlock, { passive: true });
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  return b;
}

/** Wooden "tock": filtered noise burst + short low sine body. */
function knock(c: AudioContext, out: AudioNode, t: number, pitch: number, gain: number) {
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c, 0.06);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = pitch * 6;
  bp.Q.value = 1.4;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  n.connect(bp).connect(g).connect(out);
  n.start(t);
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(pitch * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(pitch, t + 0.05);
  const og = c.createGain();
  og.gain.setValueAtTime(gain * 0.7, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.1);
}

function tone(c: AudioContext, out: AudioNode, t: number, freq: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function play(name: SoundName) {
  const s = getState().settings;
  if (!s.soundEnabled || !unlocked || !ctx) return;
  const puzzleSound = name === "correct" || name === "wrong";
  if (puzzleSound ? !s.soundPuzzle : !s.soundBoard) return;
  const c = ctx;
  const out = c.createGain();
  out.gain.value = Math.max(0, Math.min(1, s.volume));
  out.connect(c.destination);
  const t = c.currentTime + 0.005;
  switch (name) {
    case "move":
      knock(c, out, t, 180, 0.55);
      break;
    case "castle":
      knock(c, out, t, 180, 0.5);
      knock(c, out, t + 0.09, 165, 0.45);
      break;
    case "capture":
      knock(c, out, t, 150, 0.75);
      knock(c, out, t + 0.035, 230, 0.4);
      break;
    case "check":
      knock(c, out, t, 190, 0.55);
      tone(c, out, t + 0.02, 880, 0.16, 0.08, "triangle");
      break;
    case "promote":
      knock(c, out, t, 180, 0.5);
      tone(c, out, t + 0.03, 660, 0.12, 0.07, "triangle");
      tone(c, out, t + 0.1, 990, 0.18, 0.07, "triangle");
      break;
    case "mate":
      knock(c, out, t, 160, 0.7);
      tone(c, out, t + 0.05, 523, 0.5, 0.08, "triangle");
      tone(c, out, t + 0.05, 659, 0.5, 0.06, "triangle");
      tone(c, out, t + 0.05, 784, 0.6, 0.06, "triangle");
      break;
    case "gameEnd":
      tone(c, out, t, 587, 0.25, 0.07, "triangle");
      tone(c, out, t + 0.14, 784, 0.4, 0.07, "triangle");
      break;
    case "correct":
      tone(c, out, t, 784, 0.14, 0.08, "triangle");
      tone(c, out, t + 0.09, 1175, 0.22, 0.08, "triangle");
      break;
    case "wrong":
      tone(c, out, t, 220, 0.22, 0.09, "square");
      tone(c, out, t + 0.1, 185, 0.26, 0.07, "square");
      break;
    case "illegal":
      tone(c, out, t, 140, 0.12, 0.06, "square");
      break;
    case "notify":
      tone(c, out, t, 988, 0.15, 0.06, "sine");
      break;
  }
}

/** Picks the right sound for a move given its SAN. */
export function playForSan(san: string, promotion?: boolean) {
  if (san.includes("#")) play("mate");
  else if (san.includes("+")) play("check");
  else if (promotion || san.includes("=")) play("promote");
  else if (san.startsWith("O-O")) play("castle");
  else if (san.includes("x")) play("capture");
  else play("move");
}
