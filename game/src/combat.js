// Melee combat on foot: F (or a mouse click) throws a punch. The punch is a
// short-range cone in front of Marisol — it lands on the nearest pedestrian,
// flashes them, knocks them back a step, and scatters a few bright sparks.
// A pedestrian who gets hit runs away down the sidewalk. Punching where the
// law (or another pedestrian) can see it raises the wanted level by one star.
// Foot cops who catch up to Marisol land baton hits on her health; at zero
// health she is WASTED and wakes up at the spawn point, lighter in the wallet.
import * as THREE from 'three';
import { STEP } from './config.js';

/** Punch reach, in world units — just past arm's length. */
export const PUNCH_RANGE = 2.2;
/** Half the punch cone, in radians: the victim must be roughly ahead of her. */
const PUNCH_HALF_ANGLE = Math.PI / 3;
/** Seconds between punches. */
const PUNCH_COOLDOWN = 0.45;
/** Damage one punch deals to a pedestrian. */
const PUNCH_DAMAGE = 25;
/** How far a witness must be to see the punch and call it in. */
const WITNESS_RANGE = 15;
/** How far a police unit must be to see the punch and call it in. */
const POLICE_SEE_RANGE = 40;
/** Baton damage a foot cop deals per hit, and the gap between hits. */
const COP_DAMAGE = 10;
const COP_HIT_COOLDOWN = 1.0;
const COP_HIT_RANGE = 1.4;
/** Health regained per second after 5 s without taking damage. */
const REGEN_PER_SECOND = 2;
const REGEN_DELAY = 5;
/** How long the punch pose and the hit flash last. */
const PUNCH_POSE_SECONDS = 0.22;
const FLASH_SECONDS = 0.18;
/** Cash lost on WASTED: 10% of what she carries, at least $25 when she has any. */
const WASTED_FRACTION = 0.1;
const WASTED_MINIMUM = 25;

function angleDiff(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** A burst of small bright tetrahedra that fly out and fade in ~0.4 s. */
function spawnSparks(scene, x, z) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  const geometry = new THREE.TetrahedronGeometry(0.12);
  const sparks = [];
  for (let i = 0; i < 8; i += 1) {
    const spark = new THREE.Mesh(geometry, material);
    const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 2 + Math.random() * 3;
    spark.position.set(x, 1.2 + Math.random() * 0.5, z);
    group.add(spark);
    sparks.push({ mesh: spark, vx: Math.cos(angle) * speed, vy: 1.5 + Math.random() * 2, vz: Math.sin(angle) * speed });
  }
  scene.add(group);
  return { group, sparks, life: 0.4 };
}

export function createCombat(scene) {
  return {
    scene,
    cooldown: 0,
    /** Seconds left on the punch pose (drives the arm swing). */
    punchTimer: 0,
    /** Seconds since Marisol last took damage (drives health regen). */
    sinceHurt: REGEN_DELAY,
    copHitTimer: 0,
    sparks: [],
    flashes: [],
  };
}

/**
 * Throw a punch. Returns null while cooling down, otherwise what happened:
 * `{ hit, victim, witnessed, damage }`. `victim` is the pedestrian record (or
 * null on a whiff); `witnessed` is true when a cop or another pedestrian saw it.
 */
export function tryPunch(combat, player, traffic, police) {
  if (combat.cooldown > 0) return null;
  combat.cooldown = PUNCH_COOLDOWN;
  combat.punchTimer = PUNCH_POSE_SECONDS;
  // The punch pose, right away so a still screenshot catches the swing.
  const parts = player.group.userData;
  if (parts && parts.rightArm) parts.rightArm.rotation.x = -1.9;

  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  let victim = null;
  let bestDist = PUNCH_RANGE;
  for (const ped of traffic.pedestrians) {
    const dx = ped.mesh.position.x - player.x;
    const dz = ped.mesh.position.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > bestDist) continue;
    const angle = Math.atan2(dx, dz);
    if (Math.abs(angleDiff(angle, player.heading)) > PUNCH_HALF_ANGLE) continue;
    victim = ped;
    bestDist = dist;
  }

  let witnessed = false;
  if (victim) {
    // The victim flashes red, staggers back, then runs away down the sidewalk.
    const body = victim.mesh.children[0];
    if (body && body.material && body.material.emissive) {
      const original = body.material.emissive.getHex();
      body.material.emissive.setHex(0xaa2211);
      combat.flashes.push({ material: body.material, original, timer: FLASH_SECONDS });
    }
    const awayX = victim.mesh.position.x - player.x;
    const awayZ = victim.mesh.position.z - player.z;
    const awayLen = Math.hypot(awayX, awayZ) || 1;
    victim.mesh.position.x += (awayX / awayLen) * 1.2;
    victim.mesh.position.z += (awayZ / awayLen) * 1.2;
    // Flee along the sidewalk: flip toward the away direction and sprint.
    if (victim.alongX) {
      victim.direction = awayX >= 0 ? 1 : -1;
      victim.at = victim.mesh.position.x;
    } else {
      victim.direction = awayZ >= 0 ? 1 : -1;
      victim.at = victim.mesh.position.z;
    }
    victim.speed = 5.5;
    victim.fleeTimer = 2.5;
    victim.pause = 0;
    victim.hp = (victim.hp ?? 100) - PUNCH_DAMAGE;
    combat.sparks.push(spawnSparks(combat.scene, victim.mesh.position.x, victim.mesh.position.z));
    // Witnesses: any other pedestrian close by, or any police unit in sight.
    for (const other of traffic.pedestrians) {
      if (other === victim) continue;
      if (Math.hypot(other.mesh.position.x - player.x, other.mesh.position.z - player.z) < WITNESS_RANGE) {
        witnessed = true;
        break;
      }
    }
    if (!witnessed && police) {
      for (const car of police.cars) {
        if (Math.hypot(car.x - player.x, car.z - player.z) < POLICE_SEE_RANGE) { witnessed = true; break; }
      }
      if (!witnessed) {
        for (const cop of police.cops) {
          if (Math.hypot(cop.x - player.x, cop.z - player.z) < POLICE_SEE_RANGE) { witnessed = true; break; }
        }
      }
    }
  }
  return { hit: !!victim, victim, witnessed, damage: victim ? PUNCH_DAMAGE : 0 };
}

/**
 * One fixed step: cooldowns, the punch pose, sparks, flashes, fleeing
 * pedestrians slowing back to a stroll, foot-cop baton hits, and health regen.
 * Returns `{ wasted: true }` the step Marisol's health reaches zero.
 */
export function stepCombat(combat, player, traffic, police, health, dt = STEP) {
  if (combat.cooldown > 0) combat.cooldown -= dt;
  combat.sinceHurt += dt;
  if (combat.copHitTimer > 0) combat.copHitTimer -= dt;

  // The punch pose eases back into the walk swing as the timer runs out.
  if (combat.punchTimer > 0) {
    combat.punchTimer -= dt;
    const parts = player.group.userData;
    if (parts && parts.rightArm) {
      const progress = Math.max(0, combat.punchTimer / PUNCH_POSE_SECONDS);
      parts.rightArm.rotation.x = -1.9 * Math.sin(progress * Math.PI * 0.5 + 0.001);
      if (combat.punchTimer <= 0) parts.rightArm.rotation.x = 0;
    }
  }

  for (const burst of combat.sparks) {
    burst.life -= dt;
    for (const spark of burst.sparks) {
      spark.mesh.position.x += spark.vx * dt;
      spark.mesh.position.y += spark.vy * dt;
      spark.mesh.position.z += spark.vz * dt;
      spark.vy -= 9 * dt;
    }
    burst.group.visible = burst.life > 0;
  }
  combat.sparks = combat.sparks.filter((burst) => {
    if (burst.life <= 0) {
      combat.scene.remove(burst.group);
      return false;
    }
    return true;
  });

  for (const flash of combat.flashes) {
    flash.timer -= dt;
    if (flash.timer <= 0) flash.material.emissive.setHex(flash.original);
  }
  combat.flashes = combat.flashes.filter((flash) => flash.timer > 0);

  // A fleeing pedestrian sprints for a couple of seconds, then walks again.
  for (const ped of traffic.pedestrians) {
    if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.speed = 1.4;
    }
  }

  let nextHealth = health;
  // Foot cops who catch Marisol land a baton hit about once a second.
  if (police && combat.copHitTimer <= 0) {
    for (const cop of police.cops) {
      const dist = Math.hypot(cop.x - player.x, cop.z - player.z);
      if (dist < COP_HIT_RANGE) {
        nextHealth = Math.max(0, nextHealth - COP_DAMAGE);
        combat.copHitTimer = COP_HIT_COOLDOWN;
        combat.sinceHurt = 0;
        break;
      }
    }
  }
  // Slow regen once the beating has stopped for a while.
  if (combat.sinceHurt >= REGEN_DELAY && nextHealth > 0 && nextHealth < 100) {
    nextHealth = Math.min(100, nextHealth + REGEN_PER_SECOND * dt);
  }
  return { wasted: nextHealth <= 0, health: nextHealth };
}

/**
 * Apply direct damage to Marisol's health through the same bookkeeping as
 * every other hit: the regen clock restarts, health clamps at zero, and the
 * caller learns whether she is WASTED. Used by patrol-car rams on foot.
 * Returns `{ health, wasted }`.
 */
export function applyDamage(combat, health, amount) {
  if (!(amount > 0)) return { health, wasted: health <= 0 };
  combat.sinceHurt = 0;
  const next = Math.max(0, health - amount);
  return { health: next, wasted: next <= 0 };
}

/** Cash lost when WASTED: 10% of the wallet, at least $25 when there is cash. */
export function wastedFine(cash) {
  if (cash <= 0) return 0;
  return Math.max(WASTED_MINIMUM, Math.floor(cash * WASTED_FRACTION));
}
