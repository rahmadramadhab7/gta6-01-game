// Save and load: the player's position, cash, health, day and clock, kept in
// localStorage so a visit can be continued. Nothing leaves the browser.
import { SAVE_KEY, START } from './config.js';

/** The save shape, with defaults for a fresh game. */
export function defaultSave() {
  return {
    x: START.spawn.x,
    z: START.spawn.z,
    heading: START.spawn.heading,
    cash: START.cash,
    health: START.health,
    wanted: START.wanted,
    day: 1,
    minutes: 17 * 60 + 42,
    objective: START.objective,
    vehicles: null,
    /** Mission progress: the next mission to play, and the ones already done. */
    missionIndex: 0,
    missionsDone: [],
    /** Side activities: collected Shore Coin indices, jumped ramp indices. */
    coins: [],
    stunts: [],
  };
}

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return { ...defaultSave(), ...parsed };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: a fresh game then just starts over.
  }
}
