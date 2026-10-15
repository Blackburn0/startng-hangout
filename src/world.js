// The park: open grass, a sun, trees, flowers and a path. Built from a fixed seed so every
// player sees exactly the same park.
import * as THREE from 'three';

const SKY = '#bfe3f7';
// Where the sun sits: low enough (about 11 degrees up) to be in view and cast long afternoon shadows.
export const SUN_DIR = new THREE.Vector3(120, 40, -160).normalize();

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adds the park to the scene. Returns { update(focus) } to keep the sun's shadows around the player. */
export function buildPark(scene) {
  const rand = seeded(20261015);
  const between = (a, b) => a + rand() * (b - a);
  const color = new THREE.Color();

  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog('#d4ecf6', 45, 150);

  scene.add(new THREE.HemisphereLight('#e4f4ff', '#6f9a45', 1.15));
  const sun = new THREE.DirectionalLight('#fff3d6', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // The sun you can see, with a soft glow, far away in the same direction the light comes from.
  const disc = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: '#fff1b0', fog: false }));
  const glow = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ color: '#fff6cf', transparent: true, opacity: 0.45, fog: false }));
  for (const m of [disc, glow]) {
    m.position.copy(SUN_DIR).multiplyScalar(260);
    m.lookAt(0, 0, 0);
    scene.add(m);
  }
  glow.position.addScaledVector(SUN_DIR, 1);

  // Grass: a big field with gently varying greens.
  const groundGeo = new THREE.PlaneGeometry(420, 420, 140, 140);
  groundGeo.rotateX(-Math.PI / 2);
  const colors = [];
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 0.11) * Math.cos(z * 0.09) + Math.sin(x * 0.031 + z * 0.047) * 0.8;
    color.setHSL(0.27 + n * 0.012, 0.5, 0.42 + n * 0.035);
    colors.push(color.r, color.g, color.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const dummy = new THREE.Object3D();
  const place = (inst, i, x, y, z, s = 1, ry = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  };

  // Grass tufts, thick near the middle and thinning out.
  const BLADES = 9000;
  const blades = new THREE.InstancedMesh(new THREE.ConeGeometry(0.035, 0.32, 3).translate(0, 0.16, 0), new THREE.MeshStandardMaterial({ roughness: 1 }), BLADES);
  for (let i = 0; i < BLADES; i++) {
    const r = Math.sqrt(rand()) * 75;
    const a = rand() * Math.PI * 2;
    place(blades, i, Math.cos(a) * r, 0, Math.sin(a) * r, between(0.6, 1.4), rand() * 6);
    blades.setColorAt(i, color.setHSL(between(0.24, 0.31), between(0.45, 0.6), between(0.32, 0.46)));
  }
  scene.add(blades);

  // Flowers dotted around.
  const FLOWERS = 500;
  const petals = ['#ffffff', '#ffe066', '#ff9ec7', '#c9a7ff', '#ffb347'];
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 0).translate(0, 0.22, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), FLOWERS);
  for (let i = 0; i < FLOWERS; i++) {
    const r = between(4, 70);
    const a = rand() * Math.PI * 2;
    place(flowers, i, Math.cos(a) * r, 0, Math.sin(a) * r, between(0.8, 1.3));
    flowers.setColorAt(i, color.set(petals[Math.floor(rand() * petals.length)]));
  }
  scene.add(flowers);

  // A round path around the middle, with benches facing in.
  const path = new THREE.Mesh(new THREE.RingGeometry(9, 10.6, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e6dbbd', roughness: 1 }));
  path.position.y = 0.01;
  path.receiveShadow = true;
  scene.add(path);
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a35', roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: '#2f3a2c', roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.45), wood);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.06), wood);
    back.position.set(0, 0.72, -0.2);
    bench.add(seat, back);
    for (const side of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), metal);
      leg.position.set(side, 0.22, 0);
      bench.add(leg);
    }
    bench.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    bench.position.set(Math.cos(a) * 11.6, 0, Math.sin(a) * 11.6);
    bench.lookAt(0, 0, 0);
    scene.add(bench);
  }

  // Trees: a few near the path, a loose ring further out, and woods at the edge.
  const spots = [];
  for (let i = 0; i < 8; i++) spots.push([between(14, 24), rand() * Math.PI * 2]);
  for (let i = 0; i < 45; i++) spots.push([between(28, 55), rand() * Math.PI * 2]);
  for (let i = 0; i < 80; i++) spots.push([between(60, 110), rand() * Math.PI * 2]);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 2.2, 7).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.9 }), spots.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 1).translate(0, 3.2, 0), new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), spots.length);
  spots.forEach(([r, a], i) => {
    const s = between(0.8, 1.5);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    place(trunks, i, x, 0, z, s);
    place(crowns, i, x, 0, z, s, rand() * 6);
    crowns.setColorAt(i, color.setHSL(between(0.25, 0.33), between(0.4, 0.55), between(0.26, 0.36)));
  });
  for (const m of [trunks, crowns]) m.castShadow = m.receiveShadow = true;
  scene.add(trunks, crowns);

  return {
    /** Keeps the sun's shadow area centred on whoever the camera follows. */
    update(focus) {
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(SUN_DIR, 60);
    },
  };
}
