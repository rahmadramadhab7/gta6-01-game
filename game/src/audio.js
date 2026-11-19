// Sound, synthesised live with WebAudio: no audio files, nothing fetched. A soft
// synth pad under the sunset, footsteps while walking, and a chime for pickups.
// The context is created on the first user gesture, as browsers require.
import { STEP } from './config.js';

export function createAudio() {
  let context = null;
  let master = null;
  let padOscillators = [];
  let muted = false;
  let stepTimer = 0;

  function ensureContext() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      // A warm two-note pad: the city's evening hum.
      padOscillators = [110, 164.81].map((frequency) => {
        const osc = context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = frequency;
        const gain = context.createGain();
        gain.gain.value = 0.035;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        return osc;
      });
      return true;
    } catch {
      return false;
    }
  }

  function blip(frequency, duration, type, volume) {
    if (!context || muted) return;
    try {
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + duration);
    } catch {
      // Audio is decoration: a failed blip never stops the game.
    }
  }

  return {
    /** Call from any user gesture (button, key) to unlock sound. */
    unlock() { ensureContext(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
    click() { blip(660, 0.08, 'sine', 0.12); },
    chime() { blip(880, 0.25, 'sine', 0.15); blip(1320, 0.3, 'sine', 0.1); },
    /** A mission done: a rising four-note jingle, one note every 110 ms. */
    missionComplete() {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
        window.setTimeout(() => blip(frequency, 0.22, 'triangle', 0.16), i * 110);
      });
    },
    /** A mission failed: two low notes stepping down. */
    missionFail() {
      [330, 261.63, 196].forEach((frequency, i) => {
        window.setTimeout(() => blip(frequency, 0.3, 'sawtooth', 0.08), i * 160);
      });
    },
    /** Footsteps while moving: a soft tap every half stride. */
    stepFootsteps(moving, running) {
      if (!moving || !context || muted) return;
      stepTimer -= STEP;
      if (stepTimer <= 0) {
        stepTimer = running ? 0.28 : 0.42;
        blip(90 + Math.random() * 30, 0.06, 'sine', 0.06);
      }
    },
    dispose() {
      for (const osc of padOscillators) {
        try { osc.stop(); } catch { /* already stopped */ }
      }
      padOscillators = [];
      if (context) context.close();
      context = null;
    },
  };
}
