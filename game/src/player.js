// Marisol Vega on foot: a low-poly walker with a third-person chase camera.
// WASD moves relative to the camera; dragging the mouse orbits the camera.
import * as THREE from 'three';
import { CAMERA, CITY, PALETTE, PLAYER, STEP } from './config.js';

/** A simple low-poly person: capsule body, head, cap, arms that swing while walking. */
function buildCharacter() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: PALETTE.playerJacket, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: PALETTE.playerPants, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: PALETTE.playerSkin, roughness: 0.7 });
  const cap = new THREE.MeshStandardMaterial({ color: PALETTE.playerCap, roughness: 0.8 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.62, 4, 10), jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.12, 12), cap);
  hat.position.y = 1.92;
  group.add(hat);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.26), cap);
  brim.position.set(0, 1.87, 0.24);
  group.add(brim);
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 3, 8), jacket);
  leftArm.position.set(-0.44, 1.1, 0);
  leftArm.castShadow = true;
  group.add(leftArm);
  const rightArm = leftArm.clone();
  rightArm.position.x = 0.44;
  group.add(rightArm);
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 3, 8), pants);
  leftLeg.position.set(-0.16, 0.42, 0);
  group.add(leftLeg);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.16;
  group.add(rightLeg);
  // The job package: a small crate strapped to the back, shown while Marisol
  // carries a delivery (M2) or the heist lockbox (M5).
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.4, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x8a6b3f, roughness: 0.9 }),
  );
  crate.position.set(0, 1.25, -0.42);
  crate.visible = false;
  group.add(crate);
  group.userData = { leftArm, rightArm, leftLeg, rightLeg, crate };
  return group;
}

/** Push a circle (the player) out of an axis-aligned box it overlaps. */
function resolveColliders(position, radius, colliders) {
  for (const box of colliders) {
    const nearX = Math.max(box.minX, Math.min(position.x, box.maxX));
    const nearZ = Math.max(box.minZ, Math.min(position.z, box.maxZ));
    const dx = position.x - nearX;
    const dz = position.z - nearZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      position.x = nearX + (dx / dist) * radius;
      position.z = nearZ + (dz / dist) * radius;
    } else {
      // Dead centre of the box: shove out along the nearer face.
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
}

export function createPlayer(scene, spawn) {
  const group = buildCharacter();
  group.position.set(spawn.x, 0, spawn.z);
  scene.add(group);
  const state = {
    group,
    x: spawn.x,
    z: spawn.z,
    heading: spawn.heading,
    cameraYaw: spawn.heading + Math.PI,
    cameraPitch: 0.32,
    speed: 0,
    walkPhase: 0,
    moving: false,
  };
  return state;
}

/** One fixed step of walking: input is camera-relative, the body turns toward travel. */
export function stepPlayer(state, input, colliders, dt = STEP) {
  const forward = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  const left = input.left ? 1 : 0;
  const right = input.right ? 1 : 0;
  const moveX = right - left;
  const moveZ = forward - back;
  const running = input.run;
  state.moving = moveX !== 0 || moveZ !== 0;
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  if (state.moving) {
    // Camera-relative directions: forward is away from the camera.
    const sin = Math.sin(state.cameraYaw);
    const cos = Math.cos(state.cameraYaw);
    // Forward is from the camera toward the player; right is 90 degrees clockwise of it.
    const dirX = -sin * moveZ + cos * moveX;
    const dirZ = -cos * moveZ - sin * moveX;
    const length = Math.hypot(dirX, dirZ) || 1;
    const targetHeading = Math.atan2(dirX, dirZ);
    let diff = targetHeading - state.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.heading += Math.max(-PLAYER.turnRate * dt, Math.min(PLAYER.turnRate * dt, diff));
    state.x += (dirX / length) * speed * dt;
    state.z += (dirZ / length) * speed * dt;
    state.speed = speed;
    state.walkPhase += dt * speed * 1.6;
  } else {
    state.speed = 0;
  }
  // Keep the player inside the playable map (city + beach + pier).
  state.x = Math.max(CITY.beachX - 92, Math.min(CITY.halfExtent + 8, state.x));
  state.z = Math.max(-CITY.halfExtent - 8, Math.min(CITY.halfExtent + 8, state.z));
  resolveColliders(state, PLAYER.radius, colliders);
  state.group.position.set(state.x, 0, state.z);
  state.group.rotation.y = state.heading;
  const swing = state.moving ? Math.sin(state.walkPhase) * 0.55 : 0;
  const parts = state.group.userData;
  parts.leftArm.rotation.x = swing;
  parts.rightArm.rotation.x = -swing;
  parts.leftLeg.rotation.x = -swing;
  parts.rightLeg.rotation.x = swing;
}

/** Show or hide the job package on Marisol's back (M2 delivery, M5 lockbox). */
export function setCarrying(state, carrying) {
  state.group.userData.crate.visible = !!carrying;
  state.carrying = !!carrying;
}

/** Chase camera: behind the player at the orbit yaw, looking slightly down at them. */
export function updateCamera(state, camera, dt = STEP) {
  const targetYaw = state.cameraYaw;
  const desiredX = state.x + Math.sin(targetYaw) * CAMERA.distance;
  const desiredZ = state.z + Math.cos(targetYaw) * CAMERA.distance;
  const desiredY = CAMERA.height + Math.sin(state.cameraPitch) * 4;
  const k = 1 - Math.exp(-CAMERA.followRate * dt);
  camera.position.x += (desiredX - camera.position.x) * k;
  camera.position.y += (desiredY - camera.position.y) * k;
  camera.position.z += (desiredZ - camera.position.z) * k;
  camera.lookAt(state.x, 1.6, state.z);
}

/** Snap the camera behind the player at once (used when staging a screenshot). */
export function snapCamera(state, camera) {
  camera.position.set(
    state.x + Math.sin(state.cameraYaw) * CAMERA.distance,
    CAMERA.height + Math.sin(state.cameraPitch) * 4,
    state.z + Math.cos(state.cameraYaw) * CAMERA.distance,
  );
  camera.lookAt(state.x, 1.6, state.z);
}
