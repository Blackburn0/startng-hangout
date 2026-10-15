// The start.ng character: the same 3D person as the start.ng profile (startng-fe src/three/human.ts),
// plus walking. In metres, about 1.7-1.75 m tall, facing +z. Keep the look in step with start.ng.
import * as THREE from 'three';

const PI = Math.PI;
const SHOE = '#2a211b';
const GOLD = '#e8b84a';
const LEATHER = '#6b4a2f';
const SCARF = '#c8442f';

// ---- start.ng's starting look for accounts without a character (startng-fe src/character.ts)
const SKINS = ['#5c3a21', '#8d5524', '#a0662f', '#c68642', '#e0ac69', '#f1c27d'];
const HAIR_COLORS = ['#17120f', '#4a2c1a', '#8b5a2b', '#d9a441', '#b8b8b8', '#c0392b'];
const TOPS = ['#ff6b6b', '#1dd1a1', '#a55eea', '#4b7bec', '#f7b731', '#fd9644', '#eb3b5a', '#292a23'];
const BOTTOMS = ['#2b2f4a', '#222f3e', '#3d3d3d', '#4b6584', '#5f3dc4', '#0c6e5a'];
const SECTIONS = {
  female: { hair: ['braids', 'bun', 'ponytail', 'afro', 'short'] },
  male: { hair: ['short', 'afro', 'dreads', 'bald'] },
};

function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

/** The look start.ng gives an account with no character yet, worked out from its id. */
export function styleFor(userId) {
  const pick = (list, salt) => list[hash(userId * 31 + salt) % list.length];
  const body = pick(['female', 'male'], 8);
  return {
    body,
    primaryColor: pick(TOPS, 1),
    secondaryColor: pick(BOTTOMS, 2),
    skinColor: pick(SKINS, 3),
    hairColor: pick(HAIR_COLORS, 6),
    hair: SECTIONS[body].hair[0],
    hat: 'none',
    accessory: 'none',
  };
}

const V = (x, y) => new THREE.Vector2(x, y);

/** A limb hanging down from its joint: tapered, slightly muscled, rounded at both ends. */
function limbGeometry(rTop, rBot, len, bulge = 0) {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const a = -PI / 2 + (i / 6) * (PI / 2);
    pts.push(V(Math.max(rBot * Math.cos(a), 0.0001), -len + rBot * Math.sin(a)));
  }
  for (let k = 1; k < 10; k++) {
    const t = k / 10;
    pts.push(V(rBot + (rTop - rBot) * t + bulge * Math.sin(PI * t), -len + len * t));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (PI / 2);
    pts.push(V(Math.max(rTop * Math.cos(a), 0.0001), rTop * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, 20);
}

/** A sphere with a soft bumpy surface (for curly hair). */
function curlyGeometry(r, amount) {
  const g = new THREE.SphereGeometry(r, 40, 30);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 140) * Math.sin(v.y * 150) * Math.sin(v.z * 130);
    v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Builds a character. Returns { root, head, update(t), setWalking(speed01), wave(), dispose() }.
 * Missing or unknown style values fall back to sensible defaults.
 */
export function buildHuman(style) {
  const s = { body: 'female', primaryColor: '#9aa3b5', secondaryColor: '#4a4f60', skinColor: '#c68642', hairColor: '#17120f', hair: 'short', hat: 'none', accessory: 'none', ...style };
  const female = s.body === 'female';
  const geos = [];
  const mats = new Map();

  const mat = (color, metal = 0, rough = 0.7) => {
    const key = `${color}|${metal}|${rough}`;
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }));
    return mats.get(key);
  };
  const mesh = (geo, m, x = 0, y = 0, z = 0) => {
    geos.push(geo);
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    return o;
  };
  const ball = (r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const o = mesh(new THREE.SphereGeometry(r, 24, 18), m, x, y, z);
    o.scale.set(sx, sy, sz);
    return o;
  };
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const limb = (rTop, rBot, len, m, bulge = 0) => mesh(limbGeometry(rTop, rBot, len, bulge), m);
  const lathe = (pts, m, depth) => {
    const o = mesh(new THREE.LatheGeometry(pts.map(([r, y]) => V(Math.max(r, 0.0001), y)), 32), m);
    o.scale.z = depth;
    return o;
  };

  const skin = mat(s.skinColor, 0, 0.55);
  const top = mat(s.primaryColor, 0, 0.75);
  const bottoms = mat(s.secondaryColor, 0, 0.85);
  const hair = mat(s.hairColor, 0, 0.8);
  const shoe = mat(SHOE, 0, 0.45);

  const root = new THREE.Group();
  const hipY = female ? 0.885 : 0.91;
  const hips = group(root, 0, hipY, 0);

  // ---- pelvis (in the bottoms colour), then legs: hip > knee > ankle
  hips.add(lathe(female
    ? [[0, -0.1], [0.08, -0.098], [0.135, -0.08], [0.16, -0.04], [0.165, 0.0], [0.152, 0.05]]
    : [[0, -0.1], [0.08, -0.098], [0.13, -0.08], [0.15, -0.04], [0.152, 0.0], [0.146, 0.05]], bottoms, 0.7));
  const legs = [];
  const thighLen = female ? 0.41 : 0.42;
  const shinLen = female ? 0.395 : 0.405;
  for (const side of [-1, 1]) {
    const hip = group(hips, side * (female ? 0.082 : 0.084), -0.04, 0);
    hip.add(limb(female ? 0.09 : 0.086, 0.056, thighLen - 0.06, bottoms, 0.01));
    const knee = group(hip, 0, -(thighLen - 0.06), 0);
    knee.add(limb(0.056, 0.04, shinLen, bottoms, 0.012));
    const ankle = group(knee, 0, -shinLen, 0);
    ankle.add(ball(0.05, shoe, 0, -0.03, 0.045, 0.95, 0.72, 2.3));
    legs.push({ hip, knee });
  }

  // ---- torso: one smooth shape from waist to collar
  const spine = group(hips, 0, 0.03, 0);
  const torso = lathe(female
    ? [[0.148, -0.05], [0.15, 0.0], [0.142, 0.06], [0.124, 0.13], [0.116, 0.19], [0.126, 0.25], [0.138, 0.31], [0.142, 0.36], [0.14, 0.4], [0.124, 0.44], [0.09, 0.47], [0.055, 0.49], [0.045, 0.5]]
    : [[0.142, -0.05], [0.144, 0.0], [0.142, 0.07], [0.14, 0.15], [0.146, 0.23], [0.162, 0.31], [0.176, 0.38], [0.176, 0.43], [0.16, 0.475], [0.12, 0.51], [0.066, 0.53], [0.052, 0.54]], top, female ? 0.64 : 0.66);
  spine.add(torso);
  if (female) {
    for (const side of [-1, 1]) spine.add(ball(0.058, top, side * 0.056, 0.325, 0.045, 1, 0.88, 0.75));
  }
  const shoulderY = female ? 0.42 : 0.455;
  const neckTop = female ? 0.6 : 0.645;
  spine.add(lathe([[0.05, neckTop - 0.16], [0.047, neckTop - 0.08], [0.044, neckTop - 0.02], [0.03, neckTop]], skin, 0.95));

  // ---- arms: shoulder > elbow > hand
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = group(spine, side * (female ? 0.158 : 0.188), shoulderY, 0);
    sh.add(ball(female ? 0.054 : 0.062, top, 0, -0.012, 0, 1, 1, 0.92));
    sh.add(limb(female ? 0.045 : 0.052, 0.037, 0.29, skin, 0.004));
    sh.add(limb(female ? 0.058 : 0.067, female ? 0.051 : 0.058, 0.11, top));
    const elbow = group(sh, 0, -0.29, 0);
    elbow.add(limb(0.037, 0.027, 0.245, skin, 0.006));
    const hand = group(elbow, 0, -0.265, 0.004);
    hand.add(ball(0.029, skin, 0, -0.03, 0, 1, 1.55, 0.55));
    const thumb = ball(0.012, skin, side * -0.022, -0.02, 0.012, 1, 2, 1);
    thumb.rotation.z = side * 0.4;
    hand.add(thumb);
    arms.push({ sh, elbow });
  }

  // ---- head
  const head = group(spine, 0, female ? 0.672 : 0.718, 0);
  head.scale.setScalar(1.05);
  const sx = female ? 0.84 : 0.88;
  head.add(ball(0.1, skin, 0, 0, 0, sx, 1.13, 1));
  head.add(ball(0.07, skin, 0, -0.05, 0.016, female ? 0.9 : 1.0, 0.74, 0.95));
  for (const side of [-1, 1]) {
    head.add(ball(0.022, skin, side * 0.087 * (sx / 0.88), -0.005, -0.004, 0.45, 1, 0.75));
    head.add(ball(0.0145, mat('#f4efe7', 0, 0.25), side * 0.034, 0.012, 0.082, 1.3, 0.75, 0.6));
    head.add(ball(0.0085, mat('#2a1a10', 0, 0.15), side * 0.034, 0.012, 0.09));
    head.add(ball(0.016, skin, side * 0.034, 0.02, 0.08, 1.35, 0.5, 0.7));
    const brow = ball(0.018, hair, side * 0.036, 0.04, 0.088, 1.25, female ? 0.22 : 0.32, 0.4);
    brow.rotation.z = side * (female ? -0.18 : -0.06);
    head.add(brow);
  }
  head.add(ball(0.016, skin, 0, -0.01, 0.098, 0.85, 1.5, 1.1));
  head.add(ball(0.012, skin, 0, -0.028, 0.104, 1.2, 0.7, 0.9));
  const lipM = mat(female ? '#a5525a' : new THREE.Color(s.skinColor).multiplyScalar(0.74).getStyle(), 0, 0.4);
  const lipZ = s.accessory === 'beard' ? 0.096 : 0.09;
  head.add(ball(0.019, lipM, 0, -0.045, lipZ, 1, 0.3, 0.55));
  head.add(ball(0.017, lipM, 0, -0.054, lipZ - 0.002, 1, 0.35, 0.55));

  // hair
  const sw = []; // parts that sway
  if (s.hair !== 'bald') {
    const cap = mesh(new THREE.SphereGeometry(0.106, 32, 16, 0, 2 * PI, 0, PI * 0.5), hair, 0, 0.012, -0.012);
    cap.scale.set(sx + 0.02, 1.15, 1.03);
    cap.rotation.x = -0.42;
    head.add(cap);
  }
  if (s.hair === 'afro') {
    const a = mesh(curlyGeometry(0.16, 0.035), hair, 0, 0.06, -0.065);
    a.scale.set(1.02, 0.9, 0.85);
    head.add(a);
  }
  if (s.hair === 'bun') head.add(mesh(curlyGeometry(0.052, 0.03), hair, 0, 0.11, -0.075));
  if (s.hair === 'ponytail') {
    const tail = group(head, 0, 0.03, -0.1);
    tail.add(ball(0.026, hair));
    const strand = limb(0.04, 0.016, 0.26, hair, 0.01);
    strand.rotation.x = 0.15;
    tail.add(strand);
    sw.push(tail);
  }
  if (s.hair === 'braids' || s.hair === 'dreads') {
    const braids = s.hair === 'braids';
    const n = braids ? 16 : 18;
    const len = braids ? 0.34 : 0.21;
    for (let i = 0; i < n; i++) {
      const a = PI * 0.1 + (i / (n - 1)) * PI * 0.8;
      const strand = group(head, Math.cos(a) * 0.086 * (sx / 0.88), 0.02, -Math.sin(a) * 0.09);
      strand.rotation.z = Math.cos(a) * 0.12;
      strand.rotation.x = -0.08;
      strand.add(limb(braids ? 0.011 : 0.014, braids ? 0.008 : 0.012, len, hair));
      sw.push(strand);
    }
  }

  // face extras
  if (s.accessory === 'beard') {
    const beard = mesh(new THREE.SphereGeometry(0.104, 32, 16, 0, 2 * PI, PI * 0.66, PI * 0.34), hair, 0, -0.008, 0.006);
    beard.scale.set(sx + 0.02, 1.12, 1.02);
    head.add(beard);
    head.add(ball(0.03, hair, 0, -0.035, 0.088, 1.3, 0.35, 0.5));
  }
  if (s.accessory === 'glasses') {
    const frame = mat('#1d1b19', 0.4, 0.35);
    for (const side of [-1, 1]) {
      head.add(mesh(new THREE.TorusGeometry(0.024, 0.0042, 10, 24), frame, side * 0.035, 0.012, 0.1));
      head.add(mesh(new THREE.BoxGeometry(0.004, 0.004, 0.1), frame, side * 0.083 * (sx / 0.88), 0.014, 0.05));
    }
    head.add(mesh(new THREE.TorusGeometry(0.011, 0.0035, 8, 16, PI), frame, 0, 0.014, 0.102));
  }
  if (s.accessory === 'earrings') {
    for (const side of [-1, 1]) {
      head.add(mesh(new THREE.TorusGeometry(0.012, 0.0032, 10, 20), mat(GOLD, 0.85, 0.25), side * 0.086 * (sx / 0.88), -0.04, 0.004));
    }
  }

  // hats (sit higher on an afro)
  const lift = s.hair === 'afro' ? 0.075 : 0;
  if (s.hat === 'cap') {
    const dome = mesh(new THREE.SphereGeometry(0.112, 32, 12, 0, 2 * PI, 0, PI / 2), top, 0, 0.018, -0.006);
    dome.scale.set(sx + 0.05, 1.18, 1.08);
    head.add(dome);
    const brim = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 24, 1, false, -PI / 2, PI), top, 0, 0.03, 0.085);
    brim.scale.set(1, 1, 0.9);
    brim.rotation.x = 0.12;
    head.add(brim);
  }
  if (s.hat === 'beanie') {
    const dome = mesh(new THREE.SphereGeometry(0.114, 32, 14, 0, 2 * PI, 0, PI / 2), top, 0, 0.022, -0.004);
    dome.scale.set(sx + 0.05, 1.05, 1.07);
    head.add(dome);
    const cuff = mesh(new THREE.TorusGeometry(0.1, 0.02, 12, 32), bottoms, 0, 0.03, -0.004);
    cuff.rotation.x = PI / 2;
    cuff.scale.set(sx + 0.06, 1.08, 1);
    head.add(cuff);
    head.add(mesh(curlyGeometry(0.03, 0.06), top, 0, 0.152, -0.01));
  }
  if (s.hat === 'tophat') {
    const black = mat('#1b1a18', 0, 0.45);
    const h = group(head, 0, 0.1 + lift, -0.005);
    h.rotation.z = -0.08;
    h.add(mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.012, 32), black));
    h.add(mesh(new THREE.CylinderGeometry(0.085, 0.092, 0.17, 32), black, 0, 0.09, 0));
    h.add(mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.03, 32), top, 0, 0.025, 0));
  }
  if (s.hat === 'crown') {
    const gold = mat(GOLD, 0.85, 0.28);
    const c = group(head, 0, 0.1 + lift, -0.005);
    c.add(mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.05, 32, 1, true), gold));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      c.add(mesh(new THREE.ConeGeometry(0.018, 0.05, 12), gold, Math.sin(a) * 0.08, 0.045, Math.cos(a) * 0.08));
      c.add(ball(0.007, gold, Math.sin(a) * 0.08, 0.072, Math.cos(a) * 0.08));
    }
    c.add(mesh(new THREE.OctahedronGeometry(0.012), mat('#d6263b', 0.2, 0.15), 0, 0.005, 0.086));
  }

  // body extras
  if (s.accessory === 'scarf') {
    const sc = mat(SCARF, 0, 0.9);
    const ring = mesh(new THREE.TorusGeometry(0.066, 0.03, 14, 28), sc, 0, neckTop - 0.13, 0.005);
    ring.rotation.x = PI / 2 - 0.15;
    ring.scale.set(1.08, 0.85, 1);
    spine.add(ring);
    const tail = mesh(new THREE.CapsuleGeometry(0.026, 0.16, 6, 12), sc, 0.06, neckTop - 0.25, 0.08);
    tail.scale.z = 0.45;
    tail.rotation.z = 0.08;
    spine.add(tail);
  }
  if (s.accessory === 'backpack') {
    const lea = mat(LEATHER, 0, 0.65);
    const zBack = female ? -0.1 : -0.115;
    const bag = mesh(new THREE.CapsuleGeometry(0.11, 0.12, 8, 16), lea, 0, 0.3, zBack - 0.06);
    bag.scale.set(1.15, 1, 0.55);
    spine.add(bag);
    const pocket = mesh(new THREE.CapsuleGeometry(0.07, 0.03, 6, 14), mat('#57391f', 0, 0.65), 0, 0.22, zBack - 0.12);
    pocket.scale.set(1.2, 1, 0.35);
    spine.add(pocket);
    for (const side of [-1, 1]) {
      const strap = mesh(new THREE.CapsuleGeometry(0.012, 0.32, 4, 8), lea, side * 0.085, 0.29, female ? 0.082 : 0.093);
      strap.scale.x = 1.6;
      strap.rotation.x = -0.12;
      spine.add(strap);
      const over = mesh(new THREE.TorusGeometry(0.09, 0.011, 8, 20, PI), lea, side * 0.085, shoulderY - 0.03, -0.01);
      over.rotation.y = PI / 2;
      spine.add(over);
    }
  }

  // ---- animation: idle (breathing, weight shift, looking around), walking, waving
  const restArm = female ? 0.1 : 0.13;
  const WAVE = 1.8; // seconds
  let waveStart = -10;
  let now = 0;
  let last = 0;
  let walkTarget = 0; // 0 standing, 1 walking, up to ~1.8 running
  let walk = 0; // eased toward walkTarget
  let phase = 0; // stride cycle

  function update(t) {
    const dt = Math.min(0.1, Math.max(0, t - last));
    last = now = t;
    walk += (walkTarget - walk) * Math.min(1, dt * 8);
    const w = Math.min(1, walk); // how much of the walk pose to show
    phase += dt * PI * 2 * 1.7 * Math.max(walk, 0.0001);

    // idle
    const shift = Math.sin(t * 0.7) * (1 - w);
    hips.position.x = shift * 0.012;
    hips.rotation.z = shift * 0.025;
    spine.rotation.z = -shift * 0.03;
    spine.rotation.x = Math.sin(t * 1.5) * 0.01 + w * 0.06; // lean in a little when walking
    torso.scale.y = 1 + Math.sin(t * 1.5) * 0.008;
    const look = Math.sin(t * 0.42);
    head.rotation.y = Math.sign(look) * Math.pow(Math.abs(look), 1.6) * 0.45 * (1 - w);
    head.rotation.x = Math.sin(t * 0.31) * 0.06 - 0.02 - w * 0.04;
    head.rotation.z = shift * 0.02;

    // legs: hips swing (negative x = forward), knees bend as each leg swings through
    const stride = Math.sin(phase);
    legs.forEach(({ hip, knee }, i) => {
      const s2 = i === 0 ? stride : -stride;
      hip.rotation.x = -s2 * 0.5 * w;
      hip.rotation.z = -shift * 0.025;
      const idleKnee = Math.max(0, i === 0 ? shift : -shift) * 0.08;
      const walkKnee = Math.max(0, Math.sin(phase + (i === 0 ? 0 : PI) + PI / 2)) * 0.85;
      knee.rotation.x = idleKnee * (1 - w) + walkKnee * w;
    });
    // arms swing against the legs
    arms.forEach(({ sh, elbow }, i) => {
      const side = i === 0 ? -1 : 1;
      const s2 = i === 0 ? -stride : stride;
      sh.rotation.z = side * (restArm + Math.sin(t * 1.5 + i) * 0.015 * (1 - w));
      sh.rotation.x = Math.sin(t * 0.7 + i * PI) * 0.05 * (1 - w) - s2 * 0.42 * w;
      elbow.rotation.x = -0.14 - Math.sin(t * 0.9 + i) * 0.04 * (1 - w) - 0.3 * w;
    });
    // a small bounce in each step
    hips.position.y = hipY + (Math.abs(Math.cos(phase)) - 0.6) * 0.035 * w;

    // wave: right arm up and waving, a small bounce, head tilts
    const p = (t - waveStart) / WAVE;
    if (p >= 0 && p < 1) {
      const ease = Math.sin(Math.min(1, p * 4) * PI / 2) * Math.sin(Math.min(1, (1 - p) * 4) * PI / 2);
      const { sh, elbow } = arms[1];
      sh.rotation.z = THREE.MathUtils.lerp(sh.rotation.z, 2.5, ease);
      sh.rotation.x = THREE.MathUtils.lerp(sh.rotation.x, -0.25, ease);
      elbow.rotation.x = THREE.MathUtils.lerp(elbow.rotation.x, 0, ease);
      elbow.rotation.z = Math.sin(t * 11) * 0.45 * ease;
      head.rotation.y *= 1 - ease;
      head.rotation.z = 0.12 * ease;
      hips.position.y += Math.max(0, Math.sin(p * PI * 2)) * 0.03 * (1 - p) * (1 - w);
    } else {
      arms[1].elbow.rotation.z = 0;
    }
    for (let i = 0; i < sw.length; i++) sw[i].rotation.x = -0.08 + Math.sin(t * 1.3 + i * 0.3) * 0.04 - head.rotation.x + w * 0.25;
  }
  update(0);

  return {
    root,
    head,
    update,
    /** 0 standing, 1 walking, about 1.8 running. */
    setWalking(speed) {
      walkTarget = speed;
    },
    wave() {
      if (now - waveStart > WAVE * 0.8) waveStart = now;
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
