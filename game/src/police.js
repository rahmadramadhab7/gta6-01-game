// The Vice Shores Police Department: patrol cars that answer the wanted level,
// chase Marisol down, ram her car to slow it, and foot cops who close in when she
// is on foot and the heat is high. The law here is simple: stay in sight and they
// keep coming; break away, stay unseen, and the heat cools off a star at a time.
// Get caught slow next to a unit and it is over: BUSTED.
import * as THREE from 'three';
import { CITY, POLICE, STREET_LINES } from './config.js';
import { makeCar } from './traffic.js';
import { createRandom, randomPick } from './random.js';

/** Distance between two things that both have an x and a z. */
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Damage a patrol car deals when it runs into Marisol while she is on foot:
 * nothing at a crawl, otherwise proportional to the car's speed and capped,
 * so one hit hurts but never kills outright. Pure, so it can be unit-tested.
 */
export function patrolRamDamage(speed) {
  const v = Math.abs(speed);
  if (v < POLICE.footRamMinSpeed) return 0;
  return Math.min(
    POLICE.footRamMaxDamage,
    Math.max(POLICE.footRamMinDamage, Math.round(v * POLICE.footRamDamageScale)),
  );
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

/** A patrol car: a dark cruiser with a red/blue light bar flashing on the roof. */
function makePoliceCar() {
  const car = makeCar(0x141824);
  const red = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xff2a1e }),
  );
  red.position.set(-0.45, 1.72, -0.2);
  car.add(red);
  const blue = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x2a6bff }),
  );
  blue.position.set(0.45, 1.72, -0.2);
  car.add(blue);
  car.userData.lightRed = red;
  car.userData.lightBlue = blue;
  return car;
}

/** A foot cop: navy uniform, cap, legs that swing while running the player down. */
function makeCop() {
  const group = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1c2f57, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 4, 8), navy);
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.65;
  group.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.1, 10), navy);
  hat.position.y = 1.84;
  group.add(hat);
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.45, 3, 6), navy);
  leftLeg.position.set(-0.14, 0.4, 0);
  group.add(leftLeg);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.14;
  group.add(rightLeg);
  group.userData = { leftLeg, rightLeg };
  return group;
}

export function createPolice(scene, seed) {
  return {
    scene,
    random: createRandom((seed ^ 0x5077c1e5) >>> 0),
    cars: [],
    cops: [],
    /** Seconds since the chase clock started; drives the light-bar flash. */
    time: 0,
    /** Seconds since any unit last saw the player. */
    unseenTimer: 0,
    /** Seconds a unit has stayed close while the player was slow. */
    bustedTimer: 0,
    /** Cooldown before ramming a patrol car can raise the wanted level again. */
    ramCooldown: 0,
    /** True once the player has been unseen for a beat: the HUD says EVADING. */
    evading: false,
  };
}

/** A spawn spot on a street, roughly one spawn-distance from the player. */
function spawnSpot(police, px, pz) {
  const random = police.random;
  const alongX = random() < 0.5;
  const line = randomPick(random, STREET_LINES);
  const dir = random() < 0.5 ? 1 : -1;
  const lane = random() < 0.5 ? 3 : -3;
  const at = Math.max(-CITY.halfExtent, Math.min(CITY.halfExtent, (alongX ? px : pz) + dir * POLICE.spawnDistance));
  return alongX ? { x: at, z: line + lane } : { x: line + lane, z: at };
}

/** A foot-cop spawn: a short run from the player, on a nearby sidewalk. */
function copSpot(police, px, pz) {
  const angle = police.random() * Math.PI * 2;
  const dist = 18 + police.random() * 8;
  return {
    x: Math.max(-CITY.halfExtent, Math.min(CITY.halfExtent, px + Math.cos(angle) * dist)),
    z: Math.max(-CITY.halfExtent, Math.min(CITY.halfExtent, pz + Math.sin(angle) * dist)),
  };
}

/**
 * One fixed step of the chase. `world` carries the wanted level, the player's
 * position and speed, whether she is driving, the driven car, and the city's
 * colliders. Returns what happened: busted, any wanted-level change, and whether
 * the player just rammed a patrol car.
 */
export function stepPolice(police, world, dt) {
  police.time += dt;
  if (police.ramCooldown > 0) police.ramCooldown -= dt;
  const result = { busted: false, wantedDelta: 0, rammed: false, rammedFoot: false, ramDamage: 0 };
  const wanted = Math.max(0, Math.min(5, world.wanted));

  // --- Patrol cars: one per wanted star, up to the cap. ---
  const desiredCars = wanted >= 1 ? Math.min(wanted, POLICE.maxCars) : 0;
  while (police.cars.length < desiredCars) {
    const spot = spawnSpot(police, world.x, world.z);
    const mesh = makePoliceCar();
    mesh.position.set(spot.x, 0, spot.z);
    police.scene.add(mesh);
    police.cars.push({ mesh, x: spot.x, z: spot.z, heading: 0, speed: 0, ramHitCooldown: 0, blockedTimer: 0 });
  }
  while (police.cars.length > desiredCars) {
    // Retire the furthest car first: the closest ones are the chase.
    let far = 0;
    for (let i = 1; i < police.cars.length; i += 1) {
      if (distance(police.cars[i], world) > distance(police.cars[far], world)) far = i;
    }
    const [gone] = police.cars.splice(far, 1);
    police.scene.remove(gone.mesh);
  }

  for (const car of police.cars) {
    if (car.ramHitCooldown > 0) car.ramHitCooldown -= dt;
    const dx = world.x - car.x;
    const dz = world.z - car.z;
    const dist = Math.hypot(dx, dz) || 1;
    // Steer toward the player, up to the turn rate.
    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-POLICE.turnRate * dt, Math.min(POLICE.turnRate * dt, diff));
    // Faster with every star; at five stars they can just about keep up.
    const targetSpeed = Math.min(POLICE.chaseSpeed + wanted * POLICE.chaseSpeedPerStar, 34);
    car.speed = Math.min(targetSpeed, car.speed + 16 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.x = Math.max(CITY.beachX - 92, Math.min(CITY.halfExtent + 8, car.x));
    car.z = Math.max(-CITY.halfExtent - 8, Math.min(CITY.halfExtent + 8, car.z));
    const blocked = resolveCircle(car, 1.7, world.colliders);
    if (blocked) {
      // Pinned against a building: bleed speed and swing around it.
      car.blockedTimer += dt;
      car.speed *= 0.5;
      if (car.blockedTimer > 0.7) car.heading += 1.4 * dt;
    } else {
      car.blockedTimer = 0;
    }
    // Ramming the player: slow the driven car hard, and ramming a patrol car
    // at speed is a fresh crime — the wanted level goes up. On foot there is
    // no car to slow: the patrol car runs Marisol down instead, dealing
    // speed-scaled damage (reported as ramDamage for the health system to
    // apply), at most once a second per car so she is not insta-killed.
    if (dist < POLICE.ramDistance) {
      if (world.driving && world.driven) {
        if (world.speed > POLICE.ramSpeed && police.ramCooldown <= 0) {
          result.wantedDelta += 1;
          result.rammed = true;
          police.ramCooldown = POLICE.ramCooldown;
        }
        if (car.ramHitCooldown <= 0) {
          world.driven.speed *= 0.55;
          car.ramHitCooldown = 1;
        }
        car.speed *= 0.6;
      } else if (!world.driving && car.ramHitCooldown <= 0) {
        const damage = patrolRamDamage(car.speed);
        if (damage > 0) {
          result.ramDamage = Math.max(result.ramDamage, damage);
          result.rammedFoot = true;
          car.ramHitCooldown = 1;
          car.speed *= 0.65;
        }
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }

  // --- Foot cops: only when the heat is high and Marisol is on foot. ---
  const desiredCops = wanted >= POLICE.copWanted && !world.driving
    ? Math.min(wanted - POLICE.copWanted + 1, POLICE.maxCops)
    : 0;
  while (police.cops.length < desiredCops) {
    const spot = copSpot(police, world.x, world.z);
    const mesh = makeCop();
    mesh.position.set(spot.x, 0, spot.z);
    police.scene.add(mesh);
    police.cops.push({ mesh, x: spot.x, z: spot.z, heading: 0, phase: 0 });
  }
  while (police.cops.length > desiredCops) {
    let far = 0;
    for (let i = 1; i < police.cops.length; i += 1) {
      if (distance(police.cops[i], world) > distance(police.cops[far], world)) far = i;
    }
    const [gone] = police.cops.splice(far, 1);
    police.scene.remove(gone.mesh);
  }
  for (const cop of police.cops) {
    const dx = world.x - cop.x;
    const dz = world.z - cop.z;
    const dist = Math.hypot(dx, dz) || 1;
    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.heading += Math.max(-6 * dt, Math.min(6 * dt, diff));
    // A touch slower than a sprinting Marisol, so running away stays possible.
    cop.x += Math.sin(cop.heading) * POLICE.copSpeed * dt;
    cop.z += Math.cos(cop.heading) * POLICE.copSpeed * dt;
    cop.x = Math.max(CITY.beachX - 92, Math.min(CITY.halfExtent + 8, cop.x));
    cop.z = Math.max(-CITY.halfExtent - 8, Math.min(CITY.halfExtent + 8, cop.z));
    resolveCircle(cop, 0.55, world.colliders);
    cop.phase += dt * POLICE.copSpeed * 1.4;
    const swing = Math.sin(cop.phase) * 0.6;
    cop.mesh.userData.leftLeg.rotation.x = swing;
    cop.mesh.userData.rightLeg.rotation.x = -swing;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
  }

  // --- Seen, evading, and busted. ---
  let nearest = Infinity;
  for (const car of police.cars) nearest = Math.min(nearest, distance(car, world));
  for (const cop of police.cops) nearest = Math.min(nearest, distance(cop, world));
  const seen = nearest <= POLICE.sightDistance;
  if (wanted === 0) {
    police.unseenTimer = 0;
    police.evading = false;
    police.bustedTimer = 0;
  } else if (seen) {
    police.unseenTimer = 0;
    police.evading = false;
  } else {
    police.unseenTimer += dt;
    if (police.unseenTimer > 1) police.evading = true;
    if (police.unseenTimer >= POLICE.evadeSeconds) {
      // Out of sight long enough: the heat cools by one star.
      result.wantedDelta -= 1;
      police.unseenTimer = 0;
      police.evading = false;
    }
  }
  const closeEnough = nearest <= (world.driving ? POLICE.bustDistance : POLICE.bustFootDistance);
  if (wanted > 0 && closeEnough && world.speed < POLICE.bustSpeed) {
    police.bustedTimer += dt;
    if (police.bustedTimer >= POLICE.bustSeconds) {
      result.busted = true;
      police.bustedTimer = 0;
    }
  } else {
    police.bustedTimer = Math.max(0, police.bustedTimer - dt * 2);
  }

  // The light bars flash red, blue, red, blue.
  const flashRed = Math.floor(police.time * 5) % 2 === 0;
  for (const car of police.cars) {
    car.mesh.userData.lightRed.visible = flashRed;
    car.mesh.userData.lightBlue.visible = !flashRed;
  }
  return result;
}

/** Stage a chase for a screenshot: put `count` patrol cars right behind (x, z), facing `heading`, at `speed` so they hold formation instead of falling back. */
export function stageChase(police, x, z, heading, count, speed = 20) {
  const offsets = [
    { back: 5, side: -5.5 },
    { back: 8, side: 5.5 },
    { back: 11, side: -4 },
    { back: 14, side: 4 },
  ];
  for (let i = 0; i < count; i += 1) {
    const off = offsets[i % offsets.length];
    const bx = x - Math.sin(heading) * off.back + Math.cos(heading) * off.side;
    const bz = z - Math.cos(heading) * off.back - Math.sin(heading) * off.side;
    const mesh = makePoliceCar();
    mesh.position.set(bx, 0, bz);
    mesh.rotation.y = heading;
    police.scene.add(mesh);
    police.cars.push({ mesh, x: bx, z: bz, heading, speed, ramHitCooldown: 0, blockedTimer: 0 });
  }
}

/** Take every unit off the streets and reset the chase timers. */
export function clearPolice(police) {
  for (const car of police.cars) police.scene.remove(car.mesh);
  for (const cop of police.cops) police.scene.remove(cop.mesh);
  police.cars = [];
  police.cops = [];
  police.unseenTimer = 0;
  police.bustedTimer = 0;
  police.ramCooldown = 0;
  police.evading = false;
}

/** Patrol cars and foot cops as minimap dots — the HUD flashes them red/blue. */
export function policeDots(police) {
  const dots = [];
  for (const car of police.cars) dots.push({ x: car.x, z: car.z, kind: 'police' });
  for (const cop of police.cops) dots.push({ x: cop.x, z: cop.z, kind: 'police' });
  return dots;
}
