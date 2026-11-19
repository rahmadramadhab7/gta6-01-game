// Driving and car theft: parked cars waiting at the kerb, traffic cars that can
// be pulled over and taken, and the arcade physics of the car Marisol is driving.
// A stolen car is the driven car; everything else keeps rolling on its own route.
import * as THREE from 'three';
import { CITY, PALETTE, STREET_LINES, VEHICLE } from './config.js';
import { makeCar } from './traffic.js';
import { createRandom, randomPick } from './random.js';

/** Original car names — no borrowed marques, just Vice Shores flavour. */
const CAR_NAMES = [
  'Sunset Comet', 'Bay Runner', 'Palm Cruiser', 'Marina GT', 'Coral Coupe',
  'Shoreline V8', 'Neon Gull', 'Tide Rider', 'Flamingo Flyer', 'Harbour Hawk',
];

/** Kerb spots for parked cars: on a street line, between intersections, facing along it. */
function parkedSpots(random) {
  const spots = [];
  const used = new Set();
  while (spots.length < 6) {
    const alongX = random() < 0.5;
    const line = randomPick(random, STREET_LINES);
    const side = random() < 0.5 ? 4.8 : -4.8;
    const at = randomPick(random, [-92, -46, 0, 46, 92]);
    const key = `${alongX ? 'x' : 'z'}${line}:${at}`;
    if (used.has(key)) continue;
    used.add(key);
    spots.push({
      x: alongX ? at : line + side,
      z: alongX ? line + side : at,
      heading: alongX ? Math.PI / 2 : 0,
    });
  }
  return spots;
}

/** Push a circle out of an axis-aligned box it overlaps; true when it hit one. */
function resolveCircle(position, radius, colliders) {
  let hit = false;
  for (const box of colliders) {
    const nearX = Math.max(box.minX, Math.min(position.x, box.maxX));
    const nearZ = Math.max(box.minZ, Math.min(position.z, box.maxZ));
    const dx = position.x - nearX;
    const dz = position.z - nearZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    hit = true;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      position.x = nearX + (dx / dist) * radius;
      position.z = nearZ + (dz / dist) * radius;
    } else {
      const pushLeft = position.x - box.minX;
      const pushRight = box.maxX - position.x;
      const pushNear = position.z - box.minZ;
      const pushFar = box.maxZ - position.z;
      const smallest = Math.min(pushLeft, pushRight, pushNear, pushFar);
      if (smallest === pushLeft) position.x = box.minX - radius;
      else if (smallest === pushRight) position.x = box.maxX + radius;
      else if (smallest === pushNear) position.z = box.minZ - radius;
      else position.z = box.maxZ + radius;
    }
  }
  return hit;
}

export function createVehicles(scene, seed) {
  const random = createRandom(seed ^ 0x6d2b79f5);
  const parked = [];
  const spots = parkedSpots(random);
  spots.forEach((spot, index) => {
    const color = randomPick(random, PALETTE.car);
    const mesh = makeCar(color);
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = spot.heading;
    scene.add(mesh);
    parked.push({
      mesh, color,
      name: CAR_NAMES[index % CAR_NAMES.length],
      x: spot.x, z: spot.z, heading: spot.heading,
      homeX: spot.x, homeZ: spot.z, homeHeading: spot.heading,
      speed: 0, stolen: false,
    });
  });
  return { scene, parked, driven: null, missionCar: null };
}

/** Spawn the mission getaway car (M5): a tuned Sunset Comet parked by the vault,
 *  faster than a street car, waiting to be stolen for the run to the pier. */
export function spawnMissionCar(vehicles, x, z, heading = 0) {
  if (vehicles.missionCar) return vehicles.missionCar;
  const color = 0xc0392b;
  const mesh = makeCar(color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  vehicles.scene.add(mesh);
  const car = {
    mesh, color,
    name: 'Getaway Comet',
    x, z, heading,
    homeX: x, homeZ: z, homeHeading: heading,
    speed: 0, stolen: true, // Rico's car: taking it is part of the job, not a fresh theft.
    /** A tuned engine: 25% higher top speed than a street car. */
    boost: 1.25,
    missionCar: true,
  };
  vehicles.parked.push(car);
  vehicles.missionCar = car;
  return car;
}

/** Take the mission getaway car off the streets. */
export function removeMissionCar(vehicles) {
  const car = vehicles.missionCar;
  if (!car) return;
  const index = vehicles.parked.indexOf(car);
  if (index >= 0) vehicles.parked.splice(index, 1);
  if (vehicles.driven && vehicles.driven.ref === car) vehicles.driven = null;
  vehicles.scene.remove(car.mesh);
  vehicles.missionCar = null;
}

/** The nearest car Marisol can steal: a parked car, or a traffic car rolling past. */
export function nearestDrivable(vehicles, traffic, x, z) {
  let best = null;
  let bestDist = VEHICLE.stealDistance;
  for (const car of vehicles.parked) {
    const dist = Math.hypot(car.x - x, car.z - z);
    if (dist < bestDist) { bestDist = dist; best = { kind: 'parked', ref: car, dist }; }
  }
  for (const car of traffic.cars) {
    const dist = Math.hypot(car.mesh.position.x - x, car.mesh.position.z - z);
    if (dist < bestDist) { bestDist = dist; best = { kind: 'traffic', ref: car, dist }; }
  }
  return best;
}

/**
 * Steal the nearest car. A parked car becomes the driven car; a traffic car is
 * pulled out of the traffic flow and becomes the driven car. Returns the driven
 * car, or null when no car is close enough. `stole` is true only the first time
 * a parked car is taken — taking a car that was already yours is not a new theft.
 */
export function enterCar(vehicles, traffic, x, z) {
  const found = nearestDrivable(vehicles, traffic, x, z);
  if (!found) return null;
  let driven;
  let stole;
  if (found.kind === 'parked') {
    const car = found.ref;
    stole = !car.stolen;
    car.stolen = true;
    driven = { kind: 'parked', ref: car, mesh: car.mesh, name: car.name, color: car.color, speed: 0, x: car.x, z: car.z, heading: car.heading };
  } else {
    const car = found.ref;
    stole = true;
    const index = traffic.cars.indexOf(car);
    if (index >= 0) traffic.cars.splice(index, 1);
    driven = {
      kind: 'traffic', ref: car, mesh: car.mesh,
      name: 'Stolen traffic car', color: 0x95a5a6, speed: 0,
      x: car.mesh.position.x, z: car.mesh.position.z,
      heading: car.alongX ? (car.direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.direction > 0 ? Math.PI : 0),
    };
  }
  vehicles.driven = driven;
  return { car: driven, stole };
}

/** Step out of the driven car: Marisol appears beside it, the car stays where it stopped. */
export function exitCar(vehicles, player) {
  const driven = vehicles.driven;
  if (!driven) return null;
  const sideX = Math.cos(driven.heading);
  const sideZ = -Math.sin(driven.heading);
  player.x = driven.x + sideX * 2.2;
  player.z = driven.z + sideZ * 2.2;
  player.heading = driven.heading;
  player.cameraYaw = driven.heading + Math.PI;
  if (driven.kind === 'parked') {
    driven.ref.x = driven.x;
    driven.ref.z = driven.z;
    driven.ref.heading = driven.heading;
    driven.ref.speed = 0;
  }
  vehicles.driven = null;
  return driven;
}

/** One fixed step of driving: arcade acceleration, steering, and collisions. */
export function stepVehicle(vehicles, input, colliders, traffic, dt) {
  const car = vehicles.driven;
  if (!car) return 0;
  const forward = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  const left = input.left ? 1 : 0;
  const right = input.right ? 1 : 0;
  if (forward) car.speed += VEHICLE.accel * dt;
  if (back) {
    car.speed += car.speed > 0.5 ? -VEHICLE.brake * dt : -VEHICLE.reverseAccel * dt;
  }
  if (!forward && !back) {
    // Rolling drag: ease to a stop instead of freezing mid-road.
    const drag = 6 * dt;
    if (Math.abs(car.speed) <= drag) car.speed = 0;
    else car.speed -= Math.sign(car.speed) * drag;
  }
  car.speed = Math.max(-VEHICLE.maxReverse, Math.min(VEHICLE.maxSpeed * (car.boost || 1), car.speed));
  // Steering follows the speed: full lock at full speed, reversed while reversing.
  const steer = right - left;
  const speedFactor = Math.max(-1, Math.min(1, car.speed / VEHICLE.maxSpeed));
  car.heading += steer * VEHICLE.turnRate * speedFactor * dt;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  // Stay inside the playable map (city + beach + pier).
  car.x = Math.max(CITY.beachX - 92, Math.min(CITY.halfExtent + 8, car.x));
  car.z = Math.max(-CITY.halfExtent - 8, Math.min(CITY.halfExtent + 8, car.z));
  if (resolveCircle(car, VEHICLE.radius, colliders)) {
    // Hit a building: bounce back a little and lose most of the speed.
    car.speed *= -0.25;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
  }
  // Bumping a traffic car slows both of them down.
  for (const other of traffic.cars) {
    const dx = other.mesh.position.x - car.x;
    const dz = other.mesh.position.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3.6 && dist > 0.001) {
      car.x -= (dx / dist) * (3.6 - dist);
      car.z -= (dz / dist) * (3.6 - dist);
      car.speed *= 0.5;
      other.speed *= 0.7;
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  return car.speed;
}

/** Put every parked car back on its kerb spot and clear the driven car. */
export function resetVehicles(vehicles) {
  removeMissionCar(vehicles);
  for (const car of vehicles.parked) {
    car.x = car.homeX;
    car.z = car.homeZ;
    car.heading = car.homeHeading;
    car.speed = 0;
    car.stolen = false;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
  vehicles.driven = null;
}

/** Parked-car dots for the minimap. */
export function vehicleDots(vehicles) {
  return vehicles.parked.map((car) => ({ x: car.x, z: car.z, kind: 'car' }));
}

/** Where the parked cars start, for the screenshot staging. */
export function parkedSpot(vehicles, index) {
  const car = vehicles.parked[index % vehicles.parked.length];
  return { x: car.x, z: car.z, heading: car.heading, name: car.name };
}

/** Move a parked car to a spot (used to stage the mission screenshot near the safehouse). */
export function moveParkedCar(vehicles, index, x, z, heading) {
  const car = vehicles.parked[index % vehicles.parked.length];
  car.x = x; car.z = z; car.heading = heading;
  car.homeX = x; car.homeZ = z; car.homeHeading = heading;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  return car;
}

/** What the save file needs to remember about the cars. */
export function serializeVehicles(vehicles) {
  return {
    parked: vehicles.parked.map((car) => ({ x: car.x, z: car.z, heading: car.heading, stolen: car.stolen })),
    driven: vehicles.driven
      ? { kind: vehicles.driven.kind, name: vehicles.driven.name, color: vehicles.driven.color, x: vehicles.driven.x, z: vehicles.driven.z, heading: vehicles.driven.heading }
      : null,
  };
}

/** Restore parked cars from a save, and climb back into the car that was driven. */
export function restoreVehicles(vehicles, scene, saved, traffic) {
  if (!saved) return null;
  if (Array.isArray(saved.parked)) {
    saved.parked.forEach((spot, index) => {
      const car = vehicles.parked[index];
      if (!car || typeof spot !== 'object' || spot === null) return;
      car.x = spot.x; car.z = spot.z; car.heading = spot.heading; car.stolen = !!spot.stolen;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    });
  }
  if (!saved.driven) return null;
  const savedCar = saved.driven;
  if (savedCar.kind === 'parked') {
    const car = vehicles.parked.find((item) => item.name === savedCar.name);
    if (!car) return null;
    car.stolen = true;
    car.x = savedCar.x; car.z = savedCar.z; car.heading = savedCar.heading;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    vehicles.driven = { kind: 'parked', ref: car, mesh: car.mesh, name: car.name, color: car.color, speed: 0, x: car.x, z: car.z, heading: car.heading };
  } else {
    const mesh = makeCar(savedCar.color || 0x95a5a6);
    mesh.position.set(savedCar.x, 0, savedCar.z);
    mesh.rotation.y = savedCar.heading;
    scene.add(mesh);
    vehicles.driven = { kind: 'traffic', ref: null, mesh, name: savedCar.name, color: savedCar.color || 0x95a5a6, speed: 0, x: savedCar.x, z: savedCar.z, heading: savedCar.heading };
  }
  return vehicles.driven;
}
