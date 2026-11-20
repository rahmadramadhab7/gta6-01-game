// Vice Shores — every tuning number and colour in one place. The city is a
// 5x5 grid of blocks on a flat plane, centred on (0, 0), streets running north-south
// and east-west. One world unit is about one metre.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** City geometry: block size, street width, and the pitch between street centrelines. */
export const CITY = {
  blocks: 5,
  blockSize: 34,
  streetWidth: 12,
  pitch: 46,
  /** Half the city extent, streets included: streets run from -115 to +115. */
  halfExtent: 115,
  /** The beach and ocean sit west of the city, past this x. */
  beachX: -138,
};

/** Street centreline positions, one per gap between (and around) the blocks. */
export const STREET_LINES = [-115, -69, -23, 23, 69, 115];

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  radius: 0.55,
  height: 1.8,
  /** How fast the body turns toward the movement direction. */
  turnRate: 12,
};

export const CAMERA = {
  distance: 9.5,
  height: 4.2,
  /** How fast the camera catches up to the player (per second). */
  followRate: 6,
  minPitch: 0.12,
  maxPitch: 0.9,
};

export const TRAFFIC = {
  cars: 12,
  pedestrians: 14,
  carSpeed: 9,
  carSpeedJitter: 4,
  pedSpeed: 1.4,
};

/** Arcade driving: how a stolen car accelerates, brakes, turns and bounces. */
export const VEHICLE = {
  accel: 16,
  brake: 26,
  reverseAccel: 9,
  maxSpeed: 34,
  maxReverse: 11,
  /** Steering rate at full speed, radians per second. */
  turnRate: 2.1,
  /** Collision circle radius of a car, in world units. */
  radius: 1.7,
  /** How close Marisol must stand to a car to steal it. */
  stealDistance: 3.6,
};

/** The Vice Shores PD: how many units answer each wanted star, how fast they
 *  chase, how close they must stay to make an arrest, and how long out of sight
 *  it takes for the heat to cool. */
export const POLICE = {
  /** Most patrol cars on the streets at once (one per star, up to this). */
  maxCars: 4,
  /** How far from the player a fresh patrol car appears. */
  spawnDistance: 50,
  /** A patrol car farther than this from the player is pulled off the chase. */
  despawnDistance: 130,
  /** Inside this distance a unit has eyes on the player; outside it, she is hiding. */
  sightDistance: 55,
  /** Chase speed at wanted 1, plus this per extra star. */
  chaseSpeed: 26,
  chaseSpeedPerStar: 1.6,
  /** How fast a patrol car turns toward the player, radians per second. */
  turnRate: 2.4,
  /** A patrol car this close is ramming the player. */
  ramDistance: 3.9,
  /** Ramming a patrol car above this speed (mph) raises the wanted level. */
  ramSpeed: 12,
  /** Seconds before another ram can raise the wanted level again. */
  ramCooldown: 5,
  /** On foot, a patrol car slower than this (world units/s) only bumps Marisol: no damage. */
  footRamMinSpeed: 6,
  /** On-foot ram damage per unit of patrol-car speed, before the caps below. */
  footRamDamageScale: 0.7,
  /** On-foot ram damage is clamped between these two numbers. */
  footRamMinDamage: 6,
  footRamMaxDamage: 22,
  /** A patrol car this close can make the arrest (player in a car). */
  bustDistance: 4.5,
  /** A foot cop this close can make the arrest (player on foot). */
  bustFootDistance: 2.6,
  /** The player must be slower than this (mph) to be busted. */
  bustSpeed: 3,
  /** Seconds a unit must stay close to a slow player before the bust. */
  bustSeconds: 3,
  /** Seconds unseen before the wanted level drops by one star. */
  evadeSeconds: 8,
  /** Foot-cop running speed: a touch slower than Marisol's sprint. */
  copSpeed: 9.5,
  /** Most foot cops on the streets at once. */
  maxCops: 2,
  /** Wanted level at which foot cops join the chase. */
  copWanted: 3,
};

export const CLOCK = {
  /** In-game minutes that pass per real second while playing. */
  minutesPerSecond: 1,
  /** Day 1 opens at golden hour. */
  startDay: 1,
  startMinutes: 17 * 60 + 42,
};

/** Where a save is kept between visits (this browser only). */
export const SAVE_KEY = 'vice-shores.save.v1';

export const START = {
  cash: 1250,
  health: 100,
  wanted: 0,
  objective: 'Meet Rico at the Marina Pier',
  spawn: { x: 23, z: 96, heading: Math.PI },
};

export const PALETTE = {
  skyTop: 0x2b3a6e,
  skyHorizon: 0xff9a56,
  sun: 0xffd166,
  fog: 0xe88a4f,
  ground: 0x3a3340,
  asphalt: 0x2e2a33,
  sidewalk: 0x8d8272,
  laneMark: 0xd8c25a,
  crosswalk: 0xe8e2d4,
  ocean: 0x2e6f8e,
  sand: 0xd9b380,
  building: [0xe8a87c, 0xd97b6c, 0x7fb5a8, 0xe5c07b, 0x9b8ec4, 0xc46b5d, 0x6fa8a0, 0xdd9a5b],
  windowLit: 0xffd166,
  windowDark: 0x2c3550,
  car: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x7d3c98, 0x1abc9c, 0xe67e22, 0x95a5a6, 0x34495e],
  ped: [0xe74c3c, 0x3498db, 0xf39c12, 0x2ecc71, 0x9b59b6, 0xecf0f1],
  playerJacket: 0x1f8a70,
  playerPants: 0x2c3550,
  playerSkin: 0xc98d64,
  playerCap: 0xff7a59,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
