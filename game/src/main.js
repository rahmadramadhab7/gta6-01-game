// Vice Shores — boot and the one loop: input is read every frame, the world advances
// in fixed 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between three screens: title, play and paused.
//
// ?seed=N fixes the city and the traffic. ?shot=play|street|pier|drive|police|mission|start
// (with &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CAMERA, CLOCK, START, STEP } from './config.js';
import { createCity } from './city.js';
import { createPlayer, setCarrying as setPlayerCarrying, snapCamera, stepPlayer, updateCamera } from './player.js';
import { createTraffic, missionTargetPosition, removeMissionTarget, spawnMissionTarget, stepTraffic, trafficDots } from './traffic.js';
import { createVehicles, enterCar, exitCar, moveParkedCar, parkedSpot, removeMissionCar, resetVehicles, restoreVehicles, serializeVehicles, spawnMissionCar, stepVehicle, vehicleDots } from './vehicle.js';
import { clearPolice, createPolice, policeDots, stageChase, stepPolice } from './police.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { ACTION_ENTER, ACTION_MISSION, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { clearSave, defaultSave, hasSave, loadSave, writeSave } from './save.js';
import { createMissions } from './mission.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Seconds between autosaves while playing. */
const AUTOSAVE_SECONDS = 10;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const btnNew = document.getElementById('btn-new');
const btnContinue = document.getElementById('btn-continue');
const btnResume = document.getElementById('btn-resume');
const missionPanel = document.getElementById('mission-panel');
const btnMissionStart = document.getElementById('btn-mission-start');
const btnMissionRestart = document.getElementById('btn-mission-restart');
const btnMissionClose = document.getElementById('btn-mission-close');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);

const city = createCity(scene, seed);
const player = createPlayer(scene, START.spawn);
const traffic = createTraffic(scene, seed);
const vehicles = createVehicles(scene, seed);
const police = createPolice(scene, seed);
const hud = createHud();
const audio = createAudio();
const input = createInput(canvas);
const missions = createMissions(scene, {
  traffic, vehicles, player,
  spawnTargetCar: () => spawnMissionTarget(traffic, 69, 69),
  removeTargetCar: () => removeMissionTarget(traffic),
  spawnGetawayCar: () => spawnMissionCar(vehicles, 52, -23, Math.PI / 2),
  removeGetawayCar: () => removeMissionCar(vehicles),
  setCarrying: (carrying) => setPlayerCarrying(player, carrying),
  targetPosition: () => missionTargetPosition(traffic),
});

const state = {
  screen: 'title',
  cash: START.cash,
  health: START.health,
  wanted: START.wanted,
  day: CLOCK.startDay,
  minutes: CLOCK.startMinutes,
  objective: START.objective,
  saveTimer: AUTOSAVE_SECONDS,
  orbitAngle: 0.6,
  /** True while the wanted level is up but no police unit has eyes on Marisol. */
  evading: false,
  /** The car Marisol is driving, or null when she is on foot. */
  driving: null,
};

/** The game object the screenshot staging drives: reset, step, place, render. */
const game = {
  state,
  hud,
  reset() {
    state.cash = START.cash;
    state.health = START.health;
    state.wanted = START.wanted;
    state.day = CLOCK.startDay;
    state.minutes = CLOCK.startMinutes;
    state.objective = START.objective;
    state.screen = 'play';
    state.driving = null;
    state.evading = false;
    wantedMode = 'clear';
    clearPolice(police);
    resetVehicles(vehicles);
    missions.resetRun();
    player.group.visible = true;
    player.x = START.spawn.x;
    player.z = START.spawn.z;
    player.heading = START.spawn.heading;
    player.cameraYaw = START.spawn.heading + Math.PI;
    player.cameraPitch = 0.32;
    snapCamera(player, camera);
    hud.setCash(state.cash);
    hud.setHealth(state.health);
    hud.setWanted(state.wanted);
    hud.setWantedState('clear');
    hud.hideBanner();
    hud.setObjective(state.objective);
    hud.setClock(state.day, state.minutes);
    hud.setSpeed(0, 'on foot');
  },
  placePlayer(x, z, heading) {
    state.driving = null;
    player.group.visible = true;
    player.x = x;
    player.z = z;
    player.heading = heading;
    player.cameraYaw = heading + Math.PI;
    snapCamera(player, camera);
  },
  /** Where parked car `index` waits, for the driving screenshot. */
  parkedSpot(index) {
    return parkedSpot(vehicles, index);
  },
  /** Move a parked car to a spot (used to stage the mission screenshot). */
  moveParkedCar(index, x, z, heading) {
    return moveParkedCar(vehicles, index, x, z, heading);
  },
  /** Start mission `index` (used to stage the mission screenshot). */
  startMission(index) {
    applyMissionEvents(missions.start(index));
  },
  /** Steal the nearest car (or climb out, if already driving) and report it. */
  enterCar() {
    return tryEnterCar();
  },
  /** Put `count` patrol cars on Marisol's tail, for the police screenshot. */
  spawnPoliceChase(count, speed) {
    stageChase(police, player.x, player.z, player.heading, count, speed);
  },
  setCameraYaw(yaw) {
    player.cameraYaw = yaw;
    snapCamera(player, camera);
  },
  /** Widen the chase camera (used by the police shot so the whole pursuit fits). */
  setCameraDistance(distance) {
    CAMERA.distance = distance;
    snapCamera(player, camera);
  },
  showHud() {
    hud.show();
    startScreen.hidden = true;
    pauseScreen.hidden = true;
  },
  showTitle() {
    hud.hide();
    startScreen.hidden = false;
    pauseScreen.hidden = true;
  },
  step(dt, move) {
    if (state.driving) {
      const speed = stepVehicle(vehicles, move, city.colliders, traffic, dt);
      // The chase camera follows the player, so mirror the car onto her.
      player.x = state.driving.x;
      player.z = state.driving.z;
      player.heading = state.driving.heading;
      player.speed = Math.abs(speed);
      player.moving = Math.abs(speed) > 0.5;
      stepTraffic(traffic, dt);
      state.minutes += CLOCK.minutesPerSecond * dt;
      if (state.minutes >= 24 * 60) {
        state.minutes -= 24 * 60;
        state.day += 1;
      }
      updateCamera(player, camera, dt);
      hud.setClock(state.day, state.minutes);
      hud.setSpeed(Math.abs(speed) * 2.23694, state.driving.name);
      hud.tickToast(dt);
      hud.tickBanner(dt);
      stepWanted(dt);
      stepMissions(dt);
      hud.drawMinimap(player, [...trafficDots(traffic), ...vehicleDots(vehicles), ...policeDots(police), ...missions.dots()]);
      return;
    }
    stepPlayer(player, move, city.colliders, dt);
    stepTraffic(traffic, dt);
    state.minutes += CLOCK.minutesPerSecond * dt;
    if (state.minutes >= 24 * 60) {
      state.minutes -= 24 * 60;
      state.day += 1;
    }
    updateCamera(player, camera, dt);
    hud.setClock(state.day, state.minutes);
    hud.setSpeed(player.speed * 2.23694, 'on foot');
    hud.tickToast(dt);
    hud.tickBanner(dt);
    stepWanted(dt);
    stepMissions(dt);
    hud.drawMinimap(player, [...trafficDots(traffic), ...vehicleDots(vehicles), ...policeDots(police), ...missions.dots()]);
    audio.stepFootsteps(player.moving, player.speed > 8);
  },
  render() {
    renderer.render(scene, camera);
  },
};

/** E: climb out of the car, or steal the nearest car (wanted +1 on a fresh theft). */
function tryEnterCar() {
  if (state.driving) {
    exitCar(vehicles, player);
    state.driving = null;
    player.group.visible = true;
    hud.setSpeed(0, 'on foot');
    hud.showToast('Out of the car', 2);
    return { car: null, stole: false };
  }
  const found = enterCar(vehicles, traffic, player.x, player.z);
  if (!found) {
    hud.showToast('No car nearby — press E next to a car', 2);
    return { car: null, stole: false };
  }
  state.driving = found.car;
  player.group.visible = false;
  player.x = found.car.x;
  player.z = found.car.z;
  player.heading = found.car.heading;
  player.cameraYaw = found.car.heading + Math.PI;
  snapCamera(player, camera);
  if (found.stole) {
    state.wanted = Math.min(5, state.wanted + 1);
    hud.setWanted(state.wanted);
    hud.showToast(`Stole the ${found.car.name} — wanted level up`, 4);
  } else {
    hud.showToast(`Driving the ${found.car.name}`, 2);
  }
  return found;
}

/** One step of the wanted system: the chase advances, stars move, a bust ends the run. */
let wantedMode = 'clear';
function stepWanted(dt) {
  const result = stepPolice(police, {
    wanted: state.wanted,
    x: player.x,
    z: player.z,
    speed: state.driving ? Math.abs(state.driving.speed) : player.speed,
    driving: !!state.driving,
    driven: state.driving,
    colliders: city.colliders,
  }, dt);
  if (result.wantedDelta !== 0) {
    state.wanted = Math.max(0, Math.min(5, state.wanted + result.wantedDelta));
    hud.setWanted(state.wanted);
    if (result.rammed) hud.showToast('Ram a police car — wanted level up', 3);
    else if (result.wantedDelta < 0) hud.showToast('The heat is cooling off…', 3);
  }
  const mode = state.wanted === 0 ? 'clear' : (police.evading ? 'evading' : 'wanted');
  if (mode !== wantedMode) {
    wantedMode = mode;
    state.evading = police.evading;
    hud.setWantedState(mode);
  }
  if (result.busted) applyBusted();
}

/** Apply what a mission step reported: toasts, wanted changes, rewards, failures. */
function applyMissionEvents(events) {
  for (const event of events) {
    if (event.type === 'toast') hud.showToast(event.text, event.seconds || 4);
    else if (event.type === 'wanted') {
      state.wanted = event.level;
      hud.setWanted(state.wanted);
      if (state.wanted === 0) {
        wantedMode = 'clear';
        hud.setWantedState('clear');
      }
    } else if (event.type === 'clearPolice') clearPolice(police);
    else if (event.type === 'complete') {
      state.cash += event.mission.reward;
      hud.setCash(state.cash);
      audio.missionComplete();
      hud.showBanner('MISSION COMPLETE', event.text, 4);
      writeSave(snapshotSave());
    } else if (event.type === 'fail') {
      audio.missionFail();
      hud.showBanner('MISSION FAILED', event.text, 4);
      writeSave(snapshotSave());
    } else if (event.type === 'next') {
      // The chain advances on its own: the next job starts with its briefing.
      applyMissionEvents(missions.start(missions.state.index));
    }
  }
}

/** One mission step inside the game loop, plus the live objective line. */
function stepMissions(dt) {
  const world = {
    x: player.x,
    z: player.z,
    driving: !!state.driving,
    speed: state.driving ? Math.abs(state.driving.speed) : player.speed,
    wanted: state.wanted,
  };
  applyMissionEvents(missions.step(dt, world));
  if (missions.state.status === 'active' || missions.state.status === 'failed' || missions.state.status === 'complete') {
    hud.setObjective(missions.objectiveText(world));
  }
}

/** Busted: the Vice Shores PD takes a cut of the cash, the heat resets, and
 *  Marisol is dropped back at the precinct steps on foot. */
function applyBusted() {
  const fine = Math.min(state.cash, Math.floor(state.cash * 0.1));
  state.cash -= fine;
  state.wanted = 0;
  state.evading = false;
  wantedMode = 'clear';
  if (state.driving) {
    exitCar(vehicles, player);
    state.driving = null;
    player.group.visible = true;
  }
  clearPolice(police);
  player.x = START.spawn.x;
  player.z = START.spawn.z;
  player.heading = START.spawn.heading;
  player.cameraYaw = START.spawn.heading + Math.PI;
  player.cameraPitch = 0.32;
  snapCamera(player, camera);
  hud.setCash(state.cash);
  hud.setWanted(0);
  hud.setWantedState('clear');
  hud.setSpeed(0, 'on foot');
  hud.showBanner(
    'BUSTED',
    fine > 0
      ? `The Vice Shores PD took $${fine.toLocaleString('en-US')} in fines`
      : 'The Vice Shores PD let you off with a warning',
    4,
  );
  hud.showToast('Busted — back at the precinct steps', 4);
  // A bust blows the active mission too.
  applyMissionEvents(missions.fail('busted'));
  writeSave(snapshotSave());
}

function snapshotSave() {
  return {
    x: player.x,
    z: player.z,
    heading: player.heading,
    cash: state.cash,
    health: state.health,
    wanted: state.wanted,
    day: state.day,
    minutes: state.minutes,
    objective: state.objective,
    vehicles: serializeVehicles(vehicles),
    missionIndex: missions.state.index,
    missionsDone: [...missions.state.done],
  };
}

function applySave(save) {
  state.cash = save.cash;
  state.health = save.health;
  // A loaded game starts clean: the law forgets you between visits, so the
  // wanted level always comes back as 0 and no patrol car is waiting for you.
  state.wanted = 0;
  state.evading = false;
  wantedMode = 'clear';
  clearPolice(police);
  state.day = save.day;
  state.minutes = save.minutes;
  state.objective = save.objective;
  missions.restore(save.missionIndex, save.missionsDone);
  player.x = save.x;
  player.z = save.z;
  player.heading = save.heading;
  player.cameraYaw = save.heading + Math.PI;
  snapCamera(player, camera);
  state.driving = restoreVehicles(vehicles, scene, save.vehicles, traffic);
  if (state.driving) {
    player.group.visible = false;
    player.x = state.driving.x;
    player.z = state.driving.z;
    player.heading = state.driving.heading;
    snapCamera(player, camera);
  }
  hud.setCash(state.cash);
  hud.setHealth(state.health);
  hud.setWanted(state.wanted);
  hud.setWantedState('clear');
  hud.hideBanner();
  hud.setObjective(state.objective);
  hud.setClock(state.day, state.minutes);
}

function announce(message) {
  status.textContent = message;
}

function startPlaying(fresh) {
  audio.unlock();
  audio.click();
  if (fresh) {
    clearSave();
    game.reset();
    missions.resetAll();
    applyMissionEvents(missions.start(0));
  } else if (missions.state.status !== 'active' && missions.state.index < missions.MISSIONS.length) {
    // Continue: pick up the next job in the chain.
    applyMissionEvents(missions.start(missions.state.index));
  }
  state.screen = 'play';
  startScreen.hidden = true;
  pauseScreen.hidden = true;
  hud.show();
  hud.hideBanner();
  hud.setCash(state.cash);
  hud.setHealth(state.health);
  hud.setWanted(state.wanted);
  hud.setObjective(state.objective);
  hud.setClock(state.day, state.minutes);
  announce('Playing Vice Shores. Reach the Marina Pier.');
}

function pauseGame() {
  if (state.screen !== 'play') return;
  state.screen = 'paused';
  pauseScreen.hidden = false;
  writeSave(snapshotSave());
  announce('Paused. Progress saved.');
}

function resumeGame() {
  audio.unlock();
  audio.click();
  state.screen = 'play';
  pauseScreen.hidden = true;
  announce('Playing.');
}

function runShot(name) {
  const staged = stageShot(name, game);
  state.screen = staged.screen;
  let painted = 0;
  function paint() {
    game.render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const continueSave = loadSave();
  btnContinue.disabled = !hasSave();
  if (continueSave) {
    btnContinue.textContent = `Continue — Day ${continueSave.day}`;
  }
  btnNew.addEventListener('click', () => startPlaying(true));
  btnContinue.addEventListener('click', () => {
    const save = loadSave();
    if (save) applySave(save);
    startPlaying(false);
  });
  btnResume.addEventListener('click', resumeGame);
  btnMissionStart.addEventListener('click', () => {
    if (missions.state.status !== 'active' && missions.state.index < missions.MISSIONS.length) {
      applyMissionEvents(missions.start(missions.state.index));
    }
    missionPanel.hidden = true;
  });
  btnMissionRestart.addEventListener('click', () => {
    if (missions.state.status === 'active' || missions.state.status === 'failed') {
      applyMissionEvents(missions.restart());
    }
    missionPanel.hidden = true;
  });
  btnMissionClose.addEventListener('click', () => { missionPanel.hidden = true; });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' && state.screen === 'title') startPlaying(true);
  });

  // Title screen: a slow cinematic orbit over downtown while traffic rolls below.
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.setMuted(!audio.isMuted());
      hud.showToast(muted ? 'Sound off' : 'Sound on', 2);
    }
    if (actions & ACTION_ENTER) {
      if (state.screen === 'play') tryEnterCar();
    }
    if (actions & ACTION_MISSION) {
      if (state.screen === 'play') {
        missionPanel.hidden = !missionPanel.hidden;
        if (!missionPanel.hidden) missions.renderPanel();
      }
    }
    if (actions & ACTION_RESTART) {
      if (state.screen === 'play' && (missions.state.status === 'active' || missions.state.status === 'failed')) {
        applyMissionEvents(missions.restart());
      }
    }
    if (actions & ACTION_PAUSE) {
      if (state.screen === 'play') pauseGame();
      else if (state.screen === 'paused') resumeGame();
    }
    const drag = input.takeDrag();
    if (drag.yaw !== 0 || drag.pitch !== 0) {
      player.cameraYaw += drag.yaw;
      player.cameraPitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, player.cameraPitch + drag.pitch));
    }
    while (accumulator >= STEP) {
      accumulator -= STEP;
      if (state.screen === 'title') {
        state.orbitAngle += STEP * 0.045;
        camera.position.set(Math.cos(state.orbitAngle) * 95, 42, Math.sin(state.orbitAngle) * 95);
        camera.lookAt(0, 12, 0);
        stepTraffic(traffic, STEP);
        hud.tickToast(STEP);
      } else if (state.screen === 'play') {
        game.step(STEP, input.direction());
        state.saveTimer -= STEP;
        if (state.saveTimer <= 0) {
          state.saveTimer = AUTOSAVE_SECONDS;
          writeSave(snapshotSave());
        }
      }
    }
    game.render();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'play') pauseGame();
  });

  announce('Vice Shores. Press Enter or New Game to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
