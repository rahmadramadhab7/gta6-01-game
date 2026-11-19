// Missions — the Vice Shores story chain. Five jobs in order for Marisol Vega,
// from her first stolen car to the Shores Heist, each with a briefing from a
// contact, a 3D marker in the world, a HUD objective, a timer where the job
// demands one, and a cash reward. A mission fails if Marisol is BUSTED, if its
// timer runs out, or if its target escapes; a failed mission can be retried
// from the mission panel (J) or with R, and completed missions stay done.
import * as THREE from 'three';

/** The chain, in order. `at` is the marker for the current phase; `timeLimit`
 *  is seconds for the whole mission, 0 for no limit. */
export const MISSIONS = [
  {
    id: 'm1',
    name: 'First Wheels',
    contact: 'Rico',
    reward: 800,
    timeLimit: 0,
    briefing: 'Rico: "Fresh out, Marisol? Prove those hands still work. Boost any car and bring it to the Marina Ave drop."',
    objective: 'Steal a car, then drive it to the Marina Ave drop',
    phases: [
      { kind: 'steal', text: 'Steal a car (E next to one)' },
      { kind: 'reach', at: { x: 69, z: 23 }, radius: 6, needCar: true, text: 'Drive the stolen car to the Marina Ave drop' },
    ],
  },
  {
    id: 'm2',
    name: 'Package Run',
    contact: 'Dahlia',
    reward: 1500,
    timeLimit: 120,
    briefing: 'Dahlia: "A parcel is waiting on 23rd Ave. Pick it up on foot and run it to the north drop — the buyer does not wait."',
    objective: 'Pick up the package, then deliver it before the timer runs out',
    phases: [
      { kind: 'pickup', at: { x: -23, z: 69 }, radius: 4, needCar: false, text: 'Pick up the package on foot (23rd Ave)' },
      { kind: 'reach', at: { x: 69, z: -23 }, radius: 6, needCar: false, text: 'Deliver the package to the north drop' },
    ],
  },
  {
    id: 'm3',
    name: 'Tail Chase',
    contact: 'Rico',
    reward: 2000,
    timeLimit: 0,
    briefing: 'Rico: "A gold Coral Coupe is running errands for the wrong people. Tail it — close enough to see, far enough not to spook it."',
    objective: 'Tail the gold Coral Coupe without spooking it',
    phases: [
      { kind: 'tail', followSeconds: 20, near: 45, spook: 7, escape: 60, escapeSeconds: 8, text: 'Stay within sight of the gold car — not too close' },
    ],
  },
  {
    id: 'm4',
    name: 'Heat Escape',
    contact: 'Dahlia',
    reward: 2500,
    timeLimit: 0,
    briefing: 'Dahlia: "You stirred the hive, Marisol — three stars and climbing. Lose them and get to my beach safehouse. Nobody looks for you there."',
    objective: 'Reach the beach safehouse and lose the heat',
    phases: [
      { kind: 'reach', at: { x: -140, z: -69 }, radius: 6, needCar: false, text: 'Reach the beach safehouse' },
    ],
  },
  {
    id: 'm5',
    name: 'Shores Heist',
    contact: 'Rico',
    reward: 6000,
    timeLimit: 240,
    briefing: 'Rico: "The big one. A lockbox downtown, a fast car waiting beside it, and the pier at the end. Grab it, run, and do not get caught."',
    objective: 'Grab the lockbox downtown, then run it to the Marina Pier',
    phases: [
      { kind: 'dwell', at: { x: 46, z: -23 }, radius: 4, dwellSeconds: 3, needCar: false, text: 'Grab the lockbox at the vault (on foot)' },
      { kind: 'reach', at: { x: -104, z: 23 }, radius: 7, needCar: true, text: 'Run the lockbox to the Marina Pier drop' },
    ],
  },
];

/** Marker colours: gold for a job, teal for the safehouse, red for the vault. */
const MARKER_COLORS = { job: 0xffd166, safe: 0x7ee787, vault: 0xff5a4e };

/** A glowing ground ring, a light beam and a bobbing diamond: the job, visible from across the city. */
function makeMarker(color) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.28, 8, 40),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  group.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 36, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 18;
  group.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color }),
  );
  diamond.position.y = 4.5;
  group.add(diamond);
  group.userData = { ring, diamond };
  group.visible = false;
  return group;
}

export function createMissions(scene, deps) {
  const { traffic, vehicles, player } = deps;
  const marker = makeMarker(MARKER_COLORS.job);
  scene.add(marker);

  const state = {
    /** Index of the next mission to play; MISSIONS.length means the chain is done. */
    index: 0,
    /** Ids of missions already completed. */
    done: [],
    /** 'idle' | 'active' | 'failed' | 'complete' */
    status: 'idle',
    phase: 0,
    /** Seconds left on the mission timer (0 = no timer). */
    timer: 0,
    /** Seconds stood inside a dwell marker. */
    dwell: 0,
    /** Seconds of tailing banked (M3). */
    progress: 0,
    /** Seconds the tail target has been out of range (M3). */
    escapeTimer: 0,
    /** Seconds the world has been running, for the marker pulse. */
    time: 0,
    /** Whether the current mission set the wanted level itself (M4/M5). */
    heatSet: false,
  };

  function current() {
    return state.index < MISSIONS.length ? MISSIONS[state.index] : null;
  }

  function phaseDef() {
    const mission = current();
    return mission ? mission.phases[state.phase] : null;
  }

  function markerColor() {
    const mission = current();
    if (!mission) return MARKER_COLORS.job;
    if (mission.id === 'm4') return MARKER_COLORS.safe;
    if (mission.id === 'm5' && state.phase === 0) return MARKER_COLORS.vault;
    return MARKER_COLORS.job;
  }

  function showMarker(at) {
    const color = markerColor();
    marker.children[0].material.color.setHex(color);
    marker.children[1].material.color.setHex(color);
    marker.children[2].material.color.setHex(color);
    marker.position.set(at.x, 0, at.z);
    marker.visible = true;
  }

  function hideMarker() {
    marker.visible = false;
  }

  function setPhase(phase) {
    state.phase = phase;
    state.dwell = 0;
    const def = phaseDef();
    if (!def) return [];
    const events = [];
    if (def.at) showMarker(def.at);
    else hideMarker();
    return events;
  }

  /** Start mission `index` (default: the next unplayed one). Returns events for main.js to apply. */
  function start(index = state.index) {
    if (index >= MISSIONS.length) return [];
    state.index = index;
    state.status = 'active';
    state.phase = 0;
    state.dwell = 0;
    state.progress = 0;
    state.escapeTimer = 0;
    state.heatSet = false;
    const mission = MISSIONS[index];
    state.timer = mission.timeLimit;
    const events = [{ type: 'toast', text: mission.briefing, seconds: 6 }];
    if (mission.id === 'm3') {
      deps.spawnTargetCar();
    }
    if (mission.id === 'm4') {
      state.heatSet = true;
      events.push({ type: 'wanted', level: 3 });
      events.push({ type: 'toast', text: 'Wanted ★★★ — the Vice Shores PD is on you', seconds: 4 });
    }
    if (mission.id === 'm5') {
      deps.spawnGetawayCar();
    }
    setPhase(0);
    return events;
  }

  /** Restart the current mission from its first phase. */
  function restart() {
    cleanup();
    return start(state.index);
  }

  /** Fail the active mission with a reason: 'busted' | 'time' | 'escaped'. */
  function fail(reason) {
    if (state.status !== 'active') return [];
    cleanup();
    state.status = 'failed';
    const mission = current();
    const why = reason === 'busted'
      ? 'Busted — the job is blown'
      : reason === 'time'
        ? 'Out of time — the job is blown'
        : 'The target got away — the job is blown';
    return [
      { type: 'fail', text: `${mission ? mission.name : 'Mission'} failed: ${why}` },
      { type: 'toast', text: `${why}. Press R or open the mission panel (J) to retry.`, seconds: 5 },
    ];
  }

  /** Complete the active mission: reward, next job, or the chain done. */
  function complete() {
    const mission = current();
    if (!mission) return [];
    cleanup();
    state.done.push(mission.id);
    state.status = state.index + 1 >= MISSIONS.length ? 'complete' : 'idle';
    state.index += 1;
    const events = [
      { type: 'complete', mission, text: `${mission.name} complete — +$${mission.reward.toLocaleString('en-US')}` },
      { type: 'toast', text: `${mission.name} complete — $${mission.reward.toLocaleString('en-US')} earned`, seconds: 5 },
    ];
    if (state.index < MISSIONS.length) {
      events.push({ type: 'next', mission: MISSIONS[state.index] });
    }
    return events;
  }

  /** Clear the mission's world props: target car, getaway car, package, marker. */
  function cleanup() {
    hideMarker();
    deps.removeTargetCar();
    deps.removeGetawayCar();
    deps.setCarrying(false);
  }

  /** Wipe the whole chain back to mission one (New Game). */
  function resetAll() {
    cleanup();
    state.index = 0;
    state.done = [];
    state.status = 'idle';
    state.phase = 0;
    state.timer = 0;
    state.dwell = 0;
    state.progress = 0;
    state.escapeTimer = 0;
    state.heatSet = false;
  }

  /** Drop the active run but keep completed missions (used when staging a screenshot). */
  function resetRun() {
    cleanup();
    state.status = 'idle';
    state.phase = 0;
    state.timer = 0;
    state.dwell = 0;
    state.progress = 0;
    state.escapeTimer = 0;
    state.heatSet = false;
  }

  /** Restore progress from a save: next mission index and the done list. */
  function restore(savedIndex, savedDone) {
    resetRun();
    state.index = Math.max(0, Math.min(MISSIONS.length, savedIndex || 0));
    state.done = Array.isArray(savedDone) ? savedDone.filter((id) => MISSIONS.some((m) => m.id === id)) : [];
    if (state.index >= MISSIONS.length) state.status = 'complete';
  }

  /** The HUD objective line for the active mission, with live distance/timer. */
  function objectiveText(world) {
    const mission = current();
    if (!mission || state.status !== 'active') {
      return state.status === 'complete'
        ? 'All missions complete — Vice Shores is yours'
        : 'Open the mission panel (J) to start the next job';
    }
    const def = phaseDef();
    let text = `${mission.name}: ${def ? def.text : mission.objective}`;
    if (def && def.at) {
      const dist = Math.round(Math.hypot(world.x - def.at.x, world.z - def.at.z));
      text += ` — ${dist} m`;
    }
    if (def && def.kind === 'dwell' && state.dwell > 0) {
      text += ` — ${Math.ceil(def.dwellSeconds - state.dwell)} s`;
    }
    if (def && def.kind === 'tail') {
      text += ` — ${Math.floor(state.progress)}/${def.followSeconds} s`;
    }
    if (state.timer > 0) text += ` — ${Math.ceil(state.timer)} s left`;
    return text;
  }

  /** Minimap dots: the active marker (the tail target rides in trafficDots). */
  function dots() {
    const def = phaseDef();
    if (state.status !== 'active' || !def || !def.at) return [];
    return [{ x: def.at.x, z: def.at.z, kind: 'mission' }];
  }

  /** One fixed step. `world` carries the player position, driving state, speed and wanted level. */
  function step(dt, world) {
    state.time += dt;
    if (marker.visible) {
      const pulse = 1 + Math.sin(state.time * 3) * 0.08;
      marker.userData.ring.scale.set(pulse, pulse, 1);
      marker.userData.diamond.position.y = 4.5 + Math.sin(state.time * 2) * 0.5;
      marker.userData.diamond.rotation.y += dt * 1.5;
    }
    if (state.status !== 'active') return [];
    const mission = current();
    const def = phaseDef();
    if (!mission || !def) return [];
    const events = [];
    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.timer = 0;
        return fail('time');
      }
    }
    const distTo = (at) => Math.hypot(world.x - at.x, world.z - at.z);

    if (def.kind === 'steal') {
      if (world.driving) {
        events.push({ type: 'toast', text: 'Car boosted — now get it to the drop', seconds: 3 });
        setPhase(1);
      }
      return events;
    }
    if (def.kind === 'pickup') {
      if (!world.driving && distTo(def.at) <= def.radius) {
        deps.setCarrying(true);
        events.push({ type: 'toast', text: 'Package picked up — deliver it fast', seconds: 3 });
        setPhase(1);
      }
      return events;
    }
    if (def.kind === 'dwell') {
      if (!world.driving && distTo(def.at) <= def.radius) {
        state.dwell += dt;
        if (state.dwell >= def.dwellSeconds) {
          deps.setCarrying(true);
          state.heatSet = true;
          events.push({ type: 'wanted', level: 4 });
          events.push({ type: 'toast', text: 'Lockbox grabbed — Wanted ★★★★ — run for the pier!', seconds: 5 });
          setPhase(1);
        }
      } else {
        state.dwell = 0;
      }
      return events;
    }
    if (def.kind === 'tail') {
      const target = deps.targetPosition();
      if (!target) return events;
      const dist = Math.hypot(world.x - target.x, world.z - target.z);
      if (dist > def.escape) {
        state.escapeTimer += dt;
        if (state.escapeTimer >= def.escapeSeconds) return fail('escaped');
      } else {
        state.escapeTimer = 0;
        if (dist <= def.near && dist >= def.spook) {
          state.progress += dt;
          if (state.progress >= def.followSeconds) {
            events.push({ type: 'toast', text: 'Tail complete — Rico has what he needs', seconds: 4 });
            return [...events, ...complete()];
          }
        }
      }
      return events;
    }
    if (def.kind === 'reach') {
      const inCar = def.needCar ? !!world.driving : true;
      if (inCar && distTo(def.at) <= def.radius) {
        if (mission.id === 'm4') {
          events.push({ type: 'wanted', level: 0 });
          events.push({ type: 'clearPolice' });
          events.push({ type: 'toast', text: 'Safehouse — the heat cannot find you here', seconds: 4 });
        }
        if (mission.id === 'm5') deps.setCarrying(false);
        if (mission.id === 'm2') deps.setCarrying(false);
        return [...events, ...complete()];
      }
      return events;
    }
    return events;
  }

  /** Render the mission panel list into #mission-list, with the current briefing. */
  function renderPanel() {
    const list = document.getElementById('mission-list');
    const story = document.getElementById('mission-story');
    if (!list || !story) return;
    const mission = current();
    story.textContent = mission
      ? `${mission.name} — ${mission.briefing}`
      : 'Every job in Vice Shores is done. The city is yours, Marisol.';
    list.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const item = document.createElement('li');
      const done = state.done.includes(m.id);
      const active = state.status === 'active' && state.index === i;
      const failed = state.status === 'failed' && state.index === i;
      const status = done ? 'DONE' : active ? 'ACTIVE' : failed ? 'FAILED — retry' : state.index > i ? 'DONE' : 'LOCKED';
      item.className = done ? 'done' : active ? 'active' : failed ? 'failed' : 'locked';
      item.textContent = `${m.name} — ${m.contact} — $${m.reward.toLocaleString('en-US')} — ${status}`;
      list.appendChild(item);
    });
  }

  return {
    state,
    MISSIONS,
    current,
    start,
    restart,
    fail,
    complete,
    resetAll,
    resetRun,
    restore,
    step,
    objectiveText,
    dots,
    renderPanel,
  };
}
