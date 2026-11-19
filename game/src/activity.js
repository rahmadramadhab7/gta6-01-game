// Side activities, outside the mission chain: Shore Coins to collect and
// stunt ramps to jump. Twelve gold coins are scattered on the sidewalks; walk
// or drive close to one to pocket it (+$50 each, +$500 bonus for all twelve).
// Three striped ramps sit on the avenues; hit one in a car at speed and the
// jump counts as a stunt (+$100 the first time per ramp, with a little airtime
// hop). Progress (which coins, which ramps) lives in the save file.
import * as THREE from 'three';
import { STEP } from './config.js';

/** Twelve coin spots: sidewalks (8.5 units off a street line), spread over the city. */
export const COIN_SPOTS = [
  { x: 31.5, z: 23 }, { x: -14.5, z: -23 }, { x: 77.5, z: 69 }, { x: -60.5, z: -69 },
  { x: 100.5, z: -23 }, { x: -100.5, z: 23 }, { x: 23, z: 77.5 }, { x: -23, z: -77.5 },
  { x: 69, z: -31.5 }, { x: -69, z: 31.5 }, { x: 54.5, z: 115 }, { x: -54.5, z: -115 },
];
export const COIN_REWARD = 50;
export const COIN_BONUS = 500;

/** Three ramps: a wedge on an avenue, facing the traffic that jumps it. */
export const RAMP_SPOTS = [
  { x: 23, z: -40, heading: Math.PI }, // north up 23rd Avenue
  { x: -40, z: 69, heading: -Math.PI / 2 }, // west down Marina Avenue
  { x: 60, z: -23, heading: Math.PI / 2 }, // east down 23rd Street
];
export const STUNT_REWARD = 100;
/** Speed (world units/s) a car needs over a ramp for the jump to count. */
const STUNT_MIN_SPEED = 12;
/** How close the car must pass to a ramp centre to jump it. */
const STUNT_RADIUS = 3.5;
/** Pickup radius for a coin, on foot or in a car. */
const COIN_RADIUS = 2.4;
/** Seconds of hop after a stunt: the car mesh arcs up and back down. */
const AIR_SECONDS = 0.55;
const AIR_HEIGHT = 1.4;

function makeCoin() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.25, metalness: 0.8, emissive: 0x664411 });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20), gold);
  coin.rotation.x = Math.PI / 2;
  coin.castShadow = true;
  group.add(coin);
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.14, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff2b0, roughness: 0.2, metalness: 0.9 }),
  );
  inner.rotation.x = Math.PI / 2;
  group.add(inner);
  return group;
}

/** A stunt ramp: a bright sand wedge with glowing yellow chevrons, so it reads
 *  from the driver's seat even at dusk, plus two orange marker posts. */
function makeRamp(heading) {
  const group = new THREE.Group();
  const wedge = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.5, 5.2),
    new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.8 }),
  );
  wedge.position.y = 0.35;
  wedge.rotation.x = -0.32;
  wedge.castShadow = true;
  group.add(wedge);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  for (const sx of [-1.5, 0, 1.5]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 5.0), stripeMat);
    stripe.position.set(sx, 0.62, 0);
    stripe.rotation.x = -0.32;
    group.add(stripe);
  }
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.18, 5.4),
    new THREE.MeshStandardMaterial({ color: 0x8a6b3f, roughness: 0.95 }),
  );
  base.position.y = 0.09;
  group.add(base);
  const postMat = new THREE.MeshBasicMaterial({ color: 0xff7a59 });
  for (const sx of [-2.4, 2.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8), postMat);
    post.position.set(sx, 0.8, -2.6);
    group.add(post);
  }
  group.rotation.y = heading;
  return group;
}

export function createActivities(scene, seed) {
  void seed;
  const coins = COIN_SPOTS.map((spot) => {
    const mesh = makeCoin();
    mesh.position.set(spot.x, 1.0, spot.z);
    scene.add(mesh);
    return { ...spot, mesh, collected: false, spin: Math.random() * Math.PI * 2 };
  });
  const ramps = RAMP_SPOTS.map((spot) => {
    const mesh = makeRamp(spot.heading);
    mesh.position.set(spot.x, 0, spot.z);
    scene.add(mesh);
    return { ...spot, mesh, done: false, cooldown: 0 };
  });
  return { scene, coins, ramps, airTimer: 0, time: 0 };
}

/** How many coins are collected, out of twelve. */
export function coinsCollected(activities) {
  return activities.coins.filter((coin) => coin.collected).length;
}

/** How many ramps have been jumped, out of three. */
export function stuntsDone(activities) {
  return activities.ramps.filter((ramp) => ramp.done).length;
}

/** Save shape: the collected coin and jumped ramp indices. */
export function serializeActivities(activities) {
  return {
    coins: activities.coins.map((coin, i) => (coin.collected ? i : -1)).filter((i) => i >= 0),
    stunts: activities.ramps.map((ramp, i) => (ramp.done ? i : -1)).filter((i) => i >= 0),
  };
}

/** Restore collected coins / jumped ramps from a save (indices from serialize). */
export function restoreActivities(activities, saved) {
  if (!saved) return;
  if (Array.isArray(saved.coins)) {
    for (const i of saved.coins) {
      const coin = activities.coins[i];
      if (coin) { coin.collected = true; coin.mesh.visible = false; }
    }
  }
  if (Array.isArray(saved.stunts)) {
    for (const i of saved.stunts) {
      const ramp = activities.ramps[i];
      if (ramp) ramp.done = true;
    }
  }
}

/** Reset all coins and ramps (a fresh game). */
export function resetActivities(activities) {
  for (const coin of activities.coins) {
    coin.collected = false;
    coin.mesh.visible = true;
  }
  for (const ramp of activities.ramps) {
    ramp.done = false;
    ramp.cooldown = 0;
  }
  activities.airTimer = 0;
}

/** Move a coin's mesh (staging only: put a coin in frame for a screenshot). */
export function moveCoin(activities, index, x, z) {
  const coin = activities.coins[index % activities.coins.length];
  if (!coin) return null;
  coin.x = x;
  coin.z = z;
  coin.mesh.position.set(x, 1.0, z);
  return coin;
}

/**
 * One fixed step: coins spin, pickups pay out, ramps trigger stunts. `world`
 * carries the player/car position and speed and whether she is driving.
 * Returns events: `{ type: 'coin', index, total }`, `{ type: 'coinBonus' }`,
 * `{ type: 'stunt', index }`.
 */
export function stepActivities(activities, world, dt = STEP) {
  activities.time += dt;
  const events = [];
  for (const coin of activities.coins) {
    if (coin.collected) continue;
    coin.spin += dt * 2.4;
    coin.mesh.rotation.y = coin.spin;
    coin.mesh.position.y = 1.0 + Math.sin(activities.time * 2 + coin.spin) * 0.12;
    const dist = Math.hypot(coin.x - world.x, coin.z - world.z);
    if (dist < COIN_RADIUS) {
      coin.collected = true;
      coin.mesh.visible = false;
      const total = coinsCollected(activities);
      events.push({ type: 'coin', index: activities.coins.indexOf(coin), total });
      if (total === activities.coins.length) events.push({ type: 'coinBonus' });
    }
  }
  for (const ramp of activities.ramps) {
    if (ramp.cooldown > 0) ramp.cooldown -= dt;
    if (!world.driving || ramp.cooldown > 0) continue;
    const dist = Math.hypot(ramp.x - world.x, ramp.z - world.z);
    if (dist < STUNT_RADIUS && Math.abs(world.speed) > STUNT_MIN_SPEED) {
      ramp.cooldown = 3;
      activities.airTimer = AIR_SECONDS;
      if (!ramp.done) {
        ramp.done = true;
        events.push({ type: 'stunt', index: activities.ramps.indexOf(ramp) });
      }
    }
  }
  // Airtime hop: the driven car mesh arcs up and lands again.
  if (activities.airTimer > 0 && world.drivenMesh) {
    activities.airTimer -= dt;
    const progress = 1 - Math.max(0, activities.airTimer) / AIR_SECONDS;
    world.drivenMesh.position.y = Math.sin(progress * Math.PI) * AIR_HEIGHT;
    if (activities.airTimer <= 0) world.drivenMesh.position.y = 0;
  }
  return events;
}

/** Minimap dots: uncollected coins as gold dots. */
export function activityDots(activities) {
  return activities.coins
    .filter((coin) => !coin.collected)
    .map((coin) => ({ x: coin.x, z: coin.z, kind: 'coin' }));
}
