// Vice Shores — the city itself: a procedural low-poly grid of streets and towers
// under a sunset sky, with a beach and a pier to the west. Everything is generated
// from the seeded random generator, so the same seed builds the same city.
import * as THREE from 'three';
import { CITY, PALETTE, STREET_LINES } from './config.js';
import { createRandom, randomInt, randomPick } from './random.js';

/** Block centres, one per gap between the street lines. */
const BLOCK_CENTRES = [-92, -46, 0, 46, 92];

/** A canvas texture of lit and dark windows, repeated across a building's faces. */
function makeWindowTexture(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#565b68';
  ctx.fillRect(0, 0, 64, 128);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = random() < 0.45;
      ctx.fillStyle = lit ? '#ffd166' : '#2c3550';
      ctx.fillRect(6 + col * 14, 8 + row * 15, 9, 10);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A radial glow texture for the sun, drawn once on a canvas. */
function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 214, 102, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 154, 86, 0.55)');
  gradient.addColorStop(1, 'rgba(255, 154, 86, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The sunset sky: a big inverted sphere whose colour grades from dusk blue overhead to orange at the horizon. */
function buildSky(scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    },
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vPos; uniform vec3 top; uniform vec3 horizon; void main() { float h = clamp(normalize(vPos).y * 1.6 + 0.12, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.8)), 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(620, 24, 16), material);
  scene.add(sky);

  // The low sun, hanging over the ocean to the west.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sun.position.set(-520, 78, 40);
  sun.lookAt(0, 40, 0);
  scene.add(sun);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), transparent: true, depthWrite: false, fog: false,
  }));
  glow.scale.set(220, 220, 1);
  glow.position.copy(sun.position);
  scene.add(glow);
}

/** Ground, asphalt, sidewalks, lane dashes and crosswalks for the whole grid. */
function buildStreets(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.halfExtent * 2 + CITY.streetWidth, CITY.halfExtent * 2 + CITY.streetWidth),
    new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.95 }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0;
  asphalt.receiveShadow = true;
  scene.add(asphalt);

  const sidewalkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
  const laneMat = new THREE.MeshBasicMaterial({ color: PALETTE.laneMark });
  const crossMat = new THREE.MeshBasicMaterial({ color: PALETTE.crosswalk });

  // One raised sidewalk slab per block, with a dashed centre line down every street.
  for (const bx of BLOCK_CENTRES) {
    for (const bz of BLOCK_CENTRES) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(CITY.blockSize, 0.14, CITY.blockSize), sidewalkMat);
      slab.position.set(bx, 0.07, bz);
      slab.receiveShadow = true;
      scene.add(slab);
    }
  }
  for (const line of STREET_LINES) {
    for (let t = -CITY.halfExtent; t < CITY.halfExtent; t += 8) {
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), laneMat);
      dashV.rotation.x = -Math.PI / 2;
      dashV.position.set(line, 0.02, t + 2);
      scene.add(dashV);
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), laneMat);
      dashH.rotation.x = -Math.PI / 2;
      dashH.position.set(t + 2, 0.02, line);
      scene.add(dashH);
    }
    // Crosswalk stripes where this street meets the cross streets.
    for (const cross of STREET_LINES) {
      for (let s = -4; s <= 4; s += 2) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.4), crossMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(cross + s, 0.02, line + 5.2);
        scene.add(stripe);
        const stripe2 = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.9), crossMat);
        stripe2.rotation.x = -Math.PI / 2;
        stripe2.position.set(line + 5.2, 0.02, cross + s);
        scene.add(stripe2);
      }
    }
  }
}

/** The beach, the ocean and the Marina Pier west of the city. */
function buildBeach(scene) {
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 280),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.beachX - 13, 0.02, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 560),
    new THREE.MeshStandardMaterial({ color: PALETTE.ocean, roughness: 0.25, metalness: 0.1 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(CITY.beachX - 136, -0.4, 0);
  scene.add(ocean);

  // Marina Pier: wooden boards on posts, running west from the central avenue.
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4f, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(70, 0.6, 10), pierMat);
  pier.position.set(CITY.beachX - 52, 0.8, 23);
  pier.castShadow = true;
  pier.receiveShadow = true;
  scene.add(pier);
  for (let x = -8; x < 70; x += 10) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 6), pierMat);
    post.position.set(CITY.beachX - 18 - x, -0.2, 23 + 4.4);
    scene.add(post);
    const post2 = post.clone();
    post2.position.z = 23 - 4.4;
    scene.add(post2);
  }
  // A small bait shack at the pier's end, where Rico waits.
  const shack = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.4, 5),
    new THREE.MeshStandardMaterial({ color: 0x7fb5a8, roughness: 0.9 }),
  );
  shack.position.set(CITY.beachX - 84, 2.5, 23);
  shack.castShadow = true;
  scene.add(shack);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(5.2, 2, 4),
    new THREE.MeshStandardMaterial({ color: 0xc46b5d, roughness: 0.9 }),
  );
  roof.position.set(CITY.beachX - 84, 5.2, 23);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  scene.add(roof);
}

/** One low-poly palm: a leaning trunk and six flattened fronds. */
function makePalm(trunkMat, frondMat) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5.4, 6), trunkMat);
  trunk.position.y = 2.7;
  trunk.rotation.z = 0.08;
  trunk.castShadow = true;
  palm.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 4), frondMat);
    frond.scale.set(1, 1, 0.22);
    const angle = (i / 6) * Math.PI * 2;
    frond.position.set(Math.cos(angle) * 1.3, 5.6, Math.sin(angle) * 1.3);
    frond.rotation.set(Math.sin(angle) * 1.1, 0, -Math.cos(angle) * 1.1);
    frond.castShadow = true;
    palm.add(frond);
  }
  return palm;
}

/** Buildings, palms and street lamps, plus the collision boxes the player walks around. */
function buildProps(scene, random) {
  const colliders = [];
  const windowTexture = makeWindowTexture(random);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3f7d4e, roughness: 1 });
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.7, metalness: 0.4 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });

  for (const bx of BLOCK_CENTRES) {
    for (const bz of BLOCK_CENTRES) {
      const downtown = 1 - Math.hypot(bx, bz) / 150;
      const spots = [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]];
      for (const [ox, oz] of spots) {
        if (random() < 0.12) continue; // an empty lot, now and then
        const w = 10 + random() * 5;
        const d = 10 + random() * 5;
        const h = 8 + downtown * 26 + random() * 12;
        const texture = windowTexture.clone();
        texture.needsUpdate = true;
        texture.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 9)));
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        const material = new THREE.MeshStandardMaterial({
          color: randomPick(random, PALETTE.building),
          map: texture,
          roughness: 0.85,
        });
        const building = new THREE.Mesh(unitBox, material);
        building.scale.set(w, h, d);
        building.position.set(bx + ox, h / 2 + 0.14, bz + oz);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        // A flat roof cap so the top reads as a roofline, not stretched windows.
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
          new THREE.MeshStandardMaterial({ color: 0x3a3340, roughness: 1 }),
        );
        roof.position.set(bx + ox, h + 0.4, bz + oz);
        roof.castShadow = true;
        scene.add(roof);
        colliders.push({
          minX: bx + ox - w / 2, maxX: bx + ox + w / 2,
          minZ: bz + oz - d / 2, maxZ: bz + oz + d / 2,
        });
      }
      // A palm on two corners of every block.
      for (const [px, pz] of [[-15, -15], [15, 15]]) {
        const palm = makePalm(trunkMat, frondMat);
        palm.position.set(bx + px, 0.14, bz + pz);
        scene.add(palm);
      }
    }
  }

  // Street lamps at every intersection.
  for (const line of STREET_LINES) {
    for (const cross of STREET_LINES) {
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6), lampPoleMat);
      pole.position.y = 2.8;
      pole.castShadow = true;
      lamp.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), lampGlowMat);
      bulb.position.y = 5.7;
      lamp.add(bulb);
      lamp.position.set(line + 6.4, 0, cross + 6.4);
      scene.add(lamp);
    }
  }
  return colliders;
}

/** Build the whole city into a scene and return its collision boxes. */
export function createCity(scene, seed) {
  const random = createRandom(seed);
  scene.fog = new THREE.Fog(PALETTE.fog, 160, 560);

  const sunLight = new THREE.DirectionalLight(0xffb36b, 2.6);
  sunLight.position.set(-160, 90, 60);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -150;
  sunLight.shadow.camera.right = 150;
  sunLight.shadow.camera.top = 150;
  sunLight.shadow.camera.bottom = -150;
  sunLight.shadow.camera.far = 500;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
  const hemi = new THREE.HemisphereLight(0x8a7fd6, 0x5a4632, 1.15);
  scene.add(hemi);

  buildSky(scene);
  buildStreets(scene);
  buildBeach(scene);
  const colliders = buildProps(scene, random);
  return { colliders };
}
