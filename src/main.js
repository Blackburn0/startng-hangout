import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import * as platform from './platform.js';
import { buildHuman, buildStatue, styleFor } from './character.js';
import { buildPark, seatSpot, SUN_DIR } from './world.js';
import { LiveRoom } from './net.js';

const WALK = 3.2; // metres a second
const RUN = 6;
const WORLD = 58; // keep inside the server's limit (60)
const SEND_EVERY = 0.1; // seconds between position updates

const $ = (id) => document.getElementById(id);
const ui = {
  overlay: $('overlay'), title: $('title'), message: $('message'), action: $('action'),
  online: $('online'), status: $('status'), hint: $('hint'),
};

// ---- scene ------------------------------------------------------------------

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
document.body.append(labels.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
const park = buildPark(scene);

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- people ------------------------------------------------------------------
// Everyone in the room is a live, moving character that only its owner controls. Everyone else
// with a seat sits on their bench as a still model until they come in.

const avatars = new Map(); // id -> { human, label, target, moving, name, style, seat }
const statues = new Map(); // id -> { obj, label }
const residents = new Map(); // id -> { name, style, seat }: everyone with a seat
const statueQueue = []; // residents waiting to be built, a few per frame
let myId = null;

function nameTag(name, kind, height) {
  const el = document.createElement('div');
  el.className = `tag ${kind}`;
  el.textContent = kind === 'you' ? `${name} (you)` : name;
  const tag = new CSS2DObject(el);
  tag.position.set(0, height, 0);
  return tag;
}

function addAvatar(p) {
  removeAvatar(p.id);
  removeStatue(p.id);
  if (p.seat != null) residents.set(p.id, { name: p.name, style: p.style, seat: p.seat });
  const human = buildHuman(p.style ?? styleFor(p.id));
  const label = nameTag(p.name, p.id === myId ? 'you' : 'here', 2.15);
  human.root.add(label);
  // Not moved yet: standing up in front of their seat (or mid-park if they have none).
  const spot = p.seat != null ? seatSpot(p.seat) : null;
  const x = p.x ?? spot?.stand.x ?? 0;
  const z = p.z ?? spot?.stand.z ?? 0;
  const ry = p.x != null ? p.ry : spot?.ry ?? 0;
  human.root.position.set(x, 0, z);
  human.root.rotation.y = ry;
  scene.add(human.root);
  avatars.set(p.id, { human, label, target: { x, z, ry }, moving: p.moving, name: p.name, style: p.style, seat: p.seat });
}

function removeAvatar(id) {
  const a = avatars.get(id);
  if (!a) return;
  a.human.root.remove(a.label);
  a.label.element.remove();
  scene.remove(a.human.root);
  a.human.dispose();
  avatars.delete(id);
}

function seat(id) {
  if (!avatars.has(id) && !statues.has(id) && residents.has(id)) statueQueue.push(id);
}

function buildQueuedStatues(max) {
  for (let i = 0; i < max && statueQueue.length; i++) {
    const id = statueQueue.shift();
    const r = residents.get(id);
    if (!r || avatars.has(id) || statues.has(id)) continue;
    const obj = buildStatue(r.style ?? styleFor(id));
    const spot = seatSpot(r.seat);
    obj.position.copy(spot.sit);
    obj.rotation.y = spot.ry;
    const label = nameTag(r.name, 'away', 1.6);
    obj.add(label);
    scene.add(obj);
    statues.set(id, { obj, label });
  }
}

function removeStatue(id) {
  const s = statues.get(id);
  if (!s) return;
  s.obj.remove(s.label);
  s.label.element.remove();
  scene.remove(s.obj);
  s.obj.userData.dispose();
  statues.delete(id);
}

function clearPeople() {
  for (const id of [...avatars.keys()]) removeAvatar(id);
  for (const id of [...statues.keys()]) removeStatue(id);
  residents.clear();
  statueQueue.length = 0;
}

function showOnline() {
  const n = avatars.size;
  ui.online.textContent = `${n} here now`;
  ui.online.hidden = n === 0;
}

// ---- overlay ------------------------------------------------------------------

let overlayAction = null;
function showOverlay(title, message, button = null, onClick = null) {
  ui.title.textContent = title;
  ui.message.textContent = message;
  ui.action.hidden = !button;
  if (button) ui.action.textContent = button;
  overlayAction = onClick;
  ui.overlay.hidden = false;
}
ui.action.addEventListener('click', () => overlayAction?.());

function showSignIn() {
  room.stop();
  clearPeople();
  myId = null;
  showOnline();
  showOverlay(
    'The Hangout',
    'Sign in with start.ng to come in. Your start.ng character is your avatar, and everyone here sees you walk and wave.',
    'Sign in with start.ng',
    platform.signIn,
  );
}

// ---- the live room ---------------------------------------------------------------

const room = new LiveRoom({
  onMessage(msg) {
    if (msg.type === 'welcome') {
      clearPeople();
      myId = msg.you;
      for (const r of msg.seats) residents.set(r.id, { name: r.name, style: r.style, seat: r.seat });
      msg.players.forEach(addAvatar);
      for (const id of residents.keys()) seat(id);
      ui.overlay.hidden = true;
      ui.status.hidden = true;
      ui.hint.hidden = false;
    } else if (msg.type === 'join') {
      addAvatar(msg.player);
    } else if (msg.type === 'move') {
      const a = avatars.get(msg.id);
      if (a && msg.id !== myId) {
        a.target = { x: msg.x, z: msg.z, ry: msg.ry };
        a.moving = msg.moving;
      }
    } else if (msg.type === 'wave') {
      avatars.get(msg.id)?.human.wave();
    } else if (msg.type === 'leave') {
      removeAvatar(msg.id);
      seat(msg.id); // back on their bench, if they have one
    }
    showOnline();
  },
  onReconnecting(reason) {
    ui.status.textContent = reason === 'full' ? 'The Hangout is full. Trying again…' : 'Reconnecting…';
    ui.status.hidden = false;
  },
  onBlocked(reason) {
    if (reason === 'replaced') {
      room.stop();
      clearPeople();
      myId = null;
      showOnline();
      showOverlay('You joined from somewhere else', 'The Hangout is open in another tab or window.', 'Play here', () => {
        showOverlay('The Hangout', 'Coming in…');
        room.rejoin();
      });
    } else {
      showSignIn();
    }
  },
});

// ---- controls -------------------------------------------------------------------

const keys = new Set();
const KEYS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
};
const held = (name) => KEYS[name].some((k) => keys.has(k));

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'Space' && !e.repeat) wave();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

let lastWave = -10;
function wave() {
  const me = avatars.get(myId);
  if (!me || clock.elapsedTime - lastWave < 1) return; // the server drops faster waves too
  lastWave = clock.elapsedTime;
  me.human.wave();
  room.send({ type: 'wave' });
}

// Drag to look around, scroll to zoom. Start with the sun in the sky off to one side, so it's in
// view but players are lit from the side rather than standing in their own shadow.
let yaw = Math.atan2(-SUN_DIR.x, -SUN_DIR.z) + 0.5;
let pitch = 0.24;
let distance = 6.5;
let dragging = null;
canvas.addEventListener('pointerdown', (e) => {
  dragging = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - dragging.x) * 0.006;
  pitch = THREE.MathUtils.clamp(pitch + (e.clientY - dragging.y) * 0.004, 0.08, 1.25);
  dragging = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  distance = THREE.MathUtils.clamp(distance * (1 + Math.sign(e.deltaY) * 0.1), 3, 16);
}, { passive: false });

// ---- loop -------------------------------------------------------------------------

const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const clock = new THREE.Clock();
const focus = new THREE.Vector3();
let sentAt = 0;
let sent = null;

function step(dt, t) {
  const me = avatars.get(myId);
  if (me) {
    // Move relative to where the camera looks.
    const f = (held('forward') ? 1 : 0) - (held('back') ? 1 : 0);
    const r = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let mx = fx * f - fz * r;
    let mz = fz * f + fx * r;
    const len = Math.hypot(mx, mz);
    const pos = me.human.root.position;
    if (len > 0) {
      const running = held('run');
      mx /= len;
      mz /= len;
      pos.x = THREE.MathUtils.clamp(pos.x + mx * (running ? RUN : WALK) * dt, -WORLD, WORLD);
      pos.z = THREE.MathUtils.clamp(pos.z + mz * (running ? RUN : WALK) * dt, -WORLD, WORLD);
      const ry = me.human.root.rotation.y;
      me.human.root.rotation.y = ry + angleTo(ry, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
      me.human.setWalking(running ? 1.8 : 1);
    } else {
      me.human.setWalking(0);
    }
    // Tell the room, about 10 times a second while something changes.
    const state = { x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), ry: +me.human.root.rotation.y.toFixed(3), moving: len > 0 };
    const changed = !sent || state.x !== sent.x || state.z !== sent.z || state.ry !== sent.ry || state.moving !== sent.moving;
    if (changed && t - sentAt >= SEND_EVERY && room.connected) {
      room.send({ type: 'move', ...state });
      sent = state;
      sentAt = t;
    }
    focus.set(pos.x, 1.45, pos.z);
  } else {
    yaw += dt * 0.05; // nobody to follow: drift slowly around the park
    focus.set(0, 1.45, 0);
  }

  // Everyone else glides to where they last said they were.
  buildQueuedStatues(4); // a few benches' people per frame, so joining doesn't stutter

  for (const [id, a] of avatars) {
    if (id !== myId) {
      const p = a.human.root.position;
      const k = Math.min(1, dt * 10);
      p.x += (a.target.x - p.x) * k;
      p.z += (a.target.z - p.z) * k;
      a.human.root.rotation.y += angleTo(a.human.root.rotation.y, a.target.ry) * k;
      a.human.setWalking(a.moving ? 1 : 0);
    }
    a.human.update(t);
  }

  camera.position.set(
    focus.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    focus.y + Math.sin(pitch) * distance,
    focus.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  );
  camera.lookAt(focus);
  park.update(focus);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  step(dt, clock.elapsedTime);
  renderer.render(scene, camera);
  labels.render(scene, camera);
});

// ---- start --------------------------------------------------------------------------

if (!platform.START_NG) {
  showOverlay('The Hangout', 'The Hangout lives on start.ng. Open it at hangout.start.ng to come in.');
} else {
  showOverlay('The Hangout', 'Coming in…');
  const user = await platform.getCurrentUser();
  if (!user) showSignIn();
  else room.connect();
  // Signed in or out on start.ng in another tab: start again as whoever is signed in now.
  platform.onUserChange((u) => {
    if ((u?.id ?? null) !== (user?.id ?? null)) location.reload();
  });
}
