import { describe, expect, it, vi } from 'vitest';
import {
  AUDIO,
  AudioManager,
  clearPitch,
  type AudioContextLike,
  type AudioParamLike,
} from '../../src/audio';

/** A mock AudioContext that records every oscillator's start frequency. */
function mockContext(state = 'suspended') {
  const tones: { hz: number; type: string; start: number }[] = [];
  const param = (): AudioParamLike & { calls: number[] } => {
    const calls: number[] = [];
    return {
      value: 0,
      calls,
      setValueAtTime: (v) => calls.push(v),
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    };
  };
  const ctx = {
    currentTime: 10,
    state,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createOscillator() {
      const frequency = param();
      const osc = {
        type: 'sine',
        frequency,
        connect: () => {},
        start: (t: number) => tones.push({ hz: frequency.calls[0]!, type: osc.type, start: t }),
        stop: () => {},
      };
      return osc;
    },
    createGain: () => ({ gain: param(), connect: () => {} }),
  } satisfies AudioContextLike;
  return { ctx, tones };
}

describe('clearPitch', () => {
  it('rises with the combo and stops after an octave', () => {
    expect(clearPitch(1)).toBeCloseTo(AUDIO.clearRootHz);
    expect(clearPitch(0)).toBeCloseTo(AUDIO.clearRootHz);
    expect(clearPitch(2)).toBeGreaterThan(clearPitch(1));
    expect(clearPitch(5)).toBeGreaterThan(clearPitch(4));
    expect(clearPitch(7)).toBeCloseTo(AUDIO.clearRootHz * 2); // 6 steps × 2 semitones
    expect(clearPitch(30)).toBeCloseTo(clearPitch(7));
  });
});

describe('AudioManager', () => {
  it('is silent until unlocked by a user gesture', () => {
    const { ctx, tones } = mockContext();
    const create = vi.fn(() => ctx);
    const audio = new AudioManager({ muted: false, createContext: create });
    audio.play({ kind: 'place' });
    expect(create).not.toHaveBeenCalled();
    expect(tones).toHaveLength(0);

    audio.unlock();
    expect(create).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalled();
    audio.play({ kind: 'place' });
    expect(tones).toHaveLength(1);

    audio.unlock(); // idempotent
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not resume a running context', () => {
    const { ctx } = mockContext('running');
    new AudioManager({ muted: false, createContext: () => ctx }).unlock();
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('plays the clear sound at the combo pitch, one tone per line up to 4', () => {
    const { ctx, tones } = mockContext();
    const audio = new AudioManager({ muted: false, createContext: () => ctx });
    audio.unlock();
    audio.play({ kind: 'clear', lines: 1, combo: 1 });
    expect(tones.map((t) => t.hz)).toEqual([clearPitch(1)]);

    tones.length = 0;
    audio.play({ kind: 'clear', lines: 3, combo: 4 });
    expect(tones).toHaveLength(3);
    expect(tones[0]!.hz).toBeCloseTo(clearPitch(4));
    expect(tones[1]!.hz).toBeGreaterThan(tones[0]!.hz);

    tones.length = 0;
    audio.play({ kind: 'clear', lines: 6, combo: 1 });
    expect(tones).toHaveLength(4);
  });

  it('has distinct sounds for board clear and game over', () => {
    const { ctx, tones } = mockContext();
    const audio = new AudioManager({ muted: false, createContext: () => ctx });
    audio.unlock();
    audio.play({ kind: 'allClear' });
    const sting = tones.map((t) => t.hz);
    expect(sting.length).toBeGreaterThan(3);
    expect(sting).toEqual([...sting].sort((a, b) => a - b)); // rising
    tones.length = 0;
    audio.play({ kind: 'gameOver' });
    const sad = tones.map((t) => t.hz);
    expect(sad).toEqual([...sad].sort((a, b) => b - a)); // falling
  });

  it('plays nothing while muted, and resumes when unmuted', () => {
    const { ctx, tones } = mockContext();
    const audio = new AudioManager({ muted: true, createContext: () => ctx });
    audio.unlock();
    audio.play({ kind: 'clear', lines: 2, combo: 2 });
    expect(tones).toHaveLength(0);
    audio.muted = false;
    audio.play({ kind: 'place' });
    expect(tones).toHaveLength(1);
  });

  it('stays silent without Web Audio', () => {
    const audio = new AudioManager({ muted: false, createContext: () => null });
    audio.unlock();
    expect(() => audio.play({ kind: 'place' })).not.toThrow();
    const throwing = new AudioManager({
      muted: false,
      createContext: () => {
        throw new Error('not allowed');
      },
    });
    expect(() => throwing.unlock()).not.toThrow();
    expect(() => throwing.play({ kind: 'place' })).not.toThrow();
  });
});
