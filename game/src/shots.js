// The screenshot scenes behind ?shot=play|street|pier|drive|police|start. Each one plays the real
// game forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot that walks the player forward, so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { STEP } from './config.js';

/** Walk straight ahead for `seconds` at walk speed. */
function walkForward(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    game.step(STEP, { forward: true, back: false, left: false, right: false, run: false });
  }
}

/** Let traffic roll with the player standing still, for a fixed time. */
function idle(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    game.step(STEP, { forward: false, back: false, left: false, right: false, run: false });
  }
}

/** Drive straight ahead for `seconds` at full throttle. */
function driveForward(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    game.step(STEP, { forward: true, back: false, left: false, right: false, run: false });
  }
}

/**
 * Set the game to the named scene and return the screen to show over it:
 *  - play: the cover — Marisol walking the main avenue at sunset, traffic passing,
 *    HUD and minimap on.
 *  - street: on foot downtown among pedestrians and traffic.
 *  - pier: at the Marina Pier at sunset, the Day 1 objective complete.
 *  - drive: behind the wheel — a stolen car racing down the avenue at sunset,
 *    speed and wanted stars on the HUD.
 *  - police: the chase — a stolen car at three stars with two patrol cars on its
 *    tail, lights flashing, WANTED on the HUD and police dots on the minimap.
 *  - start (or anything else): the title screen over the city at dusk.
 */
export function stageShot(name, game) {
  game.reset();
  if (name === 'police') {
    // Steal the first parked car, run it west down Marina Avenue at three stars,
    // then put two patrol cars on its tail and keep driving — the frame is a real
    // chase in progress, not a posed still.
    const spot = game.parkedSpot(0);
    game.placePlayer(spot.x + 2.5, spot.z, spot.heading);
    game.enterCar();
    game.state.wanted = 3;
    game.hud.setWanted(3);
    game.state.driving.heading = -Math.PI / 2;
    game.setCameraDistance(16);
    game.setCameraYaw(Math.PI / 2);
    driveForward(game, 3);
    // Two patrol cars at full speed on the tail, holding formation flanking the
    // stolen car — close enough to read as a chase, far enough to stay in frame.
    game.spawnPoliceChase(2, 34);
    driveForward(game, 1);
    game.hud.showToast('Wanted ★★★ — lose the Vice Shores PD', 60);
    game.showHud();
    return { screen: 'play' };
  }
  if (name === 'drive') {
    // Steal the first parked car, turn it toward the sunset, and drive it west
    // down Marina Avenue — the camera then looks into the sunset, not the shade.
    const spot = game.parkedSpot(0);
    game.placePlayer(spot.x + 2.5, spot.z, spot.heading);
    game.enterCar();
    game.state.driving.heading = -Math.PI / 2;
    game.setCameraYaw(Math.PI / 2);
    driveForward(game, 4);
    game.showHud();
    return { screen: 'play' };
  }
  if (name === 'play') {
    // The cover: walking west down the Marina Avenue (z = 23) into the sunset,
    // traffic passing, towers on both sides, HUD and minimap on.
    game.placePlayer(69, 23, -Math.PI / 2);
    walkForward(game, 6);
    game.showHud();
    return { screen: 'play' };
  }
  if (name === 'street') {
    // On foot downtown: straight north up the 23rd Avenue street, towers both sides.
    game.placePlayer(23, 69, Math.PI);
    walkForward(game, 5);
    game.showHud();
    return { screen: 'play' };
  }
  if (name === 'pier') {
    game.placePlayer(-104, 23, -Math.PI / 2);
    game.setCameraYaw(Math.PI / 2);
    walkForward(game, 5);
    game.state.objective = 'Day 1 complete — Rico is waiting at the pier';
    game.hud.setObjective(game.state.objective);
    game.hud.showToast('Day 1 complete — Rico is waiting at the pier', 60);
    game.showHud();
    return { screen: 'play' };
  }
  // Title screen: the city at dusk behind the menu, traffic rolling.
  game.placePlayer(69, 23, -Math.PI / 2);
  game.setCameraYaw(Math.PI / 2);
  idle(game, 5);
  game.showTitle();
  return { screen: 'title' };
}
