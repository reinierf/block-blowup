// src/audio.ts
// Synthesised sound effects with the Web Audio API (no audio files). The AudioContext is
// created and resumed on the first pointer event (`unlock`), which iOS requires.
// The context factory is injectable so tests can use a mock.

import type { SoundCue } from './feedback/plan';

/** The subset of AudioContext this module uses. */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}
export interface AudioParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
}
export interface OscillatorLike {
  type: string;
  frequency: AudioParamLike;
  connect(node: unknown): unknown;
  start(t: number): void;
  stop(t: number): void;
}
export interface GainLike {
  gain: AudioParamLike;
  connect(node: unknown): unknown;
}

export const AUDIO = {
  masterGain: 0.18,
  /** Clear sound root (C5); each combo step raises it by `comboStepSemitones`. */
  clearRootHz: 523.25,
  comboStepSemitones: 2,
  /** Pitch stops rising after this many steps (an octave). */
  maxComboSteps: 6,
} as const;

/** Root frequency of the clear sound for a combo streak (combo 1 = the root). */
export function clearPitch(combo: number): number {
  const steps = Math.min(AUDIO.maxComboSteps, Math.max(0, combo - 1));
  return AUDIO.clearRootHz * 2 ** ((steps * AUDIO.comboStepSemitones) / 12);
}

const semis = (hz: number, n: number) => hz * 2 ** (n / 12);

export class AudioManager {
  muted: boolean;
  private ctx: AudioContextLike | null = null;
  private readonly createContext: () => AudioContextLike | null;

  constructor(opts: { muted: boolean; createContext?: () => AudioContextLike | null }) {
    this.muted = opts.muted;
    this.createContext = opts.createContext ?? defaultContext;
  }

  /** Call from a pointer event handler: creates/resumes the context (needed on iOS). */
  unlock(): void {
    try {
      this.ctx ??= this.createContext();
      if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null; // no Web Audio: stay silent
    }
  }

  play(cue: SoundCue): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    switch (cue.kind) {
      case 'place':
        this.tone(180, t, 0.05, 'triangle', 0.6);
        break;
      case 'clear': {
        const root = clearPitch(cue.combo);
        // One more chord tone per extra line: root, third, fifth, octave.
        const notes = [0, 4, 7, 12].slice(0, Math.min(4, Math.max(1, cue.lines)));
        notes.forEach((n, i) => this.tone(semis(root, n), t + i * 0.045, 0.22, 'sine', 0.8));
        break;
      }
      case 'allClear':
        [0, 4, 7, 12, 16].forEach((n, i) =>
          this.tone(semis(AUDIO.clearRootHz, n), t + 0.12 + i * 0.07, 0.35, 'triangle', 0.7),
        );
        break;
      case 'gameOver':
        [0, -3, -7, -12].forEach((n, i) =>
          this.tone(semis(392, n), t + i * 0.16, 0.3, 'sine', 0.6),
        );
        break;
    }
  }

  private tone(hz: number, start: number, dur: number, type: string, level: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, start);
    const peak = AUDIO.masterGain * level;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
}

function defaultContext(): AudioContextLike | null {
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? (new Ctor() as unknown as AudioContextLike) : null;
}
