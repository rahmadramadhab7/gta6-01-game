// Sound, synthesised live with WebAudio: no audio files, nothing fetched. A soft
// synth pad under the sunset, footsteps while walking, and a chime for pickups.
// Night 5 adds a speed-following engine hum, a two-tone police siren, a punch
// thud, a rising coin pickup, and a stunt whoosh — all of it synthesised, all
// of it wrapped in try/catch: the game must keep running with no audio at all
// (a headless screenshot, a missing AudioContext), so every sound fails silent.
import { STEP } from './config.js';

export function createAudio() {
  let context = null;
  let master = null;
  let padOscillators = [];
  let muted = false;
  let stepTimer = 0;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;

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

  /** A short burst of filtered noise: punch thud, stunt whoosh. */
  function noiseBurst(duration, volume, filterFrequency, filterType = 'lowpass') {
    if (!context || muted) return;
    try {
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = filterFrequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
      source.stop(context.currentTime + duration);
    } catch {
      // Audio is decoration: a failed burst never stops the game.
    }
  }

  function ensureEngine() {
    if (engineOsc || !context) return;
    try {
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    } catch {
      engineOsc = null;
      engineGain = null;
    }
  }

  function ensureSiren() {
    if (sirenOsc || !context) return;
    try {
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 660;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      sirenOsc = null;
      sirenGain = null;
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
    /** A punch landing: a short low thud of filtered noise. */
    punch() { noiseBurst(0.12, 0.35, 300); },
    /** A Shore Coin picked up: two notes rising. */
    coin() {
      blip(988, 0.09, 'sine', 0.16);
      window.setTimeout(() => blip(1319, 0.16, 'sine', 0.16), 80);
    },
    /** A stunt jump: a half-second whoosh of swept noise. */
    stunt() { noiseBurst(0.5, 0.22, 1400, 'bandpass'); },
    /**
     * Per-frame audio: the engine hum follows the driven car's speed (silent
     * on foot), and the siren wails two alternating notes while the wanted
     * level is up and a police unit is near. No context, no sound — never an error.
     */
    stepAudio(driving, speed, wanted, nearestPolice) {
      if (!context || muted) {
        try {
          if (engineGain) engineGain.gain.value = 0;
          if (sirenGain) sirenGain.gain.value = 0;
        } catch { /* silent */ }
        return;
      }
      try {
        if (driving) {
          ensureEngine();
          if (engineOsc && engineGain) {
            engineOsc.frequency.value = 50 + Math.abs(speed) * 3.2;
            engineGain.gain.value = 0.05 + Math.min(0.06, Math.abs(speed) * 0.002);
          }
        } else if (engineGain) {
          engineGain.gain.value = 0;
        }
        const sirenOn = wanted >= 1 && Number.isFinite(nearestPolice) && nearestPolice < 60;
        if (sirenOn) {
          ensureSiren();
          sirenTimer -= STEP;
          if (sirenTimer <= 0) {
            sirenTimer = 0.42;
            sirenHigh = !sirenHigh;
            if (sirenOsc) sirenOsc.frequency.value = sirenHigh ? 880 : 660;
          }
          if (sirenGain) sirenGain.gain.value = 0.045;
        } else if (sirenGain) {
          sirenGain.gain.value = 0;
        }
      } catch {
        // Audio is decoration: a failed frame never stops the game.
      }
    },
    dispose() {
      for (const osc of padOscillators) {
        try { osc.stop(); } catch { /* already stopped */ }
      }
      padOscillators = [];
      try { if (engineOsc) engineOsc.stop(); } catch { /* already stopped */ }
      try { if (sirenOsc) sirenOsc.stop(); } catch { /* already stopped */ }
      engineOsc = null;
      sirenOsc = null;
      if (context) context.close();
      context = null;
    },
  };
}
