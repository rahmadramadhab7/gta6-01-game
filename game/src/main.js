// Vice Shores — boot and the one loop: input is read every frame, the world advances
// in fixed 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between three screens: title, play and paused.
//
// ?seed=N fixes the city and the traffic. ?shot=play|street|pier|start (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CAMERA, CLOCK, START, STEP } from './config.js';
import { createCity } from './city.js';
import { createPlayer, snapCamera, stepPlayer, updateCamera } from './player.js';
import { createTraffic, stepTraffic, trafficDots } from './traffic.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { clearSave, defaultSave, hasSave, loadSave, writeSave } from './save.js';
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
const hud = createHud();
const audio = createAudio();
const input = createInput(canvas);

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
    player.x = START.spawn.x;
    player.z = START.spawn.z;
    player.heading = START.spawn.heading;
    player.cameraYaw = START.spawn.heading + Math.PI;
    player.cameraPitch = 0.32;
    snapCamera(player, camera);
    hud.setCash(state.cash);
    hud.setHealth(state.health);
    hud.setWanted(state.wanted);
    hud.setObjective(state.objective);
    hud.setClock(state.day, state.minutes);
    hud.setSpeed(0, 'on foot');
  },
  placePlayer(x, z, heading) {
    player.x = x;
    player.z = z;
    player.heading = heading;
    player.cameraYaw = heading + Math.PI;
    snapCamera(player, camera);
  },
  setCameraYaw(yaw) {
    player.cameraYaw = yaw;
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
    hud.drawMinimap(player, trafficDots(traffic));
    audio.stepFootsteps(player.moving, player.speed > 8);
  },
  render() {
    renderer.render(scene, camera);
  },
};

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
  };
}

function applySave(save) {
  state.cash = save.cash;
  state.health = save.health;
  state.wanted = save.wanted;
  state.day = save.day;
  state.minutes = save.minutes;
  state.objective = save.objective;
  player.x = save.x;
  player.z = save.z;
  player.heading = save.heading;
  player.cameraYaw = save.heading + Math.PI;
  snapCamera(player, camera);
  hud.setCash(state.cash);
  hud.setHealth(state.health);
  hud.setWanted(state.wanted);
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
  }
  state.screen = 'play';
  startScreen.hidden = true;
  pauseScreen.hidden = true;
  hud.show();
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
