// Traffic and pedestrians: low-poly cars cruising the street grid and walkers on the
// sidewalks. Both are driven by the seeded generator and the fixed-step loop, so a
// given seed always puts the same car in the same place at the same time.
import * as THREE from 'three';
import { CITY, PALETTE, STREET_LINES, TRAFFIC } from './config.js';
import { createRandom, randomPick } from './random.js';

/** A low-poly car: body, cabin, four wheels, headlights that glow at dusk. */
export function makeCar(color) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2436, roughness: 0.15, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), paint);
  body.position.y = 0.65;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2), glass);
  cabin.position.set(0, 1.3, -0.2);
  cabin.castShadow = true;
  car.add(cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    wheel.castShadow = true;
    car.add(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const x of [-0.6, 0.6]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.1), lightMat);
    light.position.set(x, 0.7, 2.22);
    car.add(light);
  }
  return car;
}

/** A low-poly pedestrian: capsule body, head, legs that swing while walking. */
function makePedestrian(color) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.55, 4, 8), cloth);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.y = 1.55;
  group.add(head);
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.4, 3, 6), cloth);
  leftLeg.position.set(-0.12, 0.35, 0);
  group.add(leftLeg);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.12;
  group.add(rightLeg);
  group.userData = { leftLeg, rightLeg };
  return group;
}

export function createTraffic(scene, seed) {
  const random = createRandom(seed ^ 0x5f3759df);
  const cars = [];
  for (let i = 0; i < TRAFFIC.cars; i += 1) {
    const alongX = random() < 0.5;
    const line = randomPick(random, STREET_LINES);
    const direction = random() < 0.5 ? 1 : -1;
    const lane = direction > 0 ? 3 : -3;
    const car = makeCar(randomPick(random, PALETTE.car));
    const start = -CITY.halfExtent + random() * CITY.halfExtent * 2;
    car.position.set(alongX ? start : line + lane, 0, alongX ? line + lane : start);
    car.rotation.y = alongX ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (direction > 0 ? Math.PI : 0);
    scene.add(car);
    cars.push({
      mesh: car, alongX, line, direction, lane,
      speed: TRAFFIC.carSpeed + (random() - 0.5) * TRAFFIC.carSpeedJitter,
      at: start,
    });
  }

  const pedestrians = [];
  for (let i = 0; i < TRAFFIC.pedestrians; i += 1) {
    const alongX = random() < 0.5;
    const line = randomPick(random, STREET_LINES);
    const side = random() < 0.5 ? 8.5 : -8.5;
    const walker = makePedestrian(randomPick(random, PALETTE.ped));
    const start = -CITY.halfExtent + random() * CITY.halfExtent * 2;
    walker.position.set(alongX ? start : line + side, 0.14, alongX ? line + side : start);
    scene.add(walker);
    pedestrians.push({
      mesh: walker, alongX, line, side,
      direction: random() < 0.5 ? 1 : -1,
      speed: TRAFFIC.pedSpeed * (0.7 + random() * 0.6),
      at: start,
      phase: random() * Math.PI * 2,
      pause: 0,
    });
  }
  return { cars, pedestrians };
}

/** One fixed step: cars cruise their lane and wrap at the city edge; walkers stroll and pause. */
export function stepTraffic(traffic, dt) {
  for (const car of traffic.cars) {
    car.at += car.direction * car.speed * dt;
    if (car.at > CITY.halfExtent + 10) car.at = -CITY.halfExtent - 10;
    if (car.at < -CITY.halfExtent - 10) car.at = CITY.halfExtent + 10;
    if (car.alongX) car.mesh.position.set(car.at, 0, car.line + car.lane);
    else car.mesh.position.set(car.line + car.lane, 0, car.at);
  }
  for (const ped of traffic.pedestrians) {
    if (ped.pause > 0) {
      ped.pause -= dt;
    } else {
      ped.at += ped.direction * ped.speed * dt;
      ped.phase += dt * ped.speed * 4;
      if (ped.at > CITY.halfExtent) { ped.at = CITY.halfExtent; ped.direction = -1; ped.pause = 1; }
      if (ped.at < -CITY.halfExtent) { ped.at = -CITY.halfExtent; ped.direction = 1; ped.pause = 0; }
    }
    if (ped.alongX) {
      ped.mesh.position.set(ped.at, 0.14, ped.line + ped.side);
      ped.mesh.rotation.y = ped.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      ped.mesh.position.set(ped.line + ped.side, 0.14, ped.at);
      ped.mesh.rotation.y = ped.direction > 0 ? Math.PI : 0;
    }
    const swing = Math.sin(ped.phase) * 0.5;
    ped.mesh.userData.leftLeg.rotation.x = swing;
    ped.mesh.userData.rightLeg.rotation.x = -swing;
  }
}

/** Positions for the minimap: cars as dots, pedestrians as fainter dots. */
export function trafficDots(traffic) {
  const dots = [];
  for (const car of traffic.cars) dots.push({ x: car.mesh.position.x, z: car.mesh.position.z, kind: 'car' });
  for (const ped of traffic.pedestrians) dots.push({ x: ped.mesh.position.x, z: ped.mesh.position.z, kind: 'ped' });
  return dots;
}
