// LAST SECOND CHANCE (LSC) v2 — REBUILD (branch rebuild-v2). Stage R-A: World.
// (Title changed from SENJA HEAT by mas 2026-11-22; city stays Port Senja.)
// Port Senja rebuilt from zero per REBUILD-BRIEF.md: Sungai Senja (W1) carved
// BEFORE roads, road graph as single source of truth, shape-first buildings
// (F1 capped), strict draw-call budget (renderer.info accumulated across ALL
// passes of one frame: shadow + main + bloom). Seed 42, deterministic.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const FAST = !!params.get('fast');
const BLOOM_ON = params.get('bloom') !== '0';
const SEED = 42;

// ---------- deterministic RNG ----------
let _s = SEED * 1000 + 7;
const rnd = () => (_s = (_s * 16807) % 2147483647) / 2147483647;
const rr = (a, b) => a + rnd() * (b - a);
const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];

// ---------- renderer (strict perf: info accumulates across every pass) ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(FAST ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !FAST;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.info.autoReset = false; // STRICT: we reset once per frame, read after ALL passes
document.getElementById('game').appendChild(renderer.domElement);
window.__renderer = renderer;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8a5a68, 110, 520);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1600);
camera.position.set(-40, 60, 120);

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xffb37a, 0x2a1e3f, 0.95));
const sun = new THREE.DirectionalLight(0xff8c4a, 1.7);
sun.position.set(-160, 95, -80);
sun.castShadow = !FAST;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -330; sun.shadow.camera.right = 330;
sun.shadow.camera.top = 330; sun.shadow.camera.bottom = -330;
sun.shadow.camera.far = 700; sun.shadow.bias = -0.0015; sun.shadow.normalBias = 2.0;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x7a5cff, 0.32); fill.position.set(90, 60, 110); scene.add(fill);

// ---------- sky: 8-layer dusk (canvas) + sun glow + early stars ----------
function makeSkyTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 1024);
  gr.addColorStop(0.00, '#0e1834'); gr.addColorStop(0.26, '#2c3560');
  gr.addColorStop(0.46, '#5b4a7d'); gr.addColorStop(0.62, '#9c5f7c');
  gr.addColorStop(0.75, '#cf7355'); gr.addColorStop(0.86, '#f09a5e');
  gr.addColorStop(0.94, '#ffc98a'); gr.addColorStop(1.00, '#ffe3ae');
  g.fillStyle = gr; g.fillRect(0, 0, 2048, 1024);
  for (const [r, a] of [[560, 0.16], [340, 0.22], [190, 0.32], [95, 0.5]]) {
    const sg = g.createRadialGradient(520, 905, 6, 520, 905, r);
    sg.addColorStop(0, `rgba(255,236,180,${a})`); sg.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = sg; g.fillRect(0, 300, 1200, 724);
  }
  g.fillStyle = '#fff3cf'; g.beginPath(); g.arc(520, 905, 34, 0, 7); g.fill();
  let ss = 777; const srnd = () => (ss = (ss * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) { const y = srnd() * 330; const a = (1 - y / 330) * 0.75;
    g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`; const r = srnd() * 1.6 + 0.4;
    g.fillRect(srnd() * 2048, y, r, r); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const skyTex = makeSkyTexture();
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 18),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
scene.add(sky); window.__skyMesh = sky;
scene.background = new THREE.Color(0x8a5a68);

// PMREM environment from OUR OWN dusk sky (no external HDRI)
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 18),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
  envScene.add(new THREE.HemisphereLight(0xffb37a, 0x2a1e3f, 1.2));
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.45;
  pmrem.dispose();
}

// ---------- drifting canvas clouds ----------
const cloudSprites = [];
{
  let cs = 4242; const crnd = () => (cs = (cs * 16807) % 2147483647) / 2147483647;
  function cloudTexture(warm) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const puffs = 26 + Math.floor(crnd() * 14);
    for (let i = 0; i < puffs; i++) {
      const x = 70 + crnd() * 372, y = 105 + crnd() * 70, r = 26 + crnd() * 52;
      const top = warm ? '255,196,150' : '232,190,190';
      const grad = g.createRadialGradient(x, y - r * 0.35, r * 0.1, x, y, r);
      grad.addColorStop(0, `rgba(${top},0.30)`);
      grad.addColorStop(0.55, 'rgba(196,150,170,0.20)');
      grad.addColorStop(1, 'rgba(120,95,130,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-atop';
    const belly = g.createLinearGradient(0, 130, 0, 256);
    belly.addColorStop(0, 'rgba(90,70,105,0)'); belly.addColorStop(1, 'rgba(90,70,105,0.28)');
    g.fillStyle = belly; g.fillRect(0, 130, 512, 126);
    g.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const texA = cloudTexture(true), texB = cloudTexture(false);
  for (let i = 0; i < 30; i++) {
    const mat = new THREE.SpriteMaterial({ map: i % 2 ? texA : texB, transparent: true,
      opacity: 0.55 + crnd() * 0.35, depthWrite: false, fog: false });
    const sp = new THREE.Sprite(mat);
    const ang = crnd() * Math.PI * 2, dist = 300 + crnd() * 420;
    sp.position.set(Math.cos(ang) * dist, 110 + crnd() * 140, Math.sin(ang) * dist);
    const w = 140 + crnd() * 230; sp.scale.set(w, w * (0.30 + crnd() * 0.12), 1);
    sp.userData.speed = 0.6 + crnd() * 1.1;
    scene.add(sp); cloudSprites.push(sp);
  }
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.SpriteMaterial({ map: texB, transparent: true, opacity: 0.30, depthWrite: false, fog: false });
    const sp = new THREE.Sprite(mat);
    sp.position.set(-560 + i * 180 + crnd() * 60, 250 + crnd() * 40, -460 + crnd() * 120);
    sp.scale.set(360, 44, 1); sp.userData.speed = 0.35;
    scene.add(sp); cloudSprites.push(sp);
  }
}

// ---------- post: selective bloom (threshold .82, half-res, kill switch ?bloom=0) ----------
let composer = null;
if (BLOOM_ON) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.5, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  window.__bloom = bloom;
}

// ---------- canvas texture helpers ----------
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t;
}
let _ts = 99; const trnd = () => (_ts = (_ts * 16807) % 2147483647) / 2147483647;

// ---------- geometry helpers ----------
function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px, ez = az + t * dz - pz;
  return Math.hypot(ex, ez);
}
function distToPolyline(px, pz, pts) {
  let m = 1e9;
  for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, distToSeg(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return m;
}
function catmull(pts, segPer = 8) {
  const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) for (let s = 0; s < segPer; s++) {
    const t = s / segPer, t2 = t * t, t3 = t2 * t;
    out.push([0, 1].map(k => 0.5 * (2 * P[i][k] + (-P[i - 1][k] + P[i + 1][k]) * t +
      (2 * P[i - 1][k] - 5 * P[i][k] + 4 * P[i + 1][k] - P[i + 2][k]) * t2 +
      (-P[i - 1][k] + 3 * P[i][k] - 3 * P[i + 1][k] + P[i + 2][k]) * t3)));
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, t) => a + (b - a) * t;

// ======================================================================
// GEOGRAPHY — defined BEFORE roads (REBUILD-BRIEF: river carved first)
// ======================================================================
const WATER_Y = -0.55;
// W1 Sungai Senja: meandering west -> east, widths grow downstream
const RIVER_PTS = [[-330, -4], [-250, 12], [-180, -14], [-110, 6], [-40, -12], [30, 6], [100, -10], [170, 2], [240, -6], [335, 4]];
const RIVER_HW = [15, 16, 17, 16, 15, 16, 17, 16, 15, 16];
function riverDist(x, z) { // {d: centreline distance, hw: local half width}
  let best = 1e9, hw = 16;
  for (let i = 0; i < RIVER_PTS.length - 1; i++) {
    const d = distToSeg(x, z, RIVER_PTS[i][0], RIVER_PTS[i][1], RIVER_PTS[i + 1][0], RIVER_PTS[i + 1][1]);
    if (d < best) { best = d; hw = (RIVER_HW[i] + RIVER_HW[i + 1]) / 2; }
  }
  return { d: best, hw };
}
// W5 Danau: lake in the north park
const LAKE_C = [-60, -168], LAKE_RX = 46, LAKE_RZ = 32;
// W3 Kanal: straight concrete canal in Pelabuhan (x=140, mouth to the sea at z~172)
const CANAL_X = 140, CANAL_HW = 6, CANAL_Z0 = 50, CANAL_Z1 = 172;
// Pulau Senja: offshore island SE
const ISLAND_C = [248, 172], ISLAND_RX = 52, ISLAND_RZ = 40;
function islandD(x, z) { const dx = (x - ISLAND_C[0]) / ISLAND_RX, dz = (z - ISLAND_C[1]) / ISLAND_RZ; return dx * dx + dz * dz; }
// Rawa creek (SW swamp inlet, crossed by the B8 causeway)
const CREEK_PTS = [[-198, 112], [-202, 148], [-196, 182], [-204, 218]];
// Coastlines: east coast falls away to the SE; south coast only east of x=40
function coastX(z) { return z <= 80 ? 218 + 10 * Math.sin(z * 0.022 + 0.7) : 218 - (z - 80) * 0.55 + 8 * Math.sin(z * 0.03); }
function coastZ(x) { return x <= 40 ? 500 : 238 - (x - 40) * 0.16 + 8 * Math.sin(x * 0.025); }

function baseLand(x, z) {
  const west = THREE.MathUtils.smoothstep(-x, 0, 190); // 0 downtown -> 1 far west
  let h = 12 * west * (1 - 0.42 * THREE.MathUtils.smoothstep(z, 60, 210)); // hill, gentler to the south
  const dx = (x + 135) / 46, dz = (z + 45) / 20; // Tanjakan crest bump on the Kota Lama climb
  h += 3.2 * Math.exp(-(dx * dx + dz * dz)) * THREE.MathUtils.smoothstep(-x, 25, 90);
  h += Math.sin(x * 0.021) * Math.cos(z * 0.017) * 0.5 * (1 - west); // gentle downtown roll
  h = Math.max(h, 0.7);
  if (x < -148 && z > 122) h = Math.min(h, 0.55) + 0.12 * Math.sin(x * 0.3) * Math.cos(z * 0.23); // rawa marsh flat
  return h;
}
function groundH(x, z) {
  let h = baseLand(x, z);
  // sea: beyond either coastline -> seabed, with a beach blend band
  const seaD = Math.min(x - coastX(z), z - coastZ(x));
  if (seaD > -16) h = lerp(h, -3.4, smooth((seaD + 16) / 24));
  // island rises out of the sea
  const id = islandD(x, z);
  if (id < 1.6) { const ih = -3.4 + 8.2 * Math.pow(Math.max(0, 1 - id), 0.8); if (ih > h) h = ih; }
  // W1 river carve (valley + banks)
  const rd = riverDist(x, z), bank = rd.d - rd.hw;
  if (bank < 12) h = lerp(h, -2.6, smooth((6 - bank) / 14));
  // W5 lake carve
  const lx = (x - LAKE_C[0]) / LAKE_RX, lz = (z - LAKE_C[1]) / LAKE_RZ, le = lx * lx + lz * lz;
  if (le < 1.6) h = lerp(h, -2.4, smooth((1.55 - le) / 0.95));
  // rawa creek carve
  const cd = distToPolyline(x, z, CREEK_PTS);
  if (cd < 11) h = lerp(h, -1.1, smooth((7 - cd) / 9));
  // W3 canal: sharp concrete cut (banks flattened to quay level)
  if (Math.abs(x - CANAL_X) < CANAL_HW + 3 && z > CANAL_Z0 - 3 && z < CANAL_Z1 + 3) {
    if (Math.abs(x - CANAL_X) < CANAL_HW && z > CANAL_Z0 && z < CANAL_Z1) return -2.4;
    h = Math.min(h, 0.85);
  }
  return h;
}
window.__groundH = groundH;
function isWater(x, z) { return groundH(x, z) < WATER_Y + 0.15; }

// ---------- terrain mesh (vertex-coloured by height / zone) ----------
{
  const SIZE = 820, SEG = 150;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const cSand = new THREE.Color(0xa8905e), cGrass = new THREE.Color(0x4c6a3c), cUrban = new THREE.Color(0x4c4a55),
    cSwamp = new THREE.Color(0x42503a), cRock = new THREE.Color(0x66584e), cBed = new THREE.Color(0x6b5f42), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = groundH(x, z);
    pos.setY(i, h - 0.05);
    // sand only where land actually meets water (coast band, river banks,
    // lake shore, island beach) — inland lowlands stay urban/grass
    const seaD = Math.min(x - coastX(z), z - coastZ(x));
    const islD = islandD(x, z);
    const rdT = riverDist(x, z), nearWater = seaD > -17 || (rdT.d - rdT.hw) < 9 || (islD > 0.45 && islD < 1.4);
    if (h < -0.4) tmp.copy(cBed);
    else if (h < 1.0 && nearWater) tmp.copy(cSand);
    else if (x < -148 && z > 122) tmp.copy(cSwamp);
    else if (x < -55 || (Math.hypot((x - LAKE_C[0]) / 78, (z - LAKE_C[1]) / 58) < 1)) tmp.copy(cGrass);
    else if (h > 8) tmp.copy(cRock);
    else tmp.copy(cUrban);
    const n = 0.92 + 0.08 * Math.abs(Math.sin(x * 12.9898 + z * 78.233));
    colors[i * 3] = tmp.r * n; colors[i * 3 + 1] = tmp.g * n; colors[i * 3 + 2] = tmp.b * n;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.25 }));
  ground.receiveShadow = true; scene.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshStandardMaterial({ color: 0x2e4a55, roughness: 1 }));
  far.rotation.x = -Math.PI / 2; far.position.y = -3.6; scene.add(far);
}

// ---------- water: sea plane + river ribbon + lake + canal (animated) ----------
const waterMats = [];
function waterMat(color, opacity) {
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 2;
    for (let i = 0; i < 9; i++) { g.beginPath(); const y = trnd() * h; g.moveTo(trnd() * w * 0.4, y); g.lineTo(w * 0.5 + trnd() * w * 0.5, y + 3); g.stroke(); }
    g.fillStyle = 'rgba(255,190,120,0.10)'; for (let i = 0; i < 40; i++) g.fillRect(trnd() * w, trnd() * h, 3, 1.5);
  }, 6, 6);
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity,
    roughness: 0.16, metalness: 0.35, color: 0xbfe8e2, emissive: 0x0a2e30, emissiveIntensity: 0.55, envMapIntensity: 0.7 });
  waterMats.push(m); return m;
}
function ribbonMesh(pts, width, mat, yFn, yOff = 0) {
  const verts = [], idx = [], uvs = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    let dx = nx - px, dz = nz - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const ox = -dz * width / 2, oz = dx * width / 2;
    const y1 = yFn(x + ox, z + oz, i), y2 = yFn(x - ox, z - oz, i);
    verts.push(x + ox, y1 + yOff, z + oz, x - ox, y2 + yOff, z - oz);
    uvs.push(0, i * 0.7, 1, i * 0.7);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } // wound so normals face +Y
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
}
{ // sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), waterMat('#1d6f74', 0.94));
  sea.rotation.x = -Math.PI / 2; sea.position.y = WATER_Y; scene.add(sea);
  // W1 river surface follows the centreline
  ribbonMesh(catmull(RIVER_PTS, 10), 30, waterMat('#22757a', 0.92), () => WATER_Y);
  // W5 lake surface
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 40), waterMat('#22757a', 0.92));
  lake.rotation.x = -Math.PI / 2; lake.scale.set(LAKE_RX - 3, LAKE_RZ - 2, 1);
  lake.position.set(LAKE_C[0], WATER_Y, LAKE_C[1]); scene.add(lake);
  // W3 canal surface
  const canal = new THREE.Mesh(new THREE.PlaneGeometry(CANAL_HW * 2, CANAL_Z1 - CANAL_Z0), waterMat('#1f6a72', 0.94));
  canal.rotation.x = -Math.PI / 2; canal.position.set(CANAL_X, WATER_Y, (CANAL_Z0 + CANAL_Z1) / 2); scene.add(canal);
  // canal concrete embankment walls (two long boxes, 2 draws)
  const conc = new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.4, CANAL_Z1 - CANAL_Z0), conc);
    wall.position.set(CANAL_X + sx * (CANAL_HW + 0.8), -0.6, (CANAL_Z0 + CANAL_Z1) / 2);
    wall.castShadow = false; wall.receiveShadow = true; scene.add(wall);
  }
}
// ======================================================================
// ROAD GRAPH — single source of truth (mesh, minimap, later traffic/GPS)
// Edges: generic polylines + height, class tags R*, minimap class, bridge
// edges carry a height profile (deck) — NO road touches water without one.
// ======================================================================
const STAR = [28, -84];
const roadTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#26232e'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 260; i++) g.fillRect(trnd() * w, trnd() * h, 2, 2);
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(14, 20, 34, 44); g.fillRect(78, 74, 40, 30);
  g.fillStyle = 'rgba(232,232,220,0.55)'; g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h);
  g.fillStyle = 'rgba(232,201,90,0.92)'; g.fillRect(w / 2 - 2, 6, 4, 34);
  g.fillStyle = 'rgba(232,201,90,0.55)'; g.fillRect(w / 2 - 2, 88, 4, 34);
}, 1, 6);
const asphaltMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.5, metalness: 0.3, envMapIntensity: 0.7 });
const deckMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.45, metalness: 0.3, color: 0xcfd4da, envMapIntensity: 0.7 });
const dirtMat = new THREE.MeshStandardMaterial({ color: 0x7d6248, roughness: 1 });
const pedMat = new THREE.MeshStandardMaterial({ color: 0x5f7263, roughness: 0.95 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 0.9 });
const concMat = new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.85 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.35, metalness: 0.8, envMapIntensity: 1.1 });
const cableMat = new THREE.LineBasicMaterial({ color: 0xf2e8d5 });

const EDGES = [];
function densify(pts, curve, step = 6) {
  const src = curve ? catmull(pts, 7) : pts;
  const out = [src[0]];
  for (let i = 0; i < src.length - 1; i++) {
    const [ax, az] = src[i], [bx, bz] = src[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / step));
    for (let s = 1; s <= n; s++) out.push([ax + (bx - ax) * s / n, az + (bz - az) * s / n]);
  }
  return out;
}
function E(id, code, cls, pts, o = {}) {
  const dense = densify(pts, !!o.curve, o.step || 6);
  const e = { id, code, cls, pts: dense, w: o.w || 10, bridge: o.bridge || null, bump: o.bump || 0,
    dirt: !!o.dirt, wood: !!o.wood, termStart: !!o.termStart, termEnd: !!o.termEnd, closed: !!o.closed };
  if (e.bridge) { // deck profile: bank heights + bump, sampled per vertex index
    const [ax, az] = dense[0], [bx, bz] = dense[dense.length - 1];
    e.yA = groundH(ax, az) + 0.3; e.yB = groundH(bx, bz) + 0.3;
  }
  e.pts3 = dense.map(([x, z], i) => {
    if (e.bridge) { // deck profile, tapered to road height at both ends so landings have no step
      const t = i / (dense.length - 1);
      const prof = lerp(e.yA, e.yB, t) + e.bump * Math.sin(Math.PI * t);
      const g = groundH(x, z) + 0.07, env = Math.min(1, t / 0.15, (1 - t) / 0.15), s = env * env * (3 - 2 * env);
      return [x, g + (prof - g) * s, z];
    }
    return [x, groundH(x, z) + 0.07, z];
  });
  e.length = 0; for (let i = 1; i < dense.length; i++) e.length += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
  EDGES.push(e); return e;
}
const circlePts = (cx, cz, r, n = 26, a0 = 0, a1 = Math.PI * 2) => {
  const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } return out;
};
const ellipsePts = (cx, cz, rx, rz, n = 26) => {
  const out = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; out.push([cx + rx * Math.cos(a), cz + rz * Math.sin(a)]); } return out;
};
const arcPts = (cx, cz, r, deg0, deg1, n = 20) => {
  const out = []; for (let i = 0; i <= n; i++) { const a = (deg0 + (deg1 - deg0) * i / n) * Math.PI / 180; out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } return out;
};

// --- Downtown: RADIAL around the star roundabout (J5/J7) ---
E('dt-ring', 'R3', 'major', circlePts(STAR[0], STAR[1], 27), { w: 13, closed: true });
E('spN', 'R2', 'major', [STAR, [28, -140], [28, -196]], { w: 15, termEnd: true });
E('spNE', 'R2', 'major', [STAR, [74, -118], [118, -152]], { w: 15, curve: true, termEnd: true });
E('spE', 'R2', 'major', [STAR, [90, -84], [150, -84]], { w: 15, termEnd: true });
E('spW', 'R2', 'major', [STAR, [-30, -84], [-84, -84]], { w: 15 });
E('spSE', 'R2', 'major', [STAR, [42, -58], [52, -38]], { w: 15 });
E('spSW', 'R2', 'major', [STAR, [-2, -58], [-30, -40]], { w: 15 });
E('arc58', 'R3', 'local', arcPts(STAR[0], STAR[1], 58, -180, 63, 26), { w: 11 });
E('arc92', 'R3', 'local', arcPts(STAR[0], STAR[1], 92, -180, 30, 24), { w: 11 });
E('arc92x', 'R3', 'local', [[107.7, -38], [115, -37.2], [122, -38]], { w: 11 });
// --- River crossings (bridge edges) + approaches ---
E('brB2', 'R2', 'major', [[52, -38], [56, -12], [60, 8], [64, 30]], { w: 15, bridge: 'B2', bump: 5.5, curve: true });
E('avS', 'R2', 'major', [[64, 30], [72, 58], [80, 84]], { w: 15, curve: true });
E('brB1a', 'R4', 'local', [[-30, -40], [-27, -12], [-24, 10], [-24, 28]], { w: 10, bridge: 'B1', bump: 2.2, curve: true });
E('brB1b', 'R3', 'local', [[122, -26], [122, 2], [122, 28]], { w: 11, bridge: 'B1', bump: 2.2 });
E('av122n', 'R3', 'local', [[122, -84], [122, -26]], { w: 11 });
E('av122s', 'R3', 'local', [[122, 28], [122, 56]], { w: 11 });
// --- Kota Lama: organic contours on the hill + Tanjakan hairpin ---
E('klStem', 'R4', 'local', [[-84, -84], [-98, -92], [-112, -96]], { w: 9, curve: true });
E('klA', 'R4', 'local', [[-112, -96], [-140, -104], [-172, -100], [-205, -114], [-238, -106]], { w: 9, curve: true, termEnd: true });
E('klB', 'R4', 'local', [[-112, -96], [-138, -122], [-170, -128], [-205, -146], [-232, -140]], { w: 9, curve: true, termEnd: true });
E('klClimb', 'R4', 'local', [[-84, -84], [-102, -72], [-118, -58], [-134, -60], [-140, -48], [-130, -38], [-114, -42], [-104, -30], [-108, -16]], { w: 9, curve: true, termEnd: true });
E('klLink', 'R4', 'local', [[-44, -144], [-72, -126], [-96, -106], [-112, -96]], { w: 9, curve: true });
// --- Lake park (W5): pedestrian ring + link ---
E('lakeRing', 'R8', 'ped', ellipsePts(LAKE_C[0], LAKE_C[1], 58, 42), { w: 4, closed: true });
E('lakeLink', 'R8', 'ped', [[-2, -168], [-14, -162], [-25, -159]], { w: 4, curve: true });
// --- River promenades (pedestrian) ---
E('promN', 'R8', 'ped', [[-150, -30], [-90, -27], [-30, -31], [30, -25], [90, -28]], { w: 4, curve: true });
E('promS', 'R8', 'ped', [[-120, 32], [-60, 26], [0, 30], [70, 34], [130, 30]], { w: 4, curve: true });
// --- Pelabuhan: rigid R7 grid + W3 canal crossings ---
E('hb84w', 'R7', 'local', [[80, 84], [134, 84]], { w: 12 });
E('brB4a', 'R7', 'local', [[134, 84], [140, 84], [146, 84]], { w: 12, bridge: 'B4', bump: 1.0 });
E('hb84e', 'R7', 'local', [[146, 84], [194, 82]], { w: 12 });
E('hb140w', 'R7', 'local', [[88, 140], [134, 140]], { w: 12 });
E('brB4b', 'R7', 'local', [[134, 140], [140, 140], [146, 140]], { w: 12, bridge: 'B4', bump: 1.0 });
E('hb140e', 'R7', 'local', [[146, 140], [174, 138]], { w: 12 });
E('hbPedW', 'R8', 'ped', [[110, 112], [134, 112]], { w: 3.5 });
E('brB6', 'R8', 'ped', [[134, 112], [140, 112], [146, 112]], { w: 3.5, bridge: 'B6', bump: 2.6 });
E('hbPedE', 'R8', 'ped', [[146, 112], [168, 112]], { w: 3.5 });
E('hb164w', 'R7', 'local', [[96, 164], [134, 164]], { w: 12 });
E('brB1c', 'R7', 'local', [[134, 164], [140, 165], [146, 164]], { w: 11, bridge: 'B1', bump: 1.6 });
E('hb164e', 'R7', 'local', [[146, 164], [158, 166]], { w: 11 });
E('hbV104', 'R7', 'local', [[104, 56], [104, 84], [104, 112], [104, 140], [104, 164]], { w: 12 });
E('hbV176', 'R7', 'local', [[176, 60], [176, 84], [176, 108]], { w: 12 });
E('hb56w', 'R7', 'local', [[104, 56], [134, 56]], { w: 12, termEnd: true });
E('hb56e', 'R7', 'local', [[146, 56], [176, 56]], { w: 12, termStart: true });
E('quay', 'R9', 'major', [[188, 48], [194, 82], [188, 108], [178, 132], [166, 154], [158, 166]], { w: 10, curve: true });
E('quayLink', 'R7', 'local', [[188, 48], [181, 51], [176, 56]], { w: 10, curve: true });
// --- Resor: coastal curve R9 + B3 cable-stayed to Pulau Senja ---
E('rs1', 'R9', 'major', [[-6, 192], [36, 184], [84, 192], [126, 182], [150, 166], [164, 152]], { w: 12, curve: true, termStart: true });
E('brB3', 'R3', 'major', [[164, 152], [184, 158], [206, 167]], { w: 12, bridge: 'B3', bump: 6, curve: true });
E('islApp', 'R4', 'local', [[206, 167], [214, 170]], { w: 9 });
E('islRing', 'R4', 'local', ellipsePts(ISLAND_C[0], ISLAND_C[1], 37, 29), { w: 9, closed: true });
E('islSpur', 'R5', 'ped', [[248, 143], [248, 160]], { w: 3, termEnd: true });
// --- Pemukiman: organic streets, Y fork, cul-de-sacs, gangs ---
E('pmMain', 'R4', 'local', [[-24, 28], [-40, 58], [-58, 84], [-52, 116], [-66, 146], [-84, 178]], { w: 9, curve: true, termEnd: true });
E('pmCross1', 'R4', 'local', [[-58, 84], [-96, 78], [-136, 86], [-168, 76]], { w: 9, curve: true, termEnd: true });
E('pmCross2', 'R4', 'local', [[-52, 116], [-92, 124], [-128, 118]], { w: 9, curve: true });
E('pmY1', 'R4', 'local', [[-128, 118], [-152, 138], [-168, 160]], { w: 9, curve: true, termEnd: true });
E('pmY2', 'R4', 'local', [[-128, 118], [-112, 142], [-118, 168]], { w: 9, curve: true, termEnd: true });
E('cds1', 'R4', 'local', [[-40, 58], [-56, 40]], { w: 8, termEnd: true });
E('cds2', 'R4', 'local', [[-96, 78], [-104, 58]], { w: 8, termEnd: true });
E('cds3', 'R4', 'local', [[-136, 86], [-148, 66]], { w: 8, termEnd: true });
E('cds4', 'R4', 'local', [[-66, 146], [-48, 162]], { w: 8, termEnd: true });
E('cds5', 'R4', 'local', [[-152, 138], [-172, 128]], { w: 8, termEnd: true });
E('gang1', 'R5', 'ped', [[-58, 84], [-72, 98]], { w: 3, termEnd: true });
E('gang2', 'R5', 'ped', [[-92, 124], [-104, 110]], { w: 3, termEnd: true });
E('gang3', 'R5', 'ped', [[-40, 58], [-24, 72]], { w: 3, termEnd: true });
E('gang4', 'R5', 'ped', [[-112, 142], [-96, 154]], { w: 3, termEnd: true });
// --- Rawa: dirt roads R6 + B8 causeway over the creek + boardwalk ---
E('rw2', 'R6', 'local', [[-168, 76], [-180, 102], [-178, 126], [-168, 132]], { w: 7, curve: true, dirt: true });
E('rw1', 'R6', 'local', [[-168, 132], [-186, 150], [-196, 152]], { w: 7, curve: true, dirt: true });
E('brB8', 'R6', 'local', [[-196, 152], [-202, 155], [-208, 158]], { w: 7, bridge: 'B8', bump: 0.5 });
E('rw1b', 'R6', 'local', [[-208, 158], [-228, 150], [-252, 164]], { w: 7, curve: true, dirt: true, termEnd: true });
E('boardwalk', 'R8', 'ped', [[-228, 150], [-238, 172], [-228, 196]], { w: 3, curve: true, wood: true, termEnd: true });

// Junctions (typed) + terminals from the graph itself
const JUNCTIONS = [
  { code: 'J5', at: STAR }, { code: 'J7', at: STAR },
  { code: 'J6', at: [211, 172] },
  { code: 'J3', at: [28, -142] }, { code: 'J3', at: [86, -84] }, { code: 'J3', at: [104, 84] },
  { code: 'J3', at: [176, 84] }, { code: 'J3', at: [104, 140] }, { code: 'J3', at: [104, 56] },
  { code: 'J3', at: [122, 112] }, { code: 'J3', at: [28, -84] },
  { code: 'J4', at: [65, -40] }, { code: 'J4', at: [174, 138] }, { code: 'J4', at: [118, -152] },
  { code: 'J2', at: [-112, -96] }, { code: 'J2', at: [-128, 118] },
  { code: 'J1', at: [134, 56] }, { code: 'J1', at: [146, 56] }, { code: 'J1', at: [-40, 58] },
  { code: 'J1', at: [-96, 78] }, { code: 'J1', at: [-136, 86] }, { code: 'J1', at: [150, -84] },
  { code: 'J1', at: [80, 84] }, { code: 'J1', at: [164, 152] },
];
const TERMINALS = [];
for (const e of EDGES) {
  if (e.termStart) TERMINALS.push(e.pts3[0]);
  if (e.termEnd) TERMINALS.push(e.pts3[e.pts3.length - 1]);
}
window.__roadGraph = {
  lines: EDGES.map(e => ({ id: e.id, code: e.code, cls: e.cls, bridge: e.bridge, points: e.pts3 })),
  junctions: JUNCTIONS, terminals: TERMINALS,
  bridges: EDGES.filter(e => e.bridge).map(e => ({ id: e.id, type: e.bridge })),
};

// ---------- road + bridge meshes ----------
function edgeYFn(e) {
  if (!e.bridge) return (x, z) => groundH(x, z) + 0.07;
  return (x, z, i) => { const p = e.pts3[Math.min(i, e.pts3.length - 1)]; return p[1]; };
}
for (const e of EDGES) {
  const mat = e.bridge ? deckMat : e.dirt ? dirtMat : e.wood ? woodMat : e.cls === 'ped' ? pedMat : asphaltMat;
  // height tiers: unlike surfaces never sit coplanar at crossings (a ped path
  // crossing a road at the same height z-fights into a band that cuts the road)
  const yOff = e.bridge ? 0.02 : e.dirt ? 0.005 : e.cls === 'ped' ? -0.01 : 0.02;
  e.mesh = ribbonMesh(e.pts, e.w, mat, edgeYFn(e), yOff);
}
{ // downtown plaza disc under the star (covers spoke/ring overlaps)
  const disc = new THREE.Mesh(new THREE.CircleGeometry(31, 36), asphaltMat);
  disc.rotation.x = -Math.PI / 2; disc.position.set(STAR[0], groundH(STAR[0], STAR[1]) + 0.06, STAR[1]);
  disc.receiveShadow = true; scene.add(disc);
}
{ // junction discs + terminal bulbs: fill the corner wedges where ribbons meet at
  // an angle and round off true dead ends, so no road reads as cut at a corner.
  const segProj = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let t = L2 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const qx = ax + dx * t, qz = az + dz * t;
    return { d: Math.hypot(px - qx, pz - qz), qx, qz };
  };
  const segCross = (ax, az, bx, bz, cx, cz, dx, dz) => {
    const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
    const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t };
  };
  const kindOf = e => e.dirt ? 'dirt' : e.wood ? 'wood' : e.cls === 'ped' ? 'ped' : 'asphalt';
  const patches = [];
  const addPatch = (x, z, r, kind) => {
    if (Math.hypot(x - STAR[0], z - STAR[1]) < 24) return; // plaza disc covers the star
    for (const p of patches) if (Math.hypot(p.x - x, p.z - z) < 3) { p.r = Math.max(p.r, r); if (kind === 'asphalt') p.kind = 'asphalt'; return; }
    patches.push({ x, z, r, kind });
  };
  const BB = EDGES.map(e => { const a = [1e9, 1e9, -1e9, -1e9]; for (const [x, z] of e.pts) { a[0] = Math.min(a[0], x); a[1] = Math.min(a[1], z); a[2] = Math.max(a[2], x); a[3] = Math.max(a[3], z); } return a; });
  for (let i = 0; i < EDGES.length; i++) for (let j = i + 1; j < EDGES.length; j++) {
    const a = EDGES[i], b = EDGES[j];
    if (BB[i][0] > BB[j][2] + 12 || BB[j][0] > BB[i][2] + 12 || BB[i][1] > BB[j][3] + 12 || BB[j][1] > BB[i][3] + 12) continue;
    const kind = (a.cls === 'ped' && b.cls === 'ped') ? 'ped' : 'asphalt';
    const r = Math.max(a.w, b.w) / 2 + 0.6;
    for (let s = 0; s < a.pts.length - 1; s++) for (let t = 0; t < b.pts.length - 1; t++) {
      const c = segCross(a.pts[s][0], a.pts[s][1], a.pts[s + 1][0], a.pts[s + 1][1], b.pts[t][0], b.pts[t][1], b.pts[t + 1][0], b.pts[t + 1][1]);
      if (c) addPatch(c.x, c.z, r, kind);
    }
    for (const e of [a, b]) { // endpoint landing on the other edge (T-junction / shared point)
      const o = e === a ? b : a;
      for (const p of [e.pts[0], e.pts[e.pts.length - 1]]) {
        let best = { d: 1e9 };
        for (let s = 0; s < o.pts.length - 1; s++) { const q = segProj(p[0], p[1], o.pts[s][0], o.pts[s][1], o.pts[s + 1][0], o.pts[s + 1][1]); if (q.d < best.d) best = q; }
        if (best.d < o.w / 2 + 0.5) addPatch(best.qx, best.qz, r, kind);
      }
    }
  }
  for (const e of EDGES) { // true dead ends get a round bulb instead of a flat cut
    if (e.closed) continue;
    for (const p of [e.pts[0], e.pts[e.pts.length - 1]]) {
      if (Math.hypot(p[0] - 134, p[1] - 56) < 2 || Math.hypot(p[0] - 146, p[1] - 56) < 2) continue; // canal banks: drawbridge gap, R-C work
      let gap = 1e9;
      for (const o of EDGES) { if (o === e) continue; for (let s = 0; s < o.pts.length - 1; s++) { const q = segProj(p[0], p[1], o.pts[s][0], o.pts[s][1], o.pts[s + 1][0], o.pts[s + 1][1]); gap = Math.min(gap, q.d - o.w / 2); } }
      if (gap > 0.5) addPatch(p[0], p[1], e.w / 2 + 0.4, kindOf(e));
    }
  }
  const MATS = { asphalt: asphaltMat, ped: pedMat, dirt: dirtMat, wood: woodMat };
  const byKind = {};
  for (const p of patches) (byKind[p.kind] = byKind[p.kind] || []).push(p);
  for (const kind of Object.keys(byKind)) {
    const verts = [], idx = [], uvs = []; const SEG = 10;
    for (const p of byKind[kind]) {
      const base = verts.length / 3;
      verts.push(p.x, groundH(p.x, p.z) + 0.055, p.z); uvs.push(0.5, 0.5);
      for (let s = 0; s <= SEG; s++) {
        const a = s / SEG * Math.PI * 2, vx = p.x + Math.cos(a) * p.r, vz = p.z + Math.sin(a) * p.r;
        verts.push(vx, groundH(vx, vz) + 0.055, vz); uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
        if (s > 0) idx.push(base, base + s + 1, base + s);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, MATS[kind]); m.receiveShadow = true; scene.add(m);
  }
}
function tubeAlong(pts3, radius, mat, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(pts3.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(6, pts3.length * 2), radius, radial), mat);
  m.castShadow = true; scene.add(m); return m;
}
function offsetPts3(e, off, yPlus = 0) {
  return e.pts.map(([x, z], i) => {
    const p = e.pts, [px, pz] = p[Math.max(0, i - 1)], [nx, nz] = p[Math.min(p.length - 1, i + 1)];
    let dx = nx - px, dz = nz - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    return [x - dz * off, e.pts3[i][1] + yPlus, z + dx * off];
  });
}
function pierAt(e, t) {
  const i = Math.round(t * (e.pts3.length - 1)), [x, y, z] = e.pts3[i];
  const h = y + 2.6;
  const pier = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, h, 8), concMat);
  pier.position.set(x, y - h / 2 + 0.2, z); pier.castShadow = true; scene.add(pier);
}
function buildBridgeStructures(e) {
  const n = e.pts3.length, mid = e.pts3[Math.floor(n / 2)];
  if (e.bridge === 'B1') {
    tubeAlong(offsetPts3(e, e.w / 2 - 0.3, 0.55), 0.09, steelMat);
    tubeAlong(offsetPts3(e, -(e.w / 2 - 0.3), 0.55), 0.09, steelMat);
    pierAt(e, 0.5);
  } else if (e.bridge === 'B2') {
    for (const s of [-1, 1]) { // twin arches under the deck
      const arc = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10, p0 = e.pts3[Math.round(t * (n - 1))];
        arc.push([p0[0] + 0, p0[1] - 4.6 * Math.sin(Math.PI * t) - 0.3, p0[2]]); }
      // offset sideways in world X/Z by deck direction approx: use offsetPts3 on a fake pts3
      const off = e.pts.map(([x, z], i) => { const p = e.pts, [px, pz] = p[Math.max(0, i - 1)], [nx, nz] = p[Math.min(p.length - 1, i + 1)];
        let dx = nx - px, dz = nz - pz; const L = Math.hypot(dx, dz) || 1; return [x - dz / L * s * (e.w / 2 - 0.5), z + dx / L * s * (e.w / 2 - 0.5)]; });
      const arcOff = arc.map((p, i) => { const t = i / 10, oi = Math.round(t * (n - 1)); return [off[oi][0], p[1], off[oi][1]]; });
      tubeAlong(arcOff, 0.38, steelMat, 7);
    }
    pierAt(e, 0.32); pierAt(e, 0.68);
  } else if (e.bridge === 'B3') {
    const deckY = mid[1];
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.8, 30, 3), concMat);
    pylon.position.set(mid[0], deckY + 11, mid[2]); pylon.castShadow = true; scene.add(pylon);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 3.8),
      new THREE.MeshStandardMaterial({ color: 0x39d0c4, emissive: 0x39d0c4, emissiveIntensity: 1.6, roughness: 0.4 }));
    cap.position.set(mid[0], deckY + 26.4, mid[2]); scene.add(cap); // emissive cap -> blooms
    const pts = [];
    for (const t of [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92]) {
      const p = e.pts3[Math.round(t * (n - 1))];
      pts.push(mid[0], deckY + 25.6, mid[2], p[0], p[1] + 0.4, p[2]);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(cg, cableMat));
    tubeAlong(offsetPts3(e, e.w / 2 - 0.2, -0.25), 0.16, steelMat);
    tubeAlong(offsetPts3(e, -(e.w / 2 - 0.2), -0.25), 0.16, steelMat);
    pierAt(e, 0.5);
  } else if (e.bridge === 'B4') {
    for (const tt of [0.06, 0.94]) { // tower frames on both banks (structure built; lift gated to R-C)
      const i = Math.round(tt * (n - 1)), [x, y, z] = e.pts3[i];
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.7), steelMat);
        // posts stand across the deck width (canal runs N-S, deck runs E-W -> width along Z)
        post.position.set(x, y + 3.4, z + s * (e.w / 2 - 0.5)); post.castShadow = true; scene.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, e.w), steelMat);
      beam.position.set(x, y + 7.2, z); beam.castShadow = true; scene.add(beam);
    }
  } else if (e.bridge === 'B6') {
    for (const s of [-1, 1]) {
      const arc = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8, p0 = e.pts3[Math.round(t * (n - 1))];
        arc.push([p0[0], p0[1] + 1.1 * Math.sin(Math.PI * t) + 0.5, p0[2] + s * (e.w / 2 - 0.2)]); }
      tubeAlong(arc, 0.11, steelMat);
    }
  } else if (e.bridge === 'B8') {
    tubeAlong(offsetPts3(e, e.w / 2 - 0.2, 0.18), 0.13, woodMat);
    tubeAlong(offsetPts3(e, -(e.w / 2 - 0.2), 0.18), 0.13, woodMat);
  }
}
for (const e of EDGES) if (e.bridge) buildBridgeStructures(e);

// ======================================================================
// BUILDINGS — shape-first generator. Footprint family chosen per lot
// FIRST (F1 capped, hard cap enforced), boxes/cylinders merged per
// material bucket (few draws for the whole city), roofs merged as one.
// ======================================================================
const BRANDS = ['KOPI SENJA', 'SENJA MART', 'HOTEL PALEM', 'WARUNG SARI', 'SENJA PHONE', 'BANK SENJA',
  'ISIsenja', 'LAUNDRY KILAT', 'BENGKEL RAKA JAYA', 'TV SENJA', 'MIE OMBAK', 'KLINIK SEHAT SENJA', 'PASAR SENJA', 'RADIO PANTAI FM', 'TOKO SENJATA BANG RUDI'];
function facadeTex(base, neon, variant, litRatio) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + trnd() * 0.05})`; g.fillRect(trnd() * w, 0, 3 + trnd() * 9, h); }
    if (variant === 1) { g.fillStyle = 'rgba(255,255,255,0.16)'; for (let y = 24; y < h - 30; y += 26) g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(0,0,0,0.20)'; for (let y = 27; y < h - 30; y += 26) g.fillRect(0, y, w, 2); }
    if (variant === 2) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(w * 0.62, 0, w * 0.16, h); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(w * 0.62, 0, 3, h); }
    if (variant === 4) {
      for (let y = 20; y < h - 34; y += 26) { const lit = trnd() < litRatio;
        g.fillStyle = lit ? (trnd() > 0.4 ? '#ffd98a' : '#9fe8ff') : '#232833'; g.fillRect(12, y, w - 24, 10);
        g.fillStyle = 'rgba(10,10,14,0.65)'; for (let x = 30; x < w - 16; x += 18) g.fillRect(x, y, 2, 10);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(12, y + 10, w - 24, 3); }
    } else {
      const ww = variant === 3 ? 12 : 17, wh = variant === 3 ? 10 : 13, sx = variant === 3 ? 20 : 30, sy = variant === 3 ? 20 : 26;
      for (let y = 18; y < h - 20; y += sy) for (let x = 14; x < w - 20; x += sx) {
        const lit = trnd() < litRatio;
        g.fillStyle = lit ? (trnd() > 0.45 ? '#ffd98a' : '#9fe8ff') : '#20242e'; g.fillRect(x, y, ww, wh);
        if (variant === 5 && trnd() < 0.8) { g.fillStyle = 'rgba(0,0,0,0.40)'; g.fillRect(x - 3, y + wh + 4, ww + 6, 3);
          g.fillStyle = 'rgba(228,222,210,0.85)'; g.fillRect(x - 3, y + wh, ww + 6, 3.4); }
        if (!lit && trnd() < 0.25) { g.fillStyle = 'rgba(160,170,190,0.5)'; g.fillRect(x + 3, y + 3, 5, 5); }
      }
    }
    const dirt = g.createLinearGradient(0, h * 0.55, 0, h);
    dirt.addColorStop(0, 'rgba(24,17,12,0)'); dirt.addColorStop(0.75, 'rgba(24,17,12,0.30)'); dirt.addColorStop(1, 'rgba(16,11,8,0.52)');
    g.fillStyle = dirt; g.fillRect(0, h * 0.55, w, h * 0.45);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, h - 44, w, 44);
    if (neon) { g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
      g.shadowColor = '#ff4fd8'; g.shadowBlur = 14; g.fillStyle = '#ff9df0'; g.fillText(neon, w / 2, h - 16); }
  });
}
const PALETTES = {
  downtown: ['#e8d9b8', '#c9d4dd', '#e5b8a0', '#d9c9e8', '#f0e0c0', '#b8ccd9'],
  kotalama: ['#e3cfa8', '#d9a066', '#c96f4a', '#e8e0cc', '#b8c4a8'],
  pelabuhan: ['#b0563a', '#4a7a8a', '#c7a23a', '#7a8a99', '#9a5a44', '#5a7a5a'],
  resor: ['#f2ead8', '#cfe4dd', '#f5d9c0', '#dcebf2', '#f2d8d8'],
  pemukiman: ['#eef2dc', '#cfe0b8', '#e8e4c8', '#d8e4d0', '#f0e8d0'],
  island: ['#f2ead8', '#d8ecec', '#f5e2c8', '#e2f0e8'],
  rawa: ['#cbb894', '#b8a888', '#d0bc98'],
  park: ['#e8e0cc', '#d8e4d0'],
};
const matBuckets = new Map(); // key -> {mat, geoms:[]}
function bucketMat(key, mat) { if (!matBuckets.has(key)) matBuckets.set(key, { mat, geoms: [] }); return matBuckets.get(key); }
function facadeMat(paletteName, palIdx, variant, litBucket, neon) {
  const base = PALETTES[paletteName][palIdx % PALETTES[paletteName].length];
  const key = `f|${base}|${variant}|${litBucket}|${neon ? 1 : 0}`;
  if (!matBuckets.has(key)) {
    const mat = new THREE.MeshStandardMaterial({ map: facadeTex(base, neon, variant, litBucket), roughness: 0.85, envMapIntensity: 0.35 });
    matBuckets.set(key, { mat, geoms: [] });
  }
  return key;
}
const concKey = 'plain|conc'; bucketMat(concKey, concMat);
const glassKey = 'plain|glass'; bucketMat(glassKey, new THREE.MeshStandardMaterial({ color: 0x9fd8e8, roughness: 0.15, metalness: 0.7, envMapIntensity: 1.2 }));
function pushGeo(key, geo) { matBuckets.get(key).geoms.push(geo); }
function scaleBoxUV(geo, w, h, d) { // one facade tile per ~24 m: windows read at street distance
  const uv = geo.attributes.uv, vs = Math.max(1, Math.round(h / 24)), uw = Math.max(1, Math.round(w / 24)), ud = Math.max(1, Math.round(d / 24));
  for (let i = 0; i < uv.count; i++) { const face = Math.floor(i / 4);
    if (face === 0 || face === 1) uv.setXY(i, uv.getX(i) * ud, uv.getY(i) * vs);
    else if (face === 4 || face === 5) uv.setXY(i, uv.getX(i) * uw, uv.getY(i) * vs); }
  return geo;
}
function addBox(key, cx, cy, cz, w, h, d, rotY) {
  const g = new THREE.BoxGeometry(w, h, d); scaleBoxUV(g, w, h, d);
  g.rotateY(rotY); g.translate(cx, cy, cz); pushGeo(key, g);
}
function addCyl(key, cx, cy, cz, r, h, seg, rotY, thetaStart = 0, thetaLen = Math.PI * 2) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, false, thetaStart, thetaLen);
  const uv = g.attributes.uv; const vs = Math.max(1, Math.round(h / 24));
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(2, Math.round(r / 3)), uv.getY(i) * vs);
  g.rotateY(rotY); g.translate(cx, cy, cz); pushGeo(key, g);
}
function addWedge(key, cx, cy, cz, w, h, d, rotY) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, -d / 2); sh.lineTo(w / 2, -d / 2); sh.lineTo(w * 0.08, d / 2); sh.lineTo(-w / 2, -d / 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // shape XY -> XZ footprint, extrusion -> +Y (0..h)
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 24, uv.getY(i) / 24);
  g.rotateY(rotY); g.translate(cx, cy - h / 2, cz); pushGeo(key, g);
}
// merged roofs (one draw) + gables (one draw)
const roofPos = [], roofNorm = [], gablePos = [];
function addRoofQuad(cx, cz, y, w, d, rotY) {
  const c = Math.cos(rotY), s = Math.sin(rotY), hw = w / 2, hd = d / 2;
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
  for (const [a, b, cc] of [[0, 2, 1], [0, 3, 2]]) {
    for (const i of [a, b, cc]) { roofPos.push(corners[i][0], y, corners[i][1]); roofNorm.push(0, 1, 0); }
  }
}
function addRoofDisc(cx, cz, y, r, seg = 10) {
  for (let i = 0; i < seg; i++) { const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    roofPos.push(cx, y, cz, cx + r * Math.cos(a0), y, cz + r * Math.sin(a0), cx + r * Math.cos(a1), y, cz + r * Math.sin(a1));
    roofNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0); }
}
function addGable(cx, cy, cz, w, d, gh, rotY) { // prism along local X
  const A = [-w / 2, 0, -d / 2], B = [-w / 2, 0, d / 2], C = [-w / 2, gh, 0], D = [w / 2, 0, -d / 2], E = [w / 2, 0, d / 2], F = [w / 2, gh, 0];
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const T = p => [cx + p[0] * c + p[2] * s, cy + p[1], cz - p[0] * s + p[2] * c];
  for (const tri of [[A, C, F], [A, F, D], [B, E, F], [B, F, C]]) for (const p of tri) gablePos.push(...T(p));
}

// ---------- lot placement ----------
// Clearance uses two radii: rNear (half-depth toward the road/water — the
// tight test) and rFar (half-diagonal — the lot-overlap test). Dense radial
// bands sit 14-17 m from road centrelines, so a single circular radius
// would reject the whole downtown.
const placedLots = [];
function lotClear(x, z, rNear, rFar, minH = 0.55) {
  if (groundH(x, z) < minH) return false;
  const rd = riverDist(x, z); if (rd.d - rd.hw < rNear + 5) return false;
  const lx = (x - LAKE_C[0]) / (LAKE_RX + rNear + 6), lz = (z - LAKE_C[1]) / (LAKE_RZ + rNear + 6);
  if (lx * lx + lz * lz < 1) return false;
  if (Math.abs(x - CANAL_X) < CANAL_HW + rNear + 2.5 && z > CANAL_Z0 - 6 && z < CANAL_Z1 + 6) return false;
  if (Math.hypot(x - STAR[0], z - STAR[1]) < 33 + rNear * 0.5) return false;
  for (const e of EDGES) if (distToPolyline(x, z, e.pts) < e.w / 2 + rNear + 0.6) return false;
  for (const o of placedLots) if (Math.hypot(x - o.x, z - o.z) < rFar + o.r + 2) return false;
  return true;
}
const FAM_WEIGHTS = {
  downtown: { F9: .20, F2: .12, F3: .10, F4: .10, F5: .12, F6: .12, F7: .04, F8: .08, F10: .06, F1: .06 },
  kotalama: { F13: .32, F2: .16, F6: .14, F5: .12, F8: .08, F1: .18 },
  pelabuhan: { F12: .52, F2: .14, F4: .12, F1: .22 },
  resor: { F11: .20, F6: .18, F7: .12, F3: .14, F10: .12, F5: .10, F1: .14 },
  pemukiman: { F2: .22, F13: .18, F5: .14, F6: .12, F8: .08, F1: .26 },
  island: { F7: .24, F6: .24, F11: .24, F3: .16, F1: .12 },
  rawa: { F13: .55, F2: .20, F1: .25 },
  park: { F8: .5, F6: .5 },
};
const buildingTags = [], colliders = [];
let f1Count = 0;
function chooseFamily(district) {
  const table = FAM_WEIGHTS[district]; let roll = rnd(), fam = 'F1';
  for (const k in table) { if (roll < table[k]) { fam = k; break; } roll -= table[k]; }
  const total = buildingTags.length;
  if (fam === 'F1' && total > 12 && f1Count / total > 0.36) { // hard cap: reroll non-F1
    const alts = Object.keys(table).filter(k => k !== 'F1'); fam = pick(alts);
  }
  return fam;
}
const lastByDistrict = {};
function placeBuilding(x, z, rotY, district, opt = {}) {
  const fam = opt.family || chooseFamily(district);
  const palIdx = Math.floor(rr(0, PALETTES[district].length));
  const variant = Math.floor(rr(0, 6));
  const litBucket = pick([0.35, 0.5, 0.65]);
  const neon = (district === 'downtown' || district === 'resor') && rnd() < 0.4 ? pick(BRANDS) : null;
  const key = facadeMat(district, palIdx, variant, litBucket, neon);
  let w = opt.w || rr(13, 20), d = opt.d || rr(12, 18), h = opt.h || rr(9, 20);
  if (district === 'downtown') { w = opt.w || rr(11, 17); d = opt.d || rr(10, 15); h = opt.h || rr(16, 46); }
  if (district === 'pelabuhan') { w = opt.w || rr(14, 19); d = opt.d || rr(11, 13); h = opt.h || rr(8, 13); }
  if (district === 'island') { w = opt.w || rr(10, 15); d = opt.d || rr(9, 13); }
  if (district === 'pemukiman' || district === 'kotalama') { w = opt.w || rr(9, 13); d = opt.d || rr(8, 12); h = opt.h || rr(5.5, 12); }
  if (district === 'rawa') { w = opt.w || rr(8, 11); d = opt.d || rr(7, 10); h = opt.h || rr(4, 6); }
  if (district === 'resor') h = opt.h || rr(10, 24);
  if (district === 'island') h = opt.h || rr(8, 18);
  // actual footprint half-extents per family (F12 is 1.5x long, F9 podium 1.3x)
  let hw = w / 2, hd = d / 2;
  if (fam === 'F12') hw = w * 0.75;
  if (fam === 'F9') { hw = w * 0.65; hd = d * 0.65; }
  if (fam === 'F6') { hw = w * 0.62; hd = w * 0.62; }
  if (fam === 'F7' || fam === 'F8') { hw = Math.min(w, d) * 0.55; hd = hw; }
  const rNear = Math.min(hw, hd), rFar = Math.max(hw, hd) * 0.62;
  if (!lotClear(x, z, rNear, rFar, district === 'rawa' ? 0.22 : 0.55)) return false;
  // no identical neighbours: same family+palette+near height as previous in district -> shift
  const last = lastByDistrict[district];
  if (last && last.fam === fam && last.palIdx === palIdx && Math.abs(last.h - h) < 2) h += rr(3.5, 7);
  lastByDistrict[district] = { fam, palIdx, h };
  const baseY = groundH(x, z);
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const L2W = (ox, oz) => [x + ox * c + oz * s, z - ox * s + oz * c];
  const box = (ox, oz, bw, bh, bd, yOff = 0, k = key) => {
    const [wx, wz] = L2W(ox, oz); const by = groundH(wx, wz);
    addBox(k, wx, by + bh / 2 - 0.3 + yOff, wz, bw, bh, bd, rotY);
    return by + bh - 0.3 + yOff;
  };
  const skirt = () => addBox(concKey, x, baseY - 0.9, z, w + 1.6, 2.4, d + 1.6, rotY);
  skirt();
  let topY = baseY + h;
  if (fam === 'F1') { topY = box(0, 0, w, h, d); addRoofQuad(x, z, topY + 0.06, w, d, rotY); }
  else if (fam === 'F2') { const t1 = box(0, -d * 0.18, w, h, d * 0.62); const t2 = box(w * 0.22, d * 0.2, w * 0.55, h * 0.78, d * 0.55);
    addRoofQuad(...L2W(0, -d * 0.18), t1 + 0.06, w, d * 0.62, rotY); addRoofQuad(...L2W(w * 0.22, d * 0.2), t2 + 0.06, w * 0.55, d * 0.55, rotY); }
  else if (fam === 'F3' || fam === 'F10') {
    const t1 = box(-w * 0.33, d * 0.08, w * 0.32, h, d * 0.68); const t2 = box(w * 0.33, d * 0.08, w * 0.32, h, d * 0.68);
    const t3 = box(0, -d * 0.32, w, h, d * 0.34);
    addRoofQuad(...L2W(-w * 0.33, d * 0.08), t1 + 0.06, w * 0.32, d * 0.68, rotY);
    addRoofQuad(...L2W(w * 0.33, d * 0.08), t2 + 0.06, w * 0.32, d * 0.68, rotY);
    addRoofQuad(...L2W(0, -d * 0.32), t3 + 0.06, w, d * 0.34, rotY);
    if (fam === 'F10') { const [gx, gz] = L2W(0, d * 0.08); addBox(glassKey, gx, baseY + h - 0.1, gz, w * 0.3, 0.5, d * 0.3, rotY); }
  }
  else if (fam === 'F4') {
    if (rnd() < 0.5) { const t1 = box(0, 0, w * 0.36, h, d); const t2 = box(0, d * 0.3, w, h * 0.92, d * 0.38);
      addRoofQuad(x, z, t1 + 0.06, w * 0.36, d, rotY); addRoofQuad(...L2W(0, d * 0.3), t2 + 0.06, w, d * 0.38, rotY); }
    else { const t1 = box(-w * 0.33, 0, w * 0.34, h, d); const t2 = box(w * 0.33, 0, w * 0.34, h, d); const t3 = box(0, 0, w * 0.4, h * 0.68, d * 0.3);
      addRoofQuad(...L2W(-w * 0.33, 0), t1 + 0.06, w * 0.34, d, rotY); addRoofQuad(...L2W(w * 0.33, 0), t2 + 0.06, w * 0.34, d, rotY); addRoofQuad(x, z, t3 + 0.06, w * 0.4, d * 0.3, rotY); }
  }
  else if (fam === 'F5') { addWedge(key, x, baseY + h / 2 - 0.3, z, w, h, d, rotY); addRoofQuad(x, z, baseY + h - 0.24, w * 0.8, d * 0.8, rotY); }
  else if (fam === 'F6') { const r = w * 0.62; addCyl(key, x, baseY + h / 2 - 0.3, z, r, h, 14, rotY, -0.95, 1.9); addRoofDisc(x, z, baseY + h - 0.24, r * 0.92, 12); }
  else if (fam === 'F7') { const r = Math.min(w, d) * 0.52; addCyl(key, x, baseY + h / 2 - 0.3, z, r, h, 20, rotY); addRoofDisc(x, z, baseY + h - 0.24, r, 14); }
  else if (fam === 'F8') { const r = Math.min(w, d) * 0.55; addCyl(key, x, baseY + h / 2 - 0.3, z, r, h, pick([6, 8]), rotY); addRoofDisc(x, z, baseY + h - 0.24, r, 8); }
  else if (fam === 'F9') { const ph = Math.min(6.5, h * 0.3); const t1 = box(0, 0, w * 1.3, ph, d * 1.3);
    const t2 = box(w * 0.06, -d * 0.04, w * 0.62, h - ph, d * 0.62, ph - 0.3);
    addRoofQuad(x, z, t1 + 0.06, w * 1.3, d * 1.3, rotY); addRoofQuad(...L2W(w * 0.06, -d * 0.04), t2 + 0.06, w * 0.62, d * 0.62, rotY); }
  else if (fam === 'F11') { const t1 = box(-w * 0.3, -d * 0.1, w * 0.5, h * 0.72, d * 0.55); const t2 = box(w * 0.28, d * 0.16, w * 0.55, h, d * 0.6); const t3 = box(w * 0.05, -d * 0.38, w * 0.45, h * 0.5, d * 0.4);
    addRoofQuad(...L2W(-w * 0.3, -d * 0.1), t1 + 0.06, w * 0.5, d * 0.55, rotY); addRoofQuad(...L2W(w * 0.28, d * 0.16), t2 + 0.06, w * 0.55, d * 0.6, rotY); addRoofQuad(...L2W(w * 0.05, -d * 0.38), t3 + 0.06, w * 0.45, d * 0.4, rotY); }
  else if (fam === 'F12') { const t1 = box(0, 0, w * 1.5, h, d); addGable(x, t1, z, w * 1.5, d, rr(2.2, 3.4), rotY); }
  else if (fam === 'F13') { const steps = 3; let ly = baseY;
    for (let i = 0; i < steps; i++) { const sh = h - i * (h / steps) * 0.7, [wx, wz] = L2W(0, -i * d * 0.3);
      const by = groundH(wx, wz); addBox(key, wx, by + sh / 2 - 0.3, wz, w * (1 - i * 0.16), sh, d * 0.55, rotY);
      addRoofQuad(wx, wz, by + sh - 0.24, w * (1 - i * 0.16), d * 0.55, rotY); ly = by; } }
  buildingTags.push({ code: fam, district, x, z, h });
  if (fam === 'F1') f1Count++;
  colliders.push({ minX: x - hw - 0.5, maxX: x + hw + 0.5, minZ: z - hd - 0.5, maxZ: z + hd + 0.5 });
  placedLots.push({ x, z, r: rFar });
  return true;
}
function tryPlace(x, z, rotY, district, opt = {}) { return placeBuilding(x, z, rotY, district, opt); }
// Downtown: lots on rings around the star (facing the centre), centred in
// the clear bands between ring road (r27) / arc58 / arc92
for (const ringR of [43, 75, 108, 128]) {
  const stepA = ringR < 50 ? 20 : ringR < 85 ? 16 : ringR < 118 ? 13 : 12;
  for (let aDeg = -195; aDeg < 60; aDeg += stepA) {
    const a = (aDeg + rr(-3, 3)) * Math.PI / 180;
    const x = STAR[0] + ringR * Math.cos(a), z = STAR[1] + ringR * Math.sin(a);
    if (z > -18) continue; // south sector is the riverbank promenade
    tryPlace(x, z, -a + Math.PI / 2 + rr(-0.05, 0.05), 'downtown', { h: ringR < 50 ? rr(24, 48) : ringR < 85 ? rr(16, 38) : rr(11, 26) });
  }
}
// Menara Senja — cylindrical landmark on the radial (F7), in the r=75 band
tryPlace(71, -145, 0.4, 'downtown', { family: 'F7', w: 18, d: 18, h: 58 });
// Kota Lama + Pemukiman + Resor: corridor lots along organic roads
function corridorLots(edgeIds, district, spacing, offMin, offMax, opt = {}) {
  for (const id of edgeIds) {
    const e = EDGES.find(q => q.id === id); if (!e) continue;
    let acc = spacing * 0.5;
    for (let i = 1; i < e.pts.length; i++) {
      const segL = Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]); acc += segL;
      if (acc < spacing) continue; acc = 0;
      const [x, z] = e.pts[i], [px, pz] = e.pts[i - 1];
      let dx = x - px, dz = z - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      for (const s of [1, -1]) {
        if (rnd() < 0.3) continue;
        const off = s * rr(offMin, offMax);
        tryPlace(x - dz * off, z + dx * off, Math.atan2(dx, dz) + (s > 0 ? 0 : Math.PI) + rr(-0.14, 0.14), district, opt);
      }
    }
  }
}
corridorLots(['klA', 'klB', 'klClimb', 'klStem'], 'kotalama', 19, 12, 17);
corridorLots(['pmMain', 'pmCross1', 'pmCross2', 'pmY1', 'pmY2'], 'pemukiman', 16, 12, 16);
corridorLots(['rs1'], 'resor', 19, 13, 18, { h: 14 });
// Pelabuhan: warehouse lots centred in the two wide bands (104..canal, canal..176)
for (const bx of [119, 161]) for (const bz of [70, 98, 126, 152]) {
  tryPlace(bx + rr(-1.5, 1.5), bz + rr(-1.5, 1.5), Math.PI / 2 + rr(-0.05, 0.05), 'pelabuhan', {});
}
for (const bz of [98, 126]) tryPlace(88, bz, Math.PI / 2 + rr(-0.05, 0.05), 'pelabuhan', {});
// Pulau Senja: ring lots facing outward + one central resort cluster
for (let aDeg = 0; aDeg < 360; aDeg += 32) {
  const a = (aDeg + rr(-5, 5)) * Math.PI / 180;
  tryPlace(ISLAND_C[0] + 21 * Math.cos(a), ISLAND_C[1] + 16.5 * Math.sin(a), -a, 'island', {});
}
tryPlace(ISLAND_C[0], ISLAND_C[1], 0.3, 'island', { family: 'F11', w: 20, d: 18, h: 13, r: 12 });
// Rawa stilt houses along the dirt roads
corridorLots(['rw1', 'rw1b', 'rw2'], 'rawa', 21, 10, 14);
// Park pavilion + cafe by the lake
tryPlace(-124, -138, 0.7, 'park', { family: 'F8', w: 13, d: 13, h: 7, r: 8 });
tryPlace(2, -196, -0.4, 'park', { family: 'F6', w: 14, d: 12, h: 6, r: 8 });
// Merge all buckets into one mesh per material
function mergeGeoms(geoms) {
  let total = 0; for (const g of geoms) total += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o3 = 0, o2 = 0;
  for (const g of geoms) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.set(ng.attributes.position.array, o3); nor.set(ng.attributes.normal.array, o3);
    if (ng.attributes.uv) uv.set(ng.attributes.uv.array, o2);
    o3 += ng.attributes.position.count * 3; o2 += ng.attributes.position.count * 2;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
for (const [, b] of matBuckets) {
  if (!b.geoms.length) continue;
  const m = new THREE.Mesh(mergeGeoms(b.geoms), b.mat);
  m.castShadow = true; m.receiveShadow = true; scene.add(m);
}
{ // merged roofs + gables
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
  rg.setAttribute('normal', new THREE.Float32BufferAttribute(roofNorm, 3));
  const roofs = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x3a3340, roughness: 0.95 }));
  roofs.receiveShadow = true; scene.add(roofs);
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gablePos, 3));
  gg.computeVertexNormals();
  const gables = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0x7a4436, roughness: 0.9, flatShading: true }));
  gables.castShadow = true; scene.add(gables);
}
// Menara Senja dressing: balcony ring + emissive crown (blooms)
{
  const base = buildingTags.find(t => t.code === 'F7' && t.h > 50);
  if (base) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(10.4, 10.4, 1.4, 24),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5f, roughness: 0.7 }));
    ring.position.set(base.x, groundH(base.x, base.z) + 45, base.z); ring.castShadow = true; scene.add(ring);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(9.8, 9.8, 1.1, 24),
      new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a3d, emissiveIntensity: 2.2, roughness: 0.4 }));
    crown.position.set(base.x, groundH(base.x, base.z) + base.h - 1.2, base.z); scene.add(crown);
  }
}
window.__buildingTags = buildingTags;
window.__colliders = colliders;

// ======================================================================
// DRESSING — instanced vegetation/lamps, harbour props, monument
// ======================================================================
const dummy = new THREE.Object3D();
function makeInstanced(geo, mat, mats4, colors = null) {
  const im = new THREE.InstancedMesh(geo, mat, mats4.length);
  mats4.forEach((m, i) => im.setMatrixAt(i, m));
  if (colors) mats4.forEach((m, i) => im.setColorAt(i, colors[i]));
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  scene.add(im); return im;
}
function mat4At(x, y, z, ry, sx, sy, sz) {
  dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix(); return dummy.matrix.clone();
}
const palmSpots = [], treeSpots = [], grassSpots = [];
function vegClear(x, z, minH = 0.6) {
  if (groundH(x, z) < minH) return false;
  for (const e of EDGES) if (distToPolyline(x, z, e.pts) < e.w / 2 + 1.4) return false;
  for (const o of placedLots) if (Math.hypot(x - o.x, z - o.z) < o.r + 1.6) return false;
  return true;
}
{ // palms along roads (offset from edge), park ring, island, beaches
  for (const e of EDGES) {
    if (e.cls === 'ped' && e.id !== 'promN' && e.id !== 'promS') continue;
    let acc = rr(2, 8);
    for (let i = 1; i < e.pts.length; i++) {
      acc += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
      if (acc < 15) continue; acc = 0;
      if (rnd() < 0.35) continue;
      const [x, z] = e.pts[i], [px, pz] = e.pts[i - 1];
      let dx = x - px, dz = z - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const s = rnd() < 0.5 ? 1 : -1, off = e.w / 2 + rr(2.2, 3.6);
      const vx = x - dz * off * s, vz = z + dx * off * s;
      if (vegClear(vx, vz)) palmSpots.push([vx, vz]);
    }
  }
  for (let i = 0; i < 130; i++) { // park + hill + island scatter (trees)
    const x = rr(-260, 290), z = rr(-215, 215);
    if (vegClear(x, z) && (x < -50 || Math.hypot((x - LAKE_C[0]) / 85, (z - LAKE_C[1]) / 65) < 1 || islandD(x, z) < 0.8)) treeSpots.push([x, z]);
  }
  for (let i = 0; i < 500; i++) { // grass tufts: park, rawa edges, island
    const x = rr(-265, 295), z = rr(-218, 218);
    const inPark = Math.hypot((x - LAKE_C[0]) / 88, (z - LAKE_C[1]) / 66) < 1;
    const inRawa = x < -140 && z > 118, inIsl = islandD(x, z) < 0.85;
    if ((inPark || inRawa || inIsl) && vegClear(x, z, inRawa ? 0.1 : 0.55)) grassSpots.push([x, z]);
  }
  for (let i = 0; i < 46; i++) { // mangroves standing in rawa shallows
    const x = rr(-262, -150), z = rr(118, 214);
    const h = groundH(x, z);
    if (h > -0.5 && h < 0.65 && distToPolyline(x, z, CREEK_PTS) > 5) treeSpots.push([x, z]);
  }
}
{
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 4.8, 5); trunkGeo.translate(0, 2.4, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e5136, roughness: 1 });
  const palmMats = palmSpots.map(([x, z]) => mat4At(x, groundH(x, z) - 0.2, z, rr(0, 6.3), rr(0.85, 1.15), rr(0.85, 1.3), rr(0.85, 1.15)));
  const palms = makeInstanced(trunkGeo, trunkMat, palmMats); palms.castShadow = true;
  const frondGeo = new THREE.ConeGeometry(2.9, 1.5, 7); frondGeo.translate(0, 5.3, 0);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3f7038, roughness: 1, flatShading: true });
  const fronds = makeInstanced(frondGeo, frondMat, palmMats); fronds.castShadow = true;
  const treeMats = treeSpots.map(([x, z]) => mat4At(x, groundH(x, z) - 0.2, z, rr(0, 6.3), rr(0.7, 1.1), rr(0.6, 1), rr(0.7, 1.1)));
  const trunks2 = makeInstanced(trunkGeo, trunkMat, treeMats); trunks2.castShadow = true;
  const canGeo = new THREE.IcosahedronGeometry(2.1, 0); canGeo.translate(0, 5.6, 0);
  const canMat = new THREE.MeshStandardMaterial({ color: 0x47703a, roughness: 1, flatShading: true });
  const canColors = treeSpots.map(() => new THREE.Color().setHSL(0.29 + rr(-0.04, 0.04), 0.42, rr(0.3, 0.42)));
  const cans = makeInstanced(canGeo, canMat, treeMats, canColors); cans.castShadow = true;
  const grassGeo = (() => { // two crossed planes
    const p1 = new THREE.PlaneGeometry(1.1, 0.85); p1.translate(0, 0.4, 0);
    const p2 = p1.clone(); p2.rotateY(Math.PI / 2);
    const g = mergeGeoms([p1.toNonIndexed(), p2.toNonIndexed()]); return g;
  })();
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5d8142, roughness: 1, side: THREE.DoubleSide });
  makeInstanced(grassGeo, grassMat, grassSpots.map(([x, z]) => mat4At(x, groundH(x, z), z, rr(0, 3.2), rr(0.8, 1.6), rr(0.8, 1.5), rr(0.8, 1.6))));
  window.__vegCounts = { palms: palmSpots.length, trees: treeSpots.length, grass: grassSpots.length };
}
{ // street lamps along major/local roads: instanced pole + emissive head
  const poleMats = [], headMats = [], headPts = [];
  for (const e of EDGES) {
    if (e.cls === 'ped' || e.bridge) continue;
    let acc = rr(4, 12);
    for (let i = 1; i < e.pts3.length; i++) {
      acc += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
      if (acc < 26) continue; acc = 0;
      const [x, , z] = e.pts3[i], [px, , pz] = e.pts3[i - 1];
      let dx = x - px, dz = z - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const s = (i % 2 === 0) ? 1 : -1, off = e.w / 2 + 0.7;
      const lx = x - dz * off * s, lz = z + dx * off * s, ly = groundH(lx, lz);
      if (ly < 0.4) continue;
      poleMats.push(mat4At(lx, ly, lz, 0, 1, 1, 1));
      headMats.push(mat4At(lx, ly + 5.1, lz, 0, 1, 1, 1));
      headPts.push([lx, ly, lz]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.2, 5); poleGeo.translate(0, 2.6, 0);
  makeInstanced(poleGeo, new THREE.MeshStandardMaterial({ color: 0x3c4048, roughness: 0.6, metalness: 0.6 }), poleMats);
  const headGeo = new THREE.SphereGeometry(0.34, 8, 6);
  makeInstanced(headGeo, new THREE.MeshStandardMaterial({ color: 0xffc98a, emissive: 0xffb45e, emissiveIntensity: 3.2, roughness: 0.4 }), headMats);
  window.__lampCount = poleMats.length;
}
{ // harbour dressing: instanced containers + 2 cranes + lighthouse + moored boat
  const contMats = [], contColors = [];
  const contPalette = [0xb0563a, 0x2e7f8f, 0xc7a23a, 0x707880, 0x9a5a44, 0x3f6fb5].map(h => new THREE.Color(h));
  for (let i = 0; i < 90; i++) {
    const x = rr(88, 196), z = rr(56, 168);
    if (Math.abs(x - CANAL_X) < 11 || groundH(x, z) < 0.5) continue;
    let bad = false;
    for (const e of EDGES) if (distToPolyline(x, z, e.pts) < e.w / 2 + 3.4) { bad = true; break; }
    if (bad) continue;
    for (const o of placedLots) if (Math.hypot(x - o.x, z - o.z) < o.r + 3.6) { bad = true; break; }
    if (bad) continue;
    const lvl = rnd() < 0.4 ? 1 : 0;
    contMats.push(mat4At(x, groundH(x, z) + 1.3 + lvl * 2.6, z, (rnd() < 0.5 ? 0 : Math.PI / 2) + rr(-0.06, 0.06), 1, 1, 1));
    contColors.push(pick(contPalette));
  }
  const contGeo = new THREE.BoxGeometry(6.1, 2.6, 2.45);
  const conts = makeInstanced(contGeo, new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.25 }), contMats, contColors);
  conts.castShadow = true;
  window.__containerCount = contMats.length;
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xd87830, roughness: 0.55, metalness: 0.4 });
  for (const [cx, cz, ry] of [[196, 66, 0.4], [182, 128, -0.5]]) {
    const g = new THREE.Group(), gy = groundH(cx, cz);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 17, 1.2), craneMat); leg.position.set(0, 8.5, 0);
    const leg2 = leg.clone(); leg2.position.x = 9;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(15, 1.1, 1.1), craneMat); beam.position.set(4.5, 17, 0);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), craneMat); jib.position.set(10.5, 12.5, 0);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), craneMat); cab.position.set(9, 15.6, 0);
    g.add(leg, leg2, beam, jib, cab); g.position.set(cx, gy, cz); g.rotation.y = ry;
    g.traverse(m => { m.castShadow = true; }); scene.add(g);
  }
  { // lighthouse at the quay head
    const lx = 192, lz = 40, ly = groundH(lx, lz);
    const grp = new THREE.Group();
    const bandM1 = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.7 });
    const bandM2 = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.3 - i * 0.25, 2.5 - i * 0.25, 3.4, 12), i % 2 ? bandM2 : bandM1);
      seg.position.y = 1.7 + i * 3.4; seg.castShadow = true; grp.add(seg);
    }
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.8, 10),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffca5e, emissiveIntensity: 3.4 }));
    lampRoom.position.y = 14.6; grp.add(lampRoom);
    const beamM = new THREE.MeshBasicMaterial({ color: 0xffca5e, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 26, 12, 1, true), beamM);
    beam.rotation.z = Math.PI / 2; beam.position.set(13, 14.6, 0); grp.add(beam);
    const beam2 = beam.clone(); beam2.rotation.z = -Math.PI / 2; beam2.position.x = -13; grp.add(beam2);
    grp.position.set(lx, ly, lz); scene.add(grp);
    window.__lighthouse = grp;
  }
  { // moored cargo boat at the quay
    const bx = 205, bz = 96, by = WATER_Y;
    const grp = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 2.6, 30), new THREE.MeshStandardMaterial({ color: 0x37424e, roughness: 0.6, metalness: 0.4 }));
    hull.position.y = 0.6; grp.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(6, 4.5, 5), new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.7 }));
    cab.position.set(0, 4, -10); grp.add(cab);
    const stack = new THREE.Mesh(new THREE.BoxGeometry(5.8, 2.5, 12), new THREE.MeshStandardMaterial({ color: 0xb0563a, roughness: 0.75 }));
    stack.position.set(0, 3.1, 5); grp.add(stack);
    grp.position.set(bx, by, bz); grp.rotation.y = 0.12; scene.add(grp);
  }
}
{ // star monument: obelisk + emissive orb (J7)
  const gy = groundH(STAR[0], STAR[1]);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.5, 1.1, 20), concMat);
  base.position.set(STAR[0], gy + 0.55, STAR[1]); base.receiveShadow = true; scene.add(base);
  const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.5, 8.6, 4),
    new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.8 }));
  ob.position.set(STAR[0], gy + 5.4, STAR[1]); ob.rotation.y = Math.PI / 4; ob.castShadow = true; scene.add(ob);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb347, emissiveIntensity: 2.6, roughness: 0.3 }));
  orb.position.set(STAR[0], gy + 10.9, STAR[1]); scene.add(orb);
  window.__orb = orb;
}
{ // warung stalls around the plaza ring (south edge of the disc)
  const stallMat = new THREE.MeshStandardMaterial({ color: 0xc96f4a, roughness: 0.85 });
  const awnMat = new THREE.MeshStandardMaterial({ color: 0x39d0c4, roughness: 0.8 });
  for (const aDeg of [-38, -18, 4, 24]) {
    const a = aDeg * Math.PI / 180, x = STAR[0] + 34 * Math.cos(a), z = STAR[1] + 34 * Math.sin(a);
    const gy = groundH(x, z);
    const boxM = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.3, 2.4), stallMat);
    boxM.position.set(x, gy + 1.15, z); boxM.rotation.y = -a; boxM.castShadow = true; scene.add(boxM);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 3.2), awnMat);
    awn.position.set(x, gy + 2.6, z); awn.rotation.y = -a; scene.add(awn);
  }
}

// ======================================================================
// WORLD STATS — measured variation (published honestly at the gate)
// ======================================================================
function edgeClass(e) { // 'curved' | 'diag' | 'straight' for local/collector roads
  const p = e.pts, [ax, az] = p[0], [bx, bz] = p[p.length - 1];
  let dev = 0; for (const [x, z] of p) dev = Math.max(dev, distToSeg(x, z, ax, az, bx, bz));
  if (dev > 2.5) return 'curved';
  const ang = Math.abs(Math.atan2(bz - az, bx - ax)) % (Math.PI / 2);
  const deg = ang * 180 / Math.PI;
  return (deg > 8 && deg < 82) ? 'diag' : 'straight';
}
const worldStats = (() => {
  const fam = {}; for (const t of buildingTags) fam[t.code] = (fam[t.code] || 0) + 1;
  const total = buildingTags.length;
  const jTypes = [...new Set(JUNCTIONS.map(j => j.code))]; if (TERMINALS.length) jTypes.push('J9');
  let locTot = 0, locCurved = 0;
  for (const e of EDGES) if (['R3', 'R4', 'R7'].includes(e.code)) { locTot += e.length; if (edgeClass(e) !== 'straight') locCurved += e.length; }
  const bridges = {}; for (const e of EDGES) if (e.bridge) bridges[e.bridge] = (bridges[e.bridge] || 0) + 1;
  const pemTerminals = TERMINALS.filter(t => t[0] < 10 && t[2] > 20).length;
  return {
    buildings: total, fam, f1Share: total ? +(fam.F1 || 0) / total : 0,
    junctionTypes: jTypes, junctionTypeCount: jTypes.length,
    curvedDiagShareLocal: locTot ? +(locCurved / locTot).toFixed(3) : 0,
    bridges, bridgeTotal: Object.values(bridges).reduce((a, b) => a + b, 0), bridgeTypes: Object.keys(bridges).length,
    terminals: TERMINALS.length, pemukimanTerminals: pemTerminals,
    edges: EDGES.length, roadKm: +(EDGES.reduce((a, e) => a + e.length, 0) / 1000).toFixed(2),
  };
})();
window.__worldStats = worldStats;

// ======================================================================
// MINIMAP — drawn from the graph: major amber wide / local grey-blue /
// pedestrian green dashed; water teal (REBUILD-BRIEF legend)
// ======================================================================
const mm = document.getElementById('minimap').getContext('2d');
const MM_S = 0.315, MM_CX = 10, MM_CZ = 5;
const mmX = x => 98 + (x - MM_CX) * MM_S, mmY = z => 98 + (z - MM_CZ) * MM_S;
function drawMinimap(px, pz, heading) {
  mm.clearRect(0, 0, 196, 196);
  mm.fillStyle = '#175263'; mm.fillRect(0, 0, 196, 196); // sea teal-dark
  mm.fillStyle = '#262338'; // landmass (coast path)
  mm.beginPath();
  mm.moveTo(mmX(-285), mmY(-235));
  for (let z = -235; z <= 235; z += 14) mm.lineTo(mmX(coastX(z)), mmY(z));
  for (let x = 285; x >= -285; x -= 14) mm.lineTo(mmX(x), mmY(coastZ(x) > 235 ? 235 : coastZ(x)));
  mm.closePath(); mm.fill();
  mm.beginPath(); mm.ellipse(mmX(ISLAND_C[0]), mmY(ISLAND_C[1]), 46 * MM_S + 6, 36 * MM_S + 5, 0, 0, 7); mm.fill();
  mm.fillStyle = '#2fa8a0'; // inland water
  mm.beginPath(); mm.ellipse(mmX(LAKE_C[0]), mmY(LAKE_C[1]), LAKE_RX * MM_S, LAKE_RZ * MM_S, 0, 0, 7); mm.fill();
  mm.strokeStyle = '#2fa8a0'; mm.lineCap = 'round';
  mm.lineWidth = 30 * MM_S; mm.beginPath();
  RIVER_PTS.forEach(([x, z], i) => i ? mm.lineTo(mmX(x), mmY(z)) : mm.moveTo(mmX(x), mmY(z))); mm.stroke();
  mm.lineWidth = 12 * MM_S; mm.beginPath(); mm.moveTo(mmX(CANAL_X), mmY(CANAL_Z0)); mm.lineTo(mmX(CANAL_X), mmY(CANAL_Z1)); mm.stroke();
  const drawCls = (cls, style, width, dash) => {
    mm.strokeStyle = style; mm.lineWidth = width; mm.setLineDash(dash || []);
    for (const e of EDGES) { if (e.cls !== cls) continue;
      mm.beginPath(); e.pts.forEach(([x, z], i) => i ? mm.lineTo(mmX(x), mmY(z)) : mm.moveTo(mmX(x), mmY(z))); mm.stroke(); }
    mm.setLineDash([]);
  };
  drawCls('ped', '#7dc383', 1.4, [3, 3]);
  drawCls('local', '#9fb4c8', 2.4);
  drawCls('major', '#ffb347', 4);
  mm.fillStyle = '#ffd98a'; // star monument dot
  mm.beginPath(); mm.arc(mmX(STAR[0]), mmY(STAR[1]), 2.6, 0, 7); mm.fill();
  // player arrow
  mm.save(); mm.translate(mmX(px), mmY(pz)); mm.rotate(heading);
  mm.fillStyle = '#fff7ea'; mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(0, 2.6); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
  mm.restore();
}

// ======================================================================
// ======================================================================
// R-B SYSTEMS (fresh implementation on the v2 graph; v1 stage-2 branches
// were read as design reference only — lane model, terminal U-turns,
// witness-LOS wanted, strict perf method — nothing merged in).
// Chunk 1 — PLAYER: explicit state machine, camera views, stamina.
// ======================================================================
// floorY / collide lived in the R-A player section this chunk replaces —
// they belong to the world (bridge decks + building AABBs), so they move here.
function bridgeDeckY(x, z) { // deck height if standing on a bridge edge, else null
  let best = null, bestD = 1e9;
  for (const e of EDGES) { if (!e.bridge) continue;
    for (let i = 0; i < e.pts3.length; i++) { const p = e.pts3[i], d = Math.hypot(x - p[0], z - p[2]);
      if (d < bestD) { bestD = d; best = p[1]; } } }
  return bestD < 9 ? best : null;
}
function floorY(x, z) { const b = bridgeDeckY(x, z); const g = groundH(x, z); return b !== null && b > g ? b : g; }
function collide(pos, r) {
  let hit = false;
  for (const b of colliders) {
    const nx = Math.max(b.minX, Math.min(pos.x, b.maxX)), nz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) { hit = true; if (d2 > 0.0001) { const d = Math.sqrt(d2); pos.x = nx + dx / d * r; pos.z = nz + dz / d * r; } else pos.x = b.maxX + r; }
  }
  return hit;
}
const state = {
  mode: SHOT ? 'play' : 'title', // title | foot | car | pause | busted | wasted
  prevMode: 'foot',
  pos: new THREE.Vector3(6, 0, -58), heading: 0.6, time: 0,
  health: 100, cash: 250, speed: 0, footSpeed: 0,
  stamina: 100, sprintLock: false,
  footState: 'idle', // idle | walk | run | crouch | aim | swim | roll | vault
  crouch: false, aiming: false, camView: 0,
  rollT: 0, rollDir: new THREE.Vector3(0, 0, 1),
  vaultT: 0, vaultFrom: new THREE.Vector3(), vaultDir: new THREE.Vector3(0, 0, 1),
  camYaw: 0.6, camPitch: 0.32, shake: 0,
  car: null, // vehicle being driven
  // law / combat state (owned by chunks 4-5, declared here so chunk order is free)
  wantedF: 0, lastCrime: -99, lastSeen: -99, lastShot: -99, lastCrash: -99, lastHurt: -99,
  lastKnown: null, searchR: 0, searching: false, pendingReports: [],
  ammo: {}, reloading: 0, shootCd: 0, busted: 0, endT: 0, endKind: null,
  hiddenSwap: false, policeShootNote: false, hitCarCd: -99,
  weapon: 1, // index into WEAPONS (chunk 5); 0 = fists
};
state.pos.y = groundH(state.pos.x, state.pos.z);
function playerPos() { return state.mode === 'car' && state.car ? state.car.pos : state.pos; }
function starsNow() { return state.wantedF <= 0.01 ? 0 : Math.min(5, Math.ceil(state.wantedF - 1e-9)); }

// ---------- articulated Raka (shared geo/mats; one group, 7 meshes) ----------
const _pGeo = {
  torso: new THREE.BoxGeometry(0.62, 0.78, 0.34),
  head: new THREE.SphereGeometry(0.21, 12, 10),
  cap: new THREE.CylinderGeometry(0.23, 0.24, 0.1, 12),
  limb: new THREE.BoxGeometry(0.18, 0.74, 0.18),
  arm: new THREE.BoxGeometry(0.15, 0.66, 0.15),
};
_pGeo.limb.translate(0, -0.37, 0); _pGeo.arm.translate(0, -0.33, 0);
const _pMat = {
  skin: new THREE.MeshStandardMaterial({ color: 0xc98d5f, roughness: 0.8 }),
  shirt: new THREE.MeshStandardMaterial({ color: 0xff7a3c, roughness: 0.85 }),
  pants: new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.9 }),
  cap: new THREE.MeshStandardMaterial({ color: 0x14202e, roughness: 0.7 }),
};
const player = new THREE.Group();
const playerMesh = { group: player, walkT: 0, legL: null, legR: null, armL: null, armR: null, head: null, torso: null, gun: null };
{
  const torso = new THREE.Mesh(_pGeo.torso, _pMat.shirt); torso.position.y = 1.12; torso.castShadow = true; player.add(torso);
  const head = new THREE.Mesh(_pGeo.head, _pMat.skin); head.position.y = 1.72; head.castShadow = true; player.add(head);
  const cap = new THREE.Mesh(_pGeo.cap, _pMat.cap); cap.position.y = 1.86; player.add(cap);
  const mk = (geo, mat, x, y) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); m.castShadow = true; player.add(m); return m; };
  playerMesh.legL = mk(_pGeo.limb, _pMat.pants, -0.16, 0.76);
  playerMesh.legR = mk(_pGeo.limb, _pMat.pants, 0.16, 0.76);
  playerMesh.armL = mk(_pGeo.arm, _pMat.shirt, -0.4, 1.46);
  playerMesh.armR = mk(_pGeo.arm, _pMat.shirt, 0.4, 1.46);
  playerMesh.torso = torso; playerMesh.head = head;
  // pistol in the right hand (chunk 5 toggles visibility by weapon)
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.46),
    new THREE.MeshStandardMaterial({ color: 0x16161c, roughness: 0.4, metalness: 0.7 }));
  gun.position.set(0, -0.66, -0.18); playerMesh.armR.add(gun); playerMesh.gun = gun;
  player.position.copy(state.pos); scene.add(player);
}

// ---------- input (edge-triggered actions consumed once per frame) ----------
const keys = {};
let actE = false, actV = false, actSpace = false, actShoot = false, actReload = false,
  actHorn = false, actLight = false, actCrouch = false, actWheel = false;
addEventListener('keydown', e => {
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (e.code === 'KeyE') actE = true;
  if (e.code === 'KeyV') actV = true;
  if (e.code === 'Space') { actSpace = true; e.preventDefault(); }
  if (e.code === 'KeyF') actShoot = true;
  if (e.code === 'KeyR') actReload = true;
  if (e.code === 'KeyH') actHorn = true;
  if (e.code === 'KeyL') actLight = true;
  if (e.code === 'KeyC' || e.code === 'ControlLeft') actCrouch = true;
  if (e.code === 'Tab') { actWheel = true; e.preventDefault(); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 5 && typeof selectWeapon === 'function') selectWeapon(n - 1); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; state.aiming = false; });
let camYaw = 0.6, camPitch = 0.32, dragging = false, lastMX = 0, lastMY = 0, downT = 0, downX = 0, downY = 0;
renderer.domElement.addEventListener('pointerdown', e => {
  if (typeof ensureAudio === 'function') ensureAudio();
  if (e.button === 2) { state.aiming = true; return; }
  dragging = true; lastMX = e.clientX; lastMY = e.clientY; downT = performance.now(); downX = e.clientX; downY = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('pointerup', e => {
  if (e.button === 2) { state.aiming = false; return; }
  dragging = false;
  if (performance.now() - downT < 260 && Math.hypot(e.clientX - downX, e.clientY - downY) < 7 && state.mode === 'foot') actShoot = true;
});
addEventListener('pointermove', e => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastMX) * 0.005;
  camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - lastMY) * 0.003, 0.06, 1.1);
  lastMX = e.clientX; lastMY = e.clientY;
});
state.camYaw = camYaw;
const titleEl = document.getElementById('title-screen'), pauseEl = document.getElementById('pause-screen');
function startGame() { if (state.mode === 'title') { state.mode = 'foot'; state.prevMode = 'foot'; titleEl.hidden = true; } }
function togglePause() {
  if (state.mode === 'foot' || state.mode === 'car') { state.prevMode = state.mode; state.mode = 'pause'; pauseEl.hidden = false; }
  else if (state.mode === 'pause') { state.mode = state.prevMode || 'foot'; pauseEl.hidden = true; }
}
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('resume-btn').addEventListener('click', togglePause);
const respawnBtn = document.getElementById('respawn-btn');
if (respawnBtn) respawnBtn.addEventListener('click', () => { if (typeof doRespawn === 'function') doRespawn(); });

// ---------- helpers shared by later chunks ----------
function slopeGrad(x, z, heading) { // gradient along heading, sampled on floorY (bridge decks included)
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  const a = floorY(x - fx * 3, z - fz * 3), b = floorY(x + fx * 3, z + fz * 3);
  return (b - a) / 6;
}
const SLOPE_GRAV = 5.5;
function groundCar(car) { // Y + nose pitch from the slope under a vehicle
  car.pos.y = floorY(car.pos.x, car.pos.z);
  const g = slopeGrad(car.pos.x, car.pos.z, car.heading);
  car.group.position.copy(car.pos);
  car.group.rotation.set(THREE.MathUtils.clamp(-g * 0.55, -0.35, 0.35), car.heading, 0, 'YXZ');
}
function losClear(a, b) { // 2D line of sight vs building collider AABBs
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const c of colliders) {
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) { if (a.x < c.minX || a.x > c.maxX) ok = false; }
    else { let ta = (c.minX - a.x) / dx, tb = (c.maxX - a.x) / dx; if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false; }
    if (ok) {
      if (Math.abs(dz) < 1e-9) { if (a.z < c.minZ || a.z > c.maxZ) ok = false; }
      else { let ta = (c.minZ - a.z) / dz, tb = (c.maxZ - a.z) / dz; if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false; }
    }
    if (ok && t0 <= t1) return false;
  }
  return true;
}
function blockedAhead(pos, dirX, dirZ, dist) { // is there a building collider at pos + dir*dist?
  const probe = { x: pos.x + dirX * dist, z: pos.z + dirZ * dist };
  for (const c of colliders) if (probe.x > c.minX - 0.3 && probe.x < c.maxX + 0.3 && probe.z > c.minZ - 0.3 && probe.z < c.maxZ + 0.3) return true;
  return false;
}

// ---------- player step: explicit state machine ----------
function stepFoot(dt) {
  if (actV) state.camView = (state.camView + 1) % 4;
  if (actCrouch && state.rollT <= 0 && state.vaultT <= 0) state.crouch = !state.crouch;
  const ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0); // W = forward = (sin camYaw, cos camYaw)
  const moving = ix !== 0 || iz !== 0;
  const wantRun = (keys.ShiftLeft || keys.ShiftRight) && !state.crouch && !state.aiming;
  if (state.stamina <= 0) state.sprintLock = true;
  if (state.stamina > 25) state.sprintLock = false;
  const run = wantRun && !state.sprintLock && moving;
  // camera-relative move dir (forward = away from camera)
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  let dx = 0, dz = 0;
  if (moving) { const len = Math.hypot(ix, iz); dx = (iz * sin + ix * cos) / len; dz = (iz * cos - ix * sin) / len; }
  // roll / vault on Space (edge)
  if (actSpace && state.rollT <= 0 && state.vaultT <= 0 && state.mode === 'foot') {
    if (moving && blockedAhead(state.pos, dx, dz, 1.7)) {
      state.vaultT = 0.55; state.vaultFrom.copy(state.pos); state.vaultDir.set(dx, 0, dz);
      state.stamina = Math.max(0, state.stamina - 10);
    } else if (moving && state.stamina >= 15) {
      state.rollT = 0.6; state.rollDir.set(dx, 0, dz);
      state.stamina = Math.max(0, state.stamina - 15);
    }
  }
  const inWater = floorY(state.pos.x, state.pos.z) < -0.2;
  let speed = 0;
  if (state.vaultT > 0) {
    state.vaultT -= dt;
    const t = 1 - Math.max(0, state.vaultT) / 0.55;
    state.pos.x = state.vaultFrom.x + state.vaultDir.x * 2.6 * t;
    state.pos.z = state.vaultFrom.z + state.vaultDir.z * 2.6 * t;
    state.pos.y = floorY(state.pos.x, state.pos.z) + Math.sin(Math.PI * t) * 1.15;
    state.footState = 'vault'; speed = 4.7;
    if (state.vaultT <= 0) state.pos.y = floorY(state.pos.x, state.pos.z);
  } else if (state.rollT > 0) {
    state.rollT -= dt;
    state.pos.x += state.rollDir.x * 8.5 * dt; state.pos.z += state.rollDir.z * 8.5 * dt;
    collide(state.pos, 0.55);
    state.pos.y = floorY(state.pos.x, state.pos.z);
    state.footState = 'roll'; speed = 8.5;
  } else if (inWater) {
    speed = moving ? 2.2 : 0;
    if (moving) { state.pos.x += dx * speed * dt; state.pos.z += dz * speed * dt; }
    state.pos.y = -0.45 + Math.sin(state.time * 2.2) * 0.06; // bob at the waterline
    state.footState = 'swim';
    state.stamina = Math.max(0, state.stamina - 2 * dt);
  } else {
    speed = state.aiming ? 2.8 : state.crouch ? 2.2 : run ? 9.5 : 4.6;
    if (moving) {
      state.pos.x += dx * speed * dt; state.pos.z += dz * speed * dt;
      collide(state.pos, 0.55);
      state.pos.y = floorY(state.pos.x, state.pos.z);
      if (state.aiming) state.heading = Math.atan2(sin, cos); // face away from camera while aiming
      else state.heading = Math.atan2(dx, dz);
    } else state.pos.y = floorY(state.pos.x, state.pos.z);
    state.footState = !moving ? 'idle' : state.aiming ? 'aim' : state.crouch ? 'crouch' : run ? 'run' : 'walk';
    if (run) state.stamina = Math.max(0, state.stamina - 12 * dt);
    else state.stamina = Math.min(100, state.stamina + 18 * dt);
  }
  state.footSpeed = moving ? speed : 0; state.speed = state.footSpeed;
  state.pos.x = THREE.MathUtils.clamp(state.pos.x, -300, 300);
  state.pos.z = THREE.MathUtils.clamp(state.pos.z, -225, 250);
  // run over by a moving car?
  if (typeof damagePlayer === 'function' && state.time - state.lastHurt > 1 && typeof cars !== 'undefined') {
    for (const c of cars) {
      if (Math.abs(c.speed || 0) < 6 || c === state.car) continue;
      if (c.pos.distanceTo(state.pos) < 1.9) {
        damagePlayer(16, c.pos); state.lastCrash = state.time;
        const kx = state.pos.x - c.pos.x, kz = state.pos.z - c.pos.z, kl = Math.hypot(kx, kz) || 1;
        state.pos.x += kx / kl * 3.2; state.pos.z += kz / kl * 3.2; state.shake = 0.4; break;
      }
    }
  }
  // mesh pose
  player.position.copy(state.pos);
  player.rotation.y = state.heading;
  const crouchScale = (state.crouch && state.footState !== 'swim') ? 0.78 : 1;
  player.scale.y += (crouchScale - player.scale.y) * Math.min(1, dt * 10);
  if (state.footState === 'roll') player.rotation.x = (1 - Math.max(0, state.rollT) / 0.6) * Math.PI * 2;
  else if (state.footState === 'vault') player.rotation.x = -0.35;
  else if (state.footState === 'swim') { player.rotation.x = 0.5; playerMesh.legL.rotation.x = Math.sin(state.time * 6) * 0.7; playerMesh.legR.rotation.x = -Math.sin(state.time * 6) * 0.7; }
  else player.rotation.x = 0;
  if (state.footState !== 'swim') {
    playerMesh.walkT += dt * (moving ? (run ? 13 : 9) : 0);
    const sw = Math.sin(playerMesh.walkT) * (moving ? 0.55 : 0);
    playerMesh.legL.rotation.x = sw; playerMesh.legR.rotation.x = -sw;
    if (state.aiming) { playerMesh.armR.rotation.x = -1.35; playerMesh.armL.rotation.x = -0.9; }
    else { playerMesh.armL.rotation.x = -sw * 0.8; playerMesh.armR.rotation.x = sw * 0.8; }
  }
  // ---- camera: V cycles far / near / hood-close / cinematic; over-shoulder when aiming ----
  const aiming = state.aiming;
  let dist, h, lookY;
  if (aiming) { dist = 2.7; h = 1.9; lookY = 1.45; }
  else if (state.camView === 1) { dist = 5.2; h = 2.6; lookY = 1.5; }
  else if (state.camView === 2) { dist = 3.3; h = 1.9; lookY = 1.5; }
  else if (state.camView === 3 && state.footSpeed < 1) { // cinematic: slow orbit, only at rest
    const a = state.time * 0.12 + 0.6;
    camera.position.lerp(new THREE.Vector3(state.pos.x + Math.sin(a) * 10, state.pos.y + 4.2, state.pos.z + Math.cos(a) * 10), 1 - Math.pow(0.001, dt));
    camera.lookAt(state.pos.x, state.pos.y + 1.4, state.pos.z);
    stepFootPrompt(); return;
  }
  else { dist = 8.5; h = 3.4; lookY = 1.5; }
  // camera sits BEHIND the player (forward = (sin camYaw, cos camYaw), R-A convention)
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const rx = Math.cos(camYaw), rz = -Math.sin(camYaw); // screen-right for that forward
  const cx = state.pos.x - fx * dist * Math.cos(camPitch) + (aiming ? rx * 0.9 : 0);
  const cz = state.pos.z - fz * dist * Math.cos(camPitch) + (aiming ? rz * 0.9 : 0);
  const cy = state.pos.y + h + Math.sin(camPitch) * dist * 0.55;
  camera.position.lerp(new THREE.Vector3(cx, Math.max(cy, floorY(cx, cz) + 1.1), cz), 1 - Math.pow(0.0001, dt));
  camera.lookAt(state.pos.x + fx * (aiming ? 6 : 0), state.pos.y + lookY, state.pos.z + fz * (aiming ? 6 : 0));
  if (state.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * state.shake;
    camera.position.y += (Math.random() - 0.5) * state.shake * 0.6;
    state.shake *= Math.pow(0.02, dt); if (state.shake < 0.01) state.shake = 0;
  }
  camera.fov += (62 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  stepFootPrompt();
}
function stepFootPrompt() {
  if (typeof nearestCar === 'function') {
    const near = nearestCar(3.4);
    const pr = document.getElementById('prompt');
    if (pr) {
      if (near) { pr.hidden = false; pr.innerHTML = 'Press <kbd>E</kbd> to enter ' + (near.modelName || 'car'); }
      else pr.hidden = true;
    }
    if (actE && near) enterCar(near);
  }
  if (actShoot && typeof playerShoot === 'function') playerShoot();
  if (actReload && typeof startReload === 'function') startReload();
}

// Chunk 2 — VEHICLES: ONE generic controller (land params now; water/air
// param sets are data, ready for R-C), fictional roster as data, enter/exit.
const VEHICLE_ROSTER = [
  // maker, model, class, top speed (m/s), accel, steer, grip — fictional, no real cars
  { maker: 'Arus', model: 'Senja', cls: 'sedan', top: 30, accel: 16, steer: 0.62, grip: 1.0, price: 12000 },
  { maker: 'Arus', model: 'Melati', cls: 'hatchback', top: 27, accel: 17, steer: 0.68, grip: 1.05, price: 9000 },
  { maker: 'Arus', model: 'Taksi Senja', cls: 'taxi', top: 28, accel: 15, steer: 0.62, grip: 1.0, price: 14000 },
  { maker: 'Kala', model: 'Badak', cls: 'suv', top: 29, accel: 14, steer: 0.55, grip: 0.95, price: 22000 },
  { maker: 'Kala', model: 'Angkut', cls: 'pickup', top: 26, accel: 13, steer: 0.55, grip: 0.9, price: 16000 },
  { maker: 'Kala', model: 'Kontainer', cls: 'truck', top: 22, accel: 10, steer: 0.42, grip: 0.85, price: 30000 },
  { maker: 'Bayu', model: 'Petir', cls: 'sport', top: 38, accel: 20, steer: 0.72, grip: 1.12, price: 45000 },
  { maker: 'Bayu', model: 'Retro 76', cls: 'muscle', top: 33, accel: 18, steer: 0.58, grip: 0.92, price: 28000 },
  { maker: 'POLISI', model: 'Patroli', cls: 'police', top: 34, accel: 19, steer: 0.68, grip: 1.08, price: 0 },
  { maker: 'POLISI', model: 'Interceptor', cls: 'police', top: 39, accel: 22, steer: 0.74, grip: 1.12, price: 0 },
  // R-C param sets (structure only — boats + seaplane land in R-C):
  { maker: 'Ombak Marine', model: 'Lumba', cls: 'boat', mode: 'water', top: 18, accel: 9, steer: 0.5, grip: 0.8, price: 20000 },
  { maker: 'Layang', model: 'Bangau', cls: 'seaplane', mode: 'air', top: 45, accel: 12, steer: 0.6, grip: 1.0, price: 60000 },
];
const CAR_COLORS = [0xd94f3d, 0x3d7fd9, 0xf2b13d, 0x53b06a, 0xe8e4da, 0x8a5fd6, 0x39b8ad, 0xc0c6cc,
  0xff7ab0, 0xb8e356, 0x22242c, 0xf5f5f5, 0xff8c42, 0x7a4a21, 0x2e6e6a, 0xb03060];
const _carGeo = {
  body: new THREE.BoxGeometry(1.9, 0.55, 4.3),
  hood: new THREE.BoxGeometry(1.8, 0.3, 1.1),
  cabin: new THREE.BoxGeometry(1.65, 0.55, 2.0),
  wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12),
  light: new THREE.BoxGeometry(0.42, 0.16, 0.06),
  cone: new THREE.ConeGeometry(1.15, 5.5, 12, 1, true),
  truckBox: new THREE.BoxGeometry(2.15, 2.0, 3.9),
  truckBed: new THREE.BoxGeometry(2.05, 0.55, 3.7),
  shield: new THREE.BoxGeometry(1.7, 0.6, 0.1),
};
const _carMat = {
  glass: new THREE.MeshStandardMaterial({ color: 0x141c28, roughness: 0.15, metalness: 0.7 }),
  wheel: new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 }),
  cone: new THREE.MeshBasicMaterial({ color: 0xffdf9e, transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide }),
  boxWhite: new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.6, metalness: 0.2 }),
};
const _paintCache = new Map();
function paintMat(color) {
  if (!_paintCache.has(color)) _paintCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55, envMapIntensity: 0.9 }));
  return _paintCache.get(color);
}
const DIRT_EDGES = EDGES.filter(e => e.dirt);
function surfaceAt(x, z) { // traction per surface (NEON COAST adoption)
  if (groundH(x, z) < 0.9) return { grip: 0.55, name: 'sand' };
  for (const e of DIRT_EDGES) if (distToPolyline(x, z, e.pts) < e.w / 2 + 1) return { grip: 0.7, name: 'dirt' };
  return { grip: 1.0, name: 'asphalt' };
}
function makeCar(color, rosterIdx = 0, isPolice = false) {
  const roster = VEHICLE_ROSTER[rosterIdx] || VEHICLE_ROSTER[0];
  const g = new THREE.Group();
  const paint = paintMat(color);
  const body = new THREE.Mesh(_carGeo.body, paint); body.position.y = 0.55; body.castShadow = true; g.add(body);
  const hood = new THREE.Mesh(_carGeo.hood, paint); hood.position.set(0, 0.72, -1.75); g.add(hood);
  const cabin = new THREE.Mesh(_carGeo.cabin, _carMat.glass); cabin.position.set(0, 1.05, 0.25); cabin.castShadow = true; g.add(cabin);
  const wheels = [];
  for (const [x, z] of [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.45], [0.95, 1.45]]) {
    const w = new THREE.Mesh(_carGeo.wheel, _carMat.wheel); w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w); wheels.push(w);
  }
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.4 });
  const blMat = new THREE.MeshStandardMaterial({ color: 0x661111, emissive: 0xff2222, emissiveIntensity: 0.4 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(_carGeo.light, hlMat); hl.position.set(s * 0.6, 0.62, -2.16); g.add(hl);
    const bl = new THREE.Mesh(_carGeo.light, blMat); bl.position.set(s * 0.6, 0.66, 2.16); g.add(bl);
  }
  const cone = new THREE.Mesh(_carGeo.cone, _carMat.cone);
  cone.rotation.x = Math.PI / 2 + 0.10; cone.position.set(0, 0.45, -4.6); cone.visible = false; g.add(cone);
  const smoke = new THREE.Group(); smoke.position.set(0, 1.1, -1.7); g.add(smoke);
  scene.add(g);
  const car = { group: g, wheels, brakeMat: blMat, hlMat, cone, smoke, pos: g.position,
    heading: 0, speed: 0, health: 100, smokeT: 0, parked: true, police: isPolice, moto: false, truck: false,
    model: roster, modelName: roster.maker + ' ' + roster.model, params: roster,
    flatTire: false, lightsOn: false, wrecked: false, traffic: null, ai: null };
  return car;
}
function makeTruck(color, boxy = true) {
  const car = makeCar(color, 5);
  car.truck = true; car.modelName = 'Kala ' + (boxy ? 'Kontainer' : 'Angkut');
  // swap the sedan cabin for a truck cab + box/bed (reuse the group)
  const g = car.group;
  while (g.children.length) g.remove(g.children[0]);
  const paint = paintMat(color);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.25, 1.7), paint);
  cab.position.set(0, 1.05, -2.2); cab.castShadow = true; g.add(cab);
  const shield = new THREE.Mesh(_carGeo.shield, _carMat.glass); shield.position.set(0, 1.3, -3.06); g.add(shield);
  if (boxy) { const box = new THREE.Mesh(_carGeo.truckBox, _carMat.boxWhite); box.position.set(0, 1.55, 0.85); box.castShadow = true; g.add(box); }
  else { const bed = new THREE.Mesh(_carGeo.truckBed, paint); bed.position.set(0, 0.85, 0.85); bed.castShadow = true; g.add(bed); }
  const wheels = [];
  for (const [x, z] of [[-0.98, -2.2], [0.98, -2.2], [-0.98, 1.9], [0.98, 1.9]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 12), _carMat.wheel);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.44, z); g.add(w); wheels.push(w);
  }
  car.wheels = wheels;
  const hlMat = car.hlMat, blMat = car.brakeMat;
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(_carGeo.light, hlMat); hl.position.set(s * 0.65, 0.72, -3.08); g.add(hl);
    const bl = new THREE.Mesh(_carGeo.light, blMat); bl.position.set(s * 0.65, 0.76, 2.86); g.add(bl);
  }
  const smoke = new THREE.Group(); smoke.position.set(0, 1.6, -2.2); g.add(smoke); car.smoke = smoke;
  return car;
}
function makeMoto(color) { // traffic-only motorbike with rider (not enterable)
  const g = new THREE.Group();
  const paint = paintMat(color);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.9), paint); body.position.y = 0.6; body.castShadow = true; g.add(body);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.8), _carMat.wheel); seat.position.set(0, 0.88, 0.35); g.add(seat);
  const wheels = [];
  for (const z of [-0.85, 0.85]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.16, 12), _carMat.wheel);
    w.rotation.z = Math.PI / 2; w.position.set(0, 0.33, z); g.add(w); wheels.push(w);
  }
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.4 });
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), hlMat); hl.position.set(0, 0.62, -0.98); g.add(hl);
  const blMat = new THREE.MeshStandardMaterial({ color: 0x661111, emissive: 0xff2222, emissiveIntensity: 0.4 });
  const bl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), blMat); bl.position.set(0, 0.66, 0.98); g.add(bl);
  // rider (simple articulated ped torso, reuses chunk-4 mesh factory when present)
  scene.add(g);
  return { group: g, wheels, brakeMat: blMat, hlMat, cone: null, smoke: new THREE.Group(), pos: g.position,
    heading: 0, speed: 0, health: 100, smokeT: 0, parked: false, police: false, moto: true, truck: false,
    model: VEHICLE_ROSTER[0], modelName: 'Skuter', params: { top: 26, accel: 15, steer: 0.8, grip: 0.9 },
    flatTire: false, lightsOn: false, wrecked: false, traffic: null, ai: null, noEnter: true };
}
// ---- ONE generic vehicle controller (land mode live; water/air are data) ----
function driveVehicle(v, input, dt) {
  const p = v.params, surf = surfaceAt(v.pos.x, v.pos.z);
  let grip = p.grip * surf.grip;
  let top = p.top, accel = p.accel;
  if (v.flatTire) { grip *= 0.55; top *= 0.65; }
  if (input.fwd > 0) v.speed += accel * grip * dt;
  else if (input.fwd < 0) v.speed -= (v.speed > 0.5 ? 26 : 10) * grip * dt;
  else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 4.5 * dt);
  if (input.brake) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 30 * dt);
  v.speed = THREE.MathUtils.clamp(v.speed, -9, top);
  v.speed -= slopeGrad(v.pos.x, v.pos.z, v.heading) * SLOPE_GRAV * dt;
  const steerAmt = input.steer * p.steer * grip * Math.min(1, Math.abs(v.speed) / 6) * (v.speed < 0 ? -1 : 1);
  v.heading += steerAmt * dt * (1.6 - Math.min(1.1, Math.abs(v.speed) / top));
  if (v.flatTire && Math.abs(v.speed) > 3) v.heading += 0.03 * dt * Math.sign(v.speed); // pull to the flat side
  v.pos.x += -Math.sin(v.heading) * v.speed * dt;
  v.pos.z += -Math.cos(v.heading) * v.speed * dt;
  return surf;
}
function damageCar(car, amount) {
  if (!car || car.wrecked) return;
  car.health -= amount;
  if (car.health < 30) car.flatTire = true;
  if (car.health <= 0) {
    car.health = 0; car.wrecked = true; car.speed = 0;
    if (car.traffic) { car.traffic = null; }
    if (car.police && typeof dropPickup === 'function' && Math.random() < 0.35) dropPickup(car.pos.x, car.pos.z, 'ammo');
  }
}
// ---------- parked cars + hero car ----------
const cars = [];
function edgePointAt(e, frac) { // point + tangent on an EDGES entry (pts3 carries height)
  const pts = e.pts3, n = pts.length - 1, f = THREE.MathUtils.clamp(frac, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const a = pts[i], b = pts[i + 1];
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t,
    dx: (b[0] - a[0]) || 0.001, dz: (b[2] - a[2]) || 0.001 };
}
function parkCar(edgeId, frac, side, rosterIdx, color) {
  const e = EDGES.find(q => q.id === edgeId); if (!e) return null;
  const q = edgePointAt(e, frac), L = Math.hypot(q.dx, q.dz);
  const nx = -q.dz / L * side, nz = q.dx / L * side; // perpendicular (left/right of travel)
  const car = makeCar(color, rosterIdx);
  car.pos.set(q.x + nx * (e.w / 2 - 2.4), q.y, q.z + nz * (e.w / 2 - 2.4));
  car.heading = Math.atan2(-q.dx / L, -q.dz / L);
  car.group.position.copy(car.pos); car.group.rotation.y = car.heading;
  car.parked = true; cars.push(car); return car;
}
{
  let ci = 0;
  const spots = [
    ['spN', 0.45, 1, 0], ['spE', 0.5, -1, 1], ['arc58', 0.3, 1, 2], ['arc92', 0.6, -1, 3],
    ['hb84w', 0.5, 1, 4], ['quay', 0.4, 1, 5], ['pmMain', 0.35, -1, 6], ['rs1', 0.5, 1, 7],
    ['klA', 0.5, 1, 0], ['hbV104', 0.6, -1, 2],
  ];
  for (const [eid, frac, side, ri] of spots) { parkCar(eid, frac, side, ri, CAR_COLORS[(ci * 5 + 2) % CAR_COLORS.length]); ci++; }
  const hero = makeCar(0x39d0c4, 6); // Bayu Petir, teal — hero car by the spawn
  hero.pos.set(14, floorY(14, -48), -48); hero.heading = 0.5; hero.group.position.copy(hero.pos); hero.group.rotation.y = 0.5;
  hero.parked = true; cars.push(hero); window.__heroCar = hero;
  const truck1 = makeTruck(0x3f7fb3, true); truck1.pos.set(120, floorY(120, 96), 96); truck1.heading = 0; truck1.group.position.copy(truck1.pos); truck1.parked = true; cars.push(truck1);
  const truck2 = makeTruck(0xb3543f, false); truck2.pos.set(96, floorY(96, 120), 120); truck2.heading = Math.PI / 2; truck2.group.position.copy(truck2.pos); truck2.parked = true; cars.push(truck2);
}
function nearestCar(maxD = 3.4) {
  let best = null, bd = maxD * maxD;
  for (const c of cars) {
    if (c.traffic || c.noEnter || c.police) continue;
    const dx = c.pos.x - state.pos.x, dz = c.pos.z - state.pos.z, d2 = dx * dx + dz * dz;
    if (d2 < bd) { bd = d2; best = c; }
  }
  return best;
}
function enterCar(car) {
  if (!car || state.mode !== 'foot') return;
  if (typeof reportCrime === 'function' && state.wantedF <= 0) {
    // stealing in front of a witness is a crime; unseen, it is free
    const before = starsNow();
    reportCrime(1, {});
    if (starsNow() === before && state.wantedF > 0) { /* witnessed */ }
  }
  // unseen car swap cools the heat a little (v1 car-swap rule)
  if (state.wantedF > 0 && state.time - state.lastSeen > 3) {
    state.wantedF = Math.max(0, state.wantedF - 0.5); state.hiddenSwap = true;
  }
  car.parked = false; state.car = car; state.mode = 'car'; state.prevMode = 'car';
  player.visible = false;
  state.pos.copy(car.pos);
  if (typeof showDialog === 'function' && state.wantedF > 0) showDialog('New wheels, same heat — lose them or lay low, Raka.');
}
function exitCar() {
  const car = state.car; if (!car) return;
  car.speed = 0; car.parked = true;
  const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
  state.pos.set(car.pos.x + fz * 2.2, 0, car.pos.z - fx * 2.2); // step out the right side
  state.pos.y = floorY(state.pos.x, state.pos.z);
  state.heading = car.heading + Math.PI / 2;
  player.visible = true; player.position.copy(state.pos);
  state.car = null; state.mode = 'foot'; state.prevMode = 'foot';
}
// ---------- player driving ----------
function stepCar(dt) {
  const car = state.car; if (!car) return;
  if (actV) state.camView = (state.camView + 1) % 4;
  if (actLight) { car.lightsOn = !car.lightsOn; car.hlMat.emissiveIntensity = car.lightsOn ? 3.2 : 0.4; if (car.cone) car.cone.visible = car.lightsOn; }
  if (actHorn && typeof honk === 'function') honk(car);
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  const surf = driveVehicle(car, { fwd, steer, brake: !!keys.Space }, dt);
  car._surfName = surf.name;
  state.speed = Math.abs(car.speed);
  // building collision
  const beforeX = car.pos.x, beforeZ = car.pos.z;
  const hitP = new THREE.Vector3().copy(car.pos);
  if (collide(hitP, 1.7)) {
    const moved = Math.hypot(hitP.x - beforeX, hitP.z - beforeZ);
    if (moved > 0.01 && Math.abs(car.speed) > 5) {
      damageCar(car, Math.abs(car.speed) * 0.9); state.lastCrash = state.time;
      if (Math.abs(car.speed) > 17 && typeof damagePlayer === 'function') damagePlayer(4, hitP);
      state.shake = Math.min(0.5, state.shake + 0.2);
    }
    car.pos.copy(hitP); car.speed *= -0.25;
  }
  // car-car collision
  for (const o of cars) {
    if (o === car || o.wrecked) continue;
    const d = car.pos.distanceTo(o.pos);
    if (d < 3.4) {
      if (Math.abs(car.speed) > 4) {
        damageCar(car, 5); damageCar(o, 4); state.lastCrash = state.time;
        state.shake = Math.min(0.5, state.shake + 0.15);
        if (state.time - state.hitCarCd > 1.2) {
          state.hitCarCd = state.time;
          if (typeof reportCrime === 'function') reportCrime(o.police ? 1 : 0.34, {});
          if (o.police) state.lastSeen = state.time;
        }
        if (Math.abs(car.speed) > 13 && typeof damagePlayer === 'function') damagePlayer(3, o.pos);
      }
      const push = new THREE.Vector3().copy(car.pos).sub(o.pos);
      if (push.lengthSq() > 0.001) { push.normalize().multiplyScalar(3.4 - d); car.pos.add(push); }
      car.speed *= 0.55;
    }
  }
  // peds hit by the player's car (chunk 4 owns knockPed; guarded)
  if (typeof peds !== 'undefined' && typeof knockPed === 'function') {
    for (const ped of peds) {
      if (ped.down || Math.abs(car.speed) < 4) continue;
      if (Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 2.4) knockPed(ped, true);
    }
  }
  car.pos.x = THREE.MathUtils.clamp(car.pos.x, -300, 300);
  car.pos.z = THREE.MathUtils.clamp(car.pos.z, -225, 250);
  groundCar(car);
  car.brakeMat.emissiveIntensity = (fwd < 0 || keys.Space) ? 3 : 0.4;
  for (const w of car.wheels) w.rotation.x += car.speed * dt / 0.36;
  if (car.wheels[0]) car.wheels[0].rotation.y = car.wheels[1].rotation.y = steer * 0.4;
  if (car.health < 55 && typeof puff === 'function') {
    car.smokeT -= dt;
    if (car.smokeT <= 0) { car.smokeT = car.health < 25 ? 0.05 : 0.14;
      puff(new THREE.Vector3(car.pos.x, car.pos.y + 1.1, car.pos.z), car.health < 25 ? 1.6 : 1); }
  }
  // ---- chase camera: V far / near / hood / cinematic ----
  const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
  if (state.camView === 2) { // hood cam
    camera.position.lerp(new THREE.Vector3(car.pos.x + fx * 1.4, car.pos.y + 1.35, car.pos.z + fz * 1.4), 1 - Math.pow(0.00001, dt));
    camera.lookAt(car.pos.x + fx * 14, car.pos.y + 1.1, car.pos.z + fz * 14);
  } else if (state.camView === 3 && Math.abs(car.speed) < 1) { // cinematic orbit at a stop
    const a = state.time * 0.1;
    camera.position.lerp(new THREE.Vector3(car.pos.x + Math.sin(a) * 11, car.pos.y + 4.5, car.pos.z + Math.cos(a) * 11), 1 - Math.pow(0.001, dt));
    camera.lookAt(car.pos.x, car.pos.y + 1.2, car.pos.z);
  } else {
    const dist = state.camView === 1 ? 6.5 : 9.5, cy = car.pos.y + 4.2;
    const tx = car.pos.x - fx * dist, tz = car.pos.z - fz * dist;
    const k = 1 - Math.pow(0.001, dt);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.z += (tz - camera.position.z) * k;
    camera.position.y += (cy - camera.position.y) * k;
    if (state.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * state.shake;
      camera.position.y += (Math.random() - 0.5) * state.shake * 0.6;
      state.shake *= Math.pow(0.02, dt); if (state.shake < 0.01) state.shake = 0;
    }
    camera.lookAt(car.pos.x + fx * 6, car.pos.y + 1.2, car.pos.z + fz * 6);
  }
  camera.fov += ((62 + Math.min(14, Math.abs(car.speed) * 0.45)) - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
  if (actE && Math.abs(car.speed) < 1.2) exitCar();
}

// Chunk 3 — TRAFFIC: graph lanes (incl. bridge edges + hill climbs),
// terminal U-turns (never freeze), lane hops at junctions, slope gravity.
const LANES = [];
function buildLanes() {
  if (!window.__roadGraph) return;
  for (const line of window.__roadGraph.lines) {
    if (line.cls === 'ped') continue; // drivable lines only; B6 ped bridge excluded
    const pts = line.points.map(q => ({ x: q[0], y: q[1], z: q[2] }));
    if (pts.length < 2) continue;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const f = pts[0], l = pts[pts.length - 1];
    const terms = window.__roadGraph.terminals || [];
    const isTerm = q => terms.some(t => Math.hypot(t[0] - q.x, t[2] - q.z) < 3);
    LANES.push({ id: line.id, code: line.code, cls: line.cls, bridge: line.bridge, pts, cum,
      len: cum[cum.length - 1], loop: Math.hypot(f.x - l.x, f.z - l.z) < 2,
      termStart: isTerm(f), termEnd: isTerm(l) });
  }
}
function laneById(id) { return LANES.find(L => L.id === id) || LANES[0]; }
function lanePoint(L, s) {
  s = THREE.MathUtils.clamp(s, 0, L.len);
  let i = 1; while (i < L.cum.length - 1 && L.cum[i] < s) i++;
  const s0 = L.cum[i - 1], s1 = L.cum[i], t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
  const a = L.pts[i - 1], b = L.pts[i], seg = (s1 - s0) || 1;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
    dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
}
function nearestOnLanes(pos) { // closest point on any drivable lane (spawn / police routing)
  let best = null, bd = Infinity;
  for (const L of LANES) { const P = L.pts;
    for (let i = 1; i < P.length; i++) {
      const ax = P[i - 1].x, az = P[i - 1].z, abx = P[i].x - ax, abz = P[i].z - az;
      const l2 = abx * abx + abz * abz || 1;
      let t = ((pos.x - ax) * abx + (pos.z - az) * abz) / l2; t = Math.max(0, Math.min(1, t));
      const qx = ax + abx * t, qz = az + abz * t, d = (pos.x - qx) ** 2 + (pos.z - qz) ** 2;
      if (d < bd) { bd = d; best = { x: qx, z: qz, lane: L }; }
    } }
  return best;
}
function laneHop(L, atEnd) { // a lane sharing this endpoint (junction continuation), if any
  const p = atEnd ? L.pts[L.pts.length - 1] : L.pts[0];
  const cands = [];
  for (const o of LANES) {
    if (o === L) continue;
    const os = o.pts[0], oe = o.pts[o.pts.length - 1];
    if (Math.hypot(os.x - p.x, os.z - p.z) < 4) cands.push({ lane: o, dir: 1, s: 0 });
    else if (Math.hypot(oe.x - p.x, oe.z - p.z) < 4) cands.push({ lane: o, dir: -1, s: o.len });
  }
  if (!cands.length) return null;
  return cands[Math.floor(Math.random() * cands.length)];
}
buildLanes();
// ---------- traffic fleet ----------
const traffic = [];
function assignLane(car, laneId, dir, target, sFrac) {
  const L = laneById(laneId);
  car.traffic = { lane: L, s: L.len * sFrac, dir, speed: 0, target, turn: null };
  const q = lanePoint(L, car.traffic.s);
  const D = { x: q.dx * dir, z: q.dz * dir };
  car.pos.set(q.x + D.z * 2.6, q.y, q.z - D.x * 2.6); // left-hand traffic: left of travel (v2 lanes are ~10-15 m wide; 2.6 m keeps cars on their half)
  car.heading = Math.atan2(-D.x, -D.z);
  car.group.position.copy(car.pos); car.group.rotation.y = car.heading;
  car.parked = false;
}
{
  const carLanes = ['spNE', 'brB2', 'quay', 'dt-ring', 'klClimb', 'spN', 'hb84w', 'rs1', 'islRing'];
  for (let i = 0; i < 9; i++) {
    const car = makeCar(CAR_COLORS[(i + 3) % CAR_COLORS.length], i % 8);
    assignLane(car, carLanes[i % carLanes.length], i % 4 < 2 ? 1 : -1, 9 + (i % 3) * 2.5, (i * 0.37) % 1);
    traffic.push(car); cars.push(car);
  }
  const tt = makeTruck(0xe08a2e, true);
  const majorLane = LANES.filter(L => L.cls === 'major' && !L.bridge).sort((a, b) => b.len - a.len)[0] || LANES[0];
  assignLane(tt, majorLane.id, -1, 7.5, 0.55);
  traffic.push(tt); cars.push(tt);
  for (let mi = 0; mi < 2; mi++) { // two motorbikes weaving through traffic (not enterable)
    const mv = makeMoto(mi === 0 ? 0xd94f3d : 0x22242c);
    assignLane(mv, mi === 0 ? 'brB2' : 'spN', mi === 0 ? 1 : -1, 12.5, 0.3 + mi * 0.4);
    traffic.push(mv); cars.push(mv);
  }
}
function stepTraffic(dt) {
  for (const car of traffic) {
    const t = car.traffic; if (!t || car.wrecked) continue;
    const L = t.lane;
    // slow for a vehicle ahead (heading-generic projection, no grid axes)
    let target = t.target;
    const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
    for (const o of cars) {
      if (o === car || o.wrecked) continue;
      const rx = o.pos.x - car.pos.x, rz = o.pos.z - car.pos.z;
      const along = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx);
      if (along > 0 && along < 9 && lat < 3) { target = 0; break; }
    }
    t.speed += THREE.MathUtils.clamp(target - t.speed, -18 * dt, 6 * dt);
    t.speed -= slopeGrad(car.pos.x, car.pos.z, car.heading) * SLOPE_GRAV * 0.6 * dt;
    car.speed = t.speed;
    if (t.turn) { // U-turn in progress: swing a semicircle around the line end
      const tn = t.turn; tn.p += dt / tn.dur;
      const pe = tn.p >= 1 ? 1 : tn.p * tn.p * (3 - 2 * tn.p);
      const a = tn.a0 + tn.sweep * Math.PI * pe;
      car.pos.x = tn.cx + Math.cos(a) * 2.6; car.pos.z = tn.cz + Math.sin(a) * 2.6;
      car.heading = Math.atan2(Math.sin(a) * tn.sweep, -Math.cos(a) * tn.sweep);
      car.speed = 4.2;
      if (tn.p >= 1) { t.dir = -tn.fromDir; t.turn = null; t.speed = Math.min(t.speed, 3); }
      groundCar(car);
      car.brakeMat.emissiveIntensity = 0.4;
      for (const w of car.wheels) w.rotation.x += 4.2 * dt / 0.36;
      continue;
    }
    t.s += t.speed * dt * t.dir;
    if ((t.s > L.len || t.s < 0) && !L.loop) {
      const atEnd = t.s > L.len;
      const hop = laneHop(L, atEnd);
      if (hop) { // junction continuation: keep rolling onto the next lane
        t.lane = hop.lane; t.dir = hop.dir; t.s = hop.s;
        continue;
      }
      // open line end (terminal cul-de-sac / T junction): arc U-turn, never freeze
      const endPt = atEnd ? L.pts[L.pts.length - 1] : L.pts[0];
      const q0 = lanePoint(L, atEnd ? L.len : 0);
      const D = { x: q0.dx * t.dir, z: q0.dz * t.dir };
      const a0 = Math.atan2(-D.x, D.z);
      const midA = a0 + Math.PI / 2;
      const sweep = (Math.cos(midA) * D.x + Math.sin(midA) * D.z) >= 0 ? 1 : -1;
      t.turn = { cx: endPt.x, cz: endPt.z, a0, sweep, p: 0, dur: Math.PI * 2.6 / 4.2, fromDir: t.dir };
      t.s = atEnd ? L.len : 0;
      car.pos.x = endPt.x + D.z * 2.6; car.pos.z = endPt.z - D.x * 2.6;
      continue;
    }
    if (t.s > L.len) t.s -= L.len;
    if (t.s < 0) t.s += L.len;
    const q = lanePoint(L, t.s);
    const D = { x: q.dx * t.dir, z: q.dz * t.dir };
    car.pos.x = q.x + D.z * 2.6; car.pos.z = q.z - D.x * 2.6;
    car.heading = Math.atan2(-D.x, -D.z);
    car.pos.y = q.y;
    groundCar(car);
    car.brakeMat.emissiveIntensity = target === 0 ? 3 : 0.4;
    for (const w of car.wheels) w.rotation.x += t.speed * dt / 0.36;
    // moto lean in corners
    if (car.moto) car.group.rotation.z = THREE.MathUtils.clamp(-(t.target - t.speed) * 0.02, -0.25, 0.25);
  }
}

// Chunk 4 — PEDESTRIANS + WITNESS WANTED + POLICE (+ heli, roadblock, PIT).
// ---------- pedestrians (sidewalk/path walkers on the graph) ----------
const PED_PATHS = [];
{
  for (const line of window.__roadGraph.lines) {
    const pts = line.points.map(q => ({ x: q[0], z: q[2] }));
    if (pts.length < 2) continue;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    PED_PATHS.push({ id: line.id, cls: line.cls, w: 10, pts, cum, len: cum[cum.length - 1],
      loop: Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 2 });
  }
  // path widths from the graph edges for sidewalk offsets
  for (const p of PED_PATHS) { const e = EDGES.find(q => q.id === p.id); if (e) p.w = e.w; }
}
function pathPoint(P, s) {
  s = THREE.MathUtils.clamp(s, 0, P.len);
  let i = 1; while (i < P.cum.length - 1 && P.cum[i] < s) i++;
  const s0 = P.cum[i - 1], s1 = P.cum[i], t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
  const a = P.pts[i - 1], b = P.pts[i], seg = (s1 - s0) || 1;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
}
const _pedGeo = {
  torso: new THREE.BoxGeometry(0.56, 0.72, 0.3),
  head: new THREE.SphereGeometry(0.19, 10, 8),
  hat: new THREE.CylinderGeometry(0.21, 0.22, 0.09, 10),
  limb: new THREE.BoxGeometry(0.18, 0.74, 0.18),
  arm: new THREE.BoxGeometry(0.14, 0.62, 0.14),
};
_pedGeo.limb.translate(0, -0.37, 0); _pedGeo.arm.translate(0, -0.31, 0);
const _pedClothCache = new Map();
function pedClothMat(color, rough = 0.9) {
  const k = color + '|' + rough;
  if (!_pedClothCache.has(k)) _pedClothCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  return _pedClothCache.get(color + '|' + rough);
}
const PED_SHIRTS = [0xe8e4da, 0x3d7fd9, 0xf2b13d, 0xd94f6b, 0x53b06a, 0x8a5fd6, 0x39b8ad, 0xff7a3c, 0x707a88, 0xb3543f, 0xf5f5f5, 0x22242c, 0xff7ab0, 0xb8e356, 0x2e6e6a];
const PED_PANTS = [0x2b3550, 0x4a3626, 0x22242c, 0x5c6650, 0x703838];
const PED_SKIN = [0xc98d5f, 0x8a5a34, 0xe0aa72, 0x6e4426];
const peds = [];
function makePedMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(_pedGeo.torso, pedClothMat(shirt)); torso.position.y = 1.08; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(_pedGeo.head, pedClothMat(skin, 0.8)); head.position.y = 1.64; head.castShadow = true; g.add(head);
  if (rnd() > 0.55) { const hat = new THREE.Mesh(_pedGeo.hat, pedClothMat(pick([0xd94f3d, 0xf2b13d, 0x22242c, 0xf5f5f5, 0x3d7fd9]))); hat.position.y = 1.79; g.add(hat); }
  const mk = (geo, mat, x, y) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); g.add(m); return m; };
  const legL = mk(_pedGeo.limb, pedClothMat(pants, 0.95), -0.14, 0.74);
  const legR = mk(_pedGeo.limb, pedClothMat(pants, 0.95), 0.14, 0.74);
  const armL = mk(_pedGeo.arm, pedClothMat(shirt), -0.36, 1.4);
  const armR = mk(_pedGeo.arm, pedClothMat(shirt), 0.36, 1.4);
  scene.add(g);
  return { group: g, legL, legR, armL, armR, head };
}
function spawnPed(pathId) {
  const P = PED_PATHS.find(q => q.id === pathId) || PED_PATHS[Math.floor(rnd() * PED_PATHS.length)];
  const mesh = makePedMesh(pick(PED_SHIRTS), pick(PED_PANTS), pick(PED_SKIN));
  const s = rnd() * P.len, q = pathPoint(P, s);
  const side = rnd() < 0.5 ? 1 : -1, off = P.w / 2 + 1.3;
  const pos = new THREE.Vector3(q.x + q.dz * off * side, 0, q.z - q.dx * off * side);
  pos.y = floorY(pos.x, pos.z) + 0.22;
  mesh.group.position.copy(pos);
  const ped = { ...mesh, pos: mesh.group.position, path: P, s, dir: rnd() < 0.5 ? 1 : -1, side, off,
    heading: Math.atan2(q.dx, q.dz), speed: 1.05 + rnd() * 1.35, walkT: rnd() * 6,
    phase: rnd() * 7, lean: rnd() < 0.3 ? 0.05 + rnd() * 0.05 : 0,
    down: false, downT: 0, fleeUntil: -9, fleeFrom: new THREE.Vector3(), chat: false, partner: null };
  mesh.group.scale.y = 0.92 + rnd() * 0.16;
  peds.push(ped); return ped;
}
for (let n = 0; n < 26; n++) spawnPed();
{ // three chatting pairs, standing still (plaza, promenade, lake)
  const pairSpots = [[52, -52, 53.4, -50.8], [0, 30, 1.4, 31.2], [-2, -168, -0.6, -166.8]];
  pairSpots.forEach(([x1, z1, x2, z2], k) => {
    const a = peds[k * 2], b = peds[k * 2 + 1]; if (!a || !b) return;
    a.pos.set(x1, floorY(x1, z1) + 0.22, z1); b.pos.set(x2, floorY(x2, z2) + 0.22, z2);
    a.group.position.copy(a.pos); b.group.position.copy(b.pos);
    a.chat = b.chat = true; a.partner = b; b.partner = a;
    a.heading = Math.atan2(x2 - x1, z2 - z1); b.heading = Math.atan2(x1 - x2, z1 - z2);
    a.group.rotation.y = a.heading; b.group.rotation.y = b.heading;
  });
}
function dangerFor(ped) {
  const pp = playerPos();
  if (state.mode === 'car' && state.car && Math.abs(state.car.speed) > 7 && ped.pos.distanceTo(pp) < 13) return pp;
  if (state.time - state.lastShot < 2.2 && ped.pos.distanceTo(pp) < 27) return pp;
  if (state.time - state.lastCrash < 1.6 && ped.pos.distanceTo(pp) < 15) return pp;
  if (ped.fleeUntil > state.time) return ped.fleeFrom;
  return null;
}
function knockPed(ped, byPlayer) {
  if (ped.down) return;
  ped.down = true; ped.downT = 7;
  ped.group.rotation.x = -Math.PI / 2; ped.pos.y = floorY(ped.pos.x, ped.pos.z) + 0.35;
  if (byPlayer && typeof reportCrime === 'function') reportCrime(1, { loud: true });
  for (const o of peds) if (o !== ped && !o.down && o.pos.distanceTo(ped.pos) < 14) { o.fleeUntil = state.time + 2.4; o.fleeFrom.copy(ped.pos); }
}
function pedPathHop(ped) { // continue onto a connected path at the current end, else reverse
  const P = ped.path, atEnd = ped.dir > 0;
  const p = atEnd ? P.pts[P.pts.length - 1] : P.pts[0];
  const cands = [];
  for (const o of PED_PATHS) {
    if (o === P) continue;
    if (Math.hypot(o.pts[0].x - p.x, o.pts[0].z - p.z) < 4) cands.push({ path: o, dir: 1, s: 0 });
    else if (Math.hypot(o.pts[o.pts.length - 1].x - p.x, o.pts[o.pts.length - 1].z - p.z) < 4) cands.push({ path: o, dir: -1, s: o.len });
  }
  if (cands.length) { const h = cands[Math.floor(Math.random() * cands.length)]; ped.path = h.path; ped.dir = h.dir; ped.s = h.s; }
  else ped.dir = -ped.dir;
}
function stepPeds(dt) {
  for (const ped of peds) {
    const distP = ped.pos.distanceTo(state.pos);
    ped.group.visible = distP < 130; // distance culling (stage2-budget rule)
    if (distP >= 130) continue;
    if (ped.down) {
      ped.downT -= dt;
      if (ped.downT <= 0) { ped.down = false; ped.group.rotation.x = 0; ped.pos.y = floorY(ped.pos.x, ped.pos.z) + 0.22;
        ped.fleeUntil = state.time + 2; ped.fleeFrom.copy(playerPos()); }
      continue;
    }
    // hit by a moving car?
    let hit = false;
    for (const c of cars) {
      if (Math.abs(c.speed || 0) < 4) continue;
      if (Math.hypot(ped.pos.x - c.pos.x, ped.pos.z - c.pos.z) < 2.6) { knockPed(ped, c === state.car); hit = true; break; }
    }
    if (hit) continue;
    const danger = dangerFor(ped);
    let tx, tz, spd;
    if (danger) {
      ped.chat = false;
      if (ped.fleeUntil <= state.time) { ped.fleeUntil = state.time + 1.6; ped.fleeFrom.copy(danger); }
      const dx = ped.pos.x - ped.fleeFrom.x, dz = ped.pos.z - ped.fleeFrom.z, d = Math.hypot(dx, dz) || 1;
      tx = ped.pos.x + dx / d * 12; tz = ped.pos.z + dz / d * 12; spd = 5.4;
      ped.armL.rotation.z = 2.5; ped.armR.rotation.z = -2.5;
    } else if (ped.chat) { tx = ped.pos.x; tz = ped.pos.z; spd = 0; ped.armL.rotation.z = 0; ped.armR.rotation.z = 0; }
    else {
      ped.s += ped.speed * dt * ped.dir;
      if ((ped.s > ped.path.len || ped.s < 0) && !ped.path.loop) pedPathHop(ped);
      if (ped.s > ped.path.len) ped.s -= ped.path.len;
      if (ped.s < 0) ped.s += ped.path.len;
      const q = pathPoint(ped.path, ped.s);
      tx = q.x + q.dz * ped.off * ped.side; tz = q.z - q.dx * ped.off * ped.side; spd = ped.speed;
      ped.armL.rotation.z = 0; ped.armR.rotation.z = 0;
    }
    const dx = tx - ped.pos.x, dz = tz - ped.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.05 && spd > 0) {
      const vx = dx / d * spd, vz = dz / d * spd;
      ped.pos.x += vx * dt; ped.pos.z += vz * dt;
      const want = Math.atan2(vx, vz);
      let diff = want - ped.heading; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
      ped.heading += THREE.MathUtils.clamp(diff, -6 * dt, 6 * dt);
      ped.walkT += dt * spd * 3.6;
    }
    collide(ped.pos, 0.4);
    ped.pos.x = THREE.MathUtils.clamp(ped.pos.x, -300, 300);
    ped.pos.z = THREE.MathUtils.clamp(ped.pos.z, -225, 250);
    ped.pos.y = floorY(ped.pos.x, ped.pos.z) + 0.22;
    ped.group.rotation.y = ped.heading;
    const sw = Math.sin(ped.walkT) * 0.55;
    ped.legL.rotation.x = sw; ped.legR.rotation.x = -sw;
    if (!danger) { ped.armL.rotation.x = -sw * 0.7; ped.armR.rotation.x = sw * 0.7; }
    else { ped.armL.rotation.x = 0; ped.armR.rotation.x = 0; }
    if (ped.chat && !danger && ped.partner) {
      ped.group.rotation.y = Math.atan2(ped.partner.pos.x - ped.pos.x, ped.partner.pos.z - ped.pos.z);
      ped.head.rotation.y = Math.sin(state.time * 0.45 + ped.phase) * 0.4;
      ped.armR.rotation.x = -0.5 + Math.sin(state.time * 1.4 + ped.phase) * 0.3;
      ped.armL.rotation.x = Math.sin(state.time * 1.1 + ped.phase * 2) * 0.12;
      ped.legL.rotation.x = ped.legR.rotation.x = 0;
    } else if (!danger) {
      ped.head.rotation.y = Math.sin(state.time * 0.3 + ped.phase) * 0.45;
      ped.group.rotation.x = ped.lean || 0;
    }
  }
}
// ---------- WANTED — witness-based (NEON COAST adoption) ----------
const SEARCH_R0 = 55; // search-zone starting radius (m), shrinks while police search
function crimeWitness(pos) {
  for (const c of police) if (c.pos.distanceTo(pos) < 44 && losClear(c.pos, pos)) return { police: true, ped: null };
  for (const p of peds) if (!p.down && p.pos.distanceTo(pos) < 24 && losClear(p.pos, pos)) return { police: false, ped: p };
  return { police: false, ped: null };
}
function applyCrime(amount, pos) {
  const before = starsNow();
  state.wantedF = Math.min(5, state.wantedF + amount);
  state.lastCrime = state.time;
  state.lastKnown = pos.clone(); state.searchR = SEARCH_R0; state.searching = false;
  const now = starsNow();
  if (now > before && now >= 2 && typeof showDialog === 'function')
    showDialog(`Hati-hati, Raka — polisi Port Senja meluncur. ${now} bintang. Putus garis pandang mereka dan keluar dari zona pencarian.`);
  else if (now > before && now === 1 && typeof showDialog === 'function')
    showDialog('Ada yang melihat itu, Raka. Satu bintang — mengendaplah, nanti memudar.');
}
function reportCrime(amount, opts = {}) {
  const pos = playerPos();
  if (opts.force) { applyCrime(amount, pos); state.lastSeen = state.time; return true; }
  const w = crimeWitness(pos);
  if (w.police) { applyCrime(amount, pos); state.lastSeen = state.time; return true; }
  if (w.ped) { // the witness flees and reports ~2.5 s later — unless downed first
    if (state.pendingReports.length < 6) state.pendingReports.push({ amount, at: state.time + 2.5, witness: w.ped, pos: pos.clone() });
    return true;
  }
  if (opts.loud) { // unseen, but police close enough to hear it will search the area
    for (const c of police) if (c.pos.distanceTo(pos) < 34) { state.lastKnown = pos.clone(); state.searchR = SEARCH_R0; break; }
  }
  return false; // no witness, no report, no stars
}
// ---------- police ----------
const police = [];
let polTex = null;
function policeTexture() {
  if (polTex) return polTex;
  polTex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#123a7a'; g.fillRect(0, 0, w, h);
    g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffffff';
    g.fillText('POLISI', w / 2, 46);
  });
  return polTex;
}
function makePoliceCar(x, z, heading, interceptor = false) {
  const car = makeCar(0xf0f2f4, interceptor ? 9 : 8, true);
  car.police = true; car.parked = false; car.speed = 0;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.2, 4.32),
    new THREE.MeshStandardMaterial({ color: 0x141c28, roughness: 0.5 }));
  stripe.position.y = 0.6; car.group.add(stripe);
  const sideMat = new THREE.MeshBasicMaterial({ map: policeTexture() });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), sideMat);
    p.position.set(s * 0.98, 0.62, 0); p.rotation.y = s * Math.PI / 2; car.group.add(p);
  }
  const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x111114 }));
  barBase.position.set(0, 1.38, 0.25); car.group.add(barBase);
  const redMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 3 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x2266ff, emissiveIntensity: 0.2 });
  const rl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.44), redMat); rl.position.set(-0.28, 1.5, 0.25); car.group.add(rl);
  const bl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.44), blueMat); bl.position.set(0.28, 1.5, 0.25); car.group.add(bl);
  car.lightbar = { redMat, blueMat };
  car.ai = { revT: 0, stuckT: 0, shootT: 1 + Math.random() * 1.4, leaveT: 0, wp: null, wpT: 0 };
  car.pos.set(x, floorY(x, z), z); car.heading = heading;
  car.group.position.copy(car.pos); car.group.rotation.y = heading;
  cars.push(car); police.push(car);
  return car;
}
function spawnPolice() {
  const pp = playerPos();
  const ang = Math.random() * Math.PI * 2, dist = 56 + Math.random() * 16;
  let x = THREE.MathUtils.clamp(pp.x + Math.sin(ang) * dist, -290, 290);
  let z = THREE.MathUtils.clamp(pp.z + Math.cos(ang) * dist, -215, 240);
  const snap = nearestOnLanes({ x, z });
  if (snap) { x = snap.x; z = snap.z; }
  const heading = Math.atan2(-(pp.x - x), -(pp.z - z));
  makePoliceCar(x, z, heading, starsNow() >= 5 && Math.random() < 0.5);
}
function removePolice(car) {
  scene.remove(car.group);
  let i = cars.indexOf(car); if (i >= 0) cars.splice(i, 1);
  i = police.indexOf(car); if (i >= 0) police.splice(i, 1);
}
function clearPolice() { while (police.length) removePolice(police[0]); }
// roadblock (★4+): two patrol cars parked across the lane ahead of the player
const roadblock = [];
function setRoadblock(on) {
  if (on && !roadblock.length) {
    const pp = playerPos();
    const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
    const ahead = { x: pp.x + fx * 42, z: pp.z + fz * 42 };
    const snap = nearestOnLanes(ahead);
    const cx = snap ? snap.x : ahead.x, cz = snap ? snap.z : ahead.z;
    for (const s of [-2.6, 2.6]) {
      const c = makePoliceCar(cx + fz * s, cz - fx * s, state.heading + Math.PI / 2);
      c.parked = true; c.ai.leaveT = 0; roadblock.push(c);
    }
  } else if (!on && roadblock.length) {
    for (const c of roadblock) removePolice(c);
    roadblock.length = 0;
  }
}
// helicopter (★4+): hovers above the player, searchlight cone; while lit, no decay
let heli = null;
function ensureHeli(on) {
  if (on && !heli) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 4.6),
      new THREE.MeshStandardMaterial({ color: 0x123a7a, roughness: 0.5, metalness: 0.4 }));
    body.castShadow = true; g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), body.material);
    tail.position.set(0, 0.2, 3.6); g.add(tail);
    const rotorGeo = new THREE.BoxGeometry(9, 0.08, 0.5);
    const rotor = new THREE.Mesh(rotorGeo, new THREE.MeshStandardMaterial({ color: 0x22242c, roughness: 0.4, metalness: 0.6 }));
    rotor.position.y = 0.95; g.add(rotor);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 26, 14, 1, true), coneMat);
    cone.rotation.x = Math.PI; cone.position.y = -13.5; g.add(cone);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(2.2, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    spot.rotation.x = -Math.PI / 2; spot.position.y = -25.5; g.add(spot);
    scene.add(g);
    heli = { group: g, rotor, cone, spot, pos: g.position, lit: false };
  } else if (!on && heli) {
    scene.remove(heli.group); heli = null;
  }
}
let spawnT = 0;
function stepPolice(dt) {
  const stars = starsNow();
  const desired = stars;
  spawnT -= dt;
  if (stars > 0 && police.length < desired + roadblock.length && spawnT <= 0) { spawnPolice(); spawnT = 1.6; }
  setRoadblock(stars >= 4);
  ensureHeli(stars >= 4);
  const pp = playerPos();
  const phase = Math.floor(state.time * 5) % 2 === 0;
  for (let idx = police.length - 1; idx >= 0; idx--) {
    const car = police[idx], ai = car.ai;
    if (roadblock.includes(car)) continue; // roadblock cars hold their line
    if (car.lightbar) {
      car.lightbar.redMat.emissiveIntensity = phase ? 3.2 : 0.15;
      car.lightbar.blueMat.emissiveIntensity = phase ? 0.15 : 3.2;
    }
    if (stars === 0) { // heat is gone: roll away and despawn
      ai.leaveT += dt; car.speed = Math.min(14, (car.speed || 0) + 10 * dt);
      car.pos.x += -Math.sin(car.heading) * car.speed * dt;
      car.pos.z += -Math.cos(car.heading) * car.speed * dt;
      groundCar(car);
      if (ai.leaveT > 4 || car.pos.distanceTo(pp) > 110) removePolice(car);
      continue;
    }
    // chase steering; far away -> route via the nearest lane point to the player
    let tx = pp.x, tz = pp.z;
    const rawDist = Math.hypot(pp.x - car.pos.x, pp.z - car.pos.z);
    if (state.searching && state.lastKnown && rawDist > 30) { tx = state.lastKnown.x; tz = state.lastKnown.z; }
    else if (rawDist > 22) {
      if (ai.wp && Math.hypot(ai.wp.x - car.pos.x, ai.wp.z - car.pos.z) < 8) ai.wp = null;
      if (!ai.wp || state.time > ai.wpT) { ai.wp = nearestOnLanes(pp); ai.wpT = state.time + 7; }
      if (ai.wp) { tx = ai.wp.x; tz = ai.wp.z; }
    } else ai.wp = null;
    const dx = tx - car.pos.x, dz = tz - car.pos.z;
    const dist = Math.hypot(pp.x - car.pos.x, pp.z - car.pos.z) || 0.001;
    const want = Math.atan2(-dx / (Math.hypot(dx, dz) || 0.001), -dz / (Math.hypot(dx, dz) || 0.001));
    let diff = want - car.heading; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    const aggression = 1.5 + stars * 0.22;
    car.heading += THREE.MathUtils.clamp(diff, -aggression * dt, aggression * dt);
    const onFoot = state.mode === 'foot';
    let targetSpeed = 23 + stars * 1.9;
    if (stars >= 5) targetSpeed += 3; // PIT aggression
    if (Math.abs(diff) > 1.1) targetSpeed = 9;
    if (onFoot && dist < 6) targetSpeed = 0;
    else if (!onFoot && dist < 5) targetSpeed = stars >= 5 ? 16 : 13; // ★5 PIT: stay on the bumper, harder
    if (ai.revT > 0) { ai.revT -= dt; targetSpeed = -8; }
    car.speed = THREE.MathUtils.clamp((car.speed || 0) + THREE.MathUtils.clamp(targetSpeed - (car.speed || 0), -30 * dt, 13 * dt), -9, 34);
    car.speed -= slopeGrad(car.pos.x, car.pos.z, car.heading) * SLOPE_GRAV * 0.6 * dt;
    const beforeX = car.pos.x, beforeZ = car.pos.z;
    car.pos.x += -Math.sin(car.heading) * car.speed * dt;
    car.pos.z += -Math.cos(car.heading) * car.speed * dt;
    const hitP = new THREE.Vector3().copy(car.pos);
    if (collide(hitP, 1.7)) {
      car.pos.copy(hitP);
      if (Math.abs(car.speed) > 6) { damageCar(car, 4); state.lastCrash = state.time; }
      car.speed *= -0.3; ai.revT = 0.6;
    }
    if (!onFoot && state.car && car !== state.car) {
      const d2 = car.pos.distanceTo(state.car.pos);
      if (d2 < 3.4 && Math.abs(car.speed) > 5) {
        damageCar(state.car, stars >= 5 ? 6 : 3.5); damageCar(car, 2);
        state.shake = Math.min(0.5, state.shake + 0.12); state.lastCrash = state.time; car.speed *= 0.6;
      }
    }
    const moved = Math.hypot(car.pos.x - beforeX, car.pos.z - beforeZ);
    if (Math.abs(car.speed) > 3 && moved < 0.4 * dt) { ai.stuckT += dt; if (ai.stuckT > 1.4) { ai.revT = 0.8; ai.stuckT = 0; } }
    else ai.stuckT = 0;
    car.pos.x = THREE.MathUtils.clamp(car.pos.x, -300, 300);
    car.pos.z = THREE.MathUtils.clamp(car.pos.z, -225, 250);
    groundCar(car);
    car.brakeMat.emissiveIntensity = targetSpeed < car.speed - 1 ? 3 : 0.4;
    for (const w of car.wheels) w.rotation.x += car.speed * dt / 0.36;
    // police shoot back at ★3+
    ai.shootT -= dt;
    if (stars >= 3 && ai.shootT <= 0 && dist < 27 && dist > 3.5 && typeof spawnTracer === 'function') {
      ai.shootT = 1.1 + Math.random() * 0.9;
      const from = car.pos.clone(); from.y = car.pos.y + 1.35;
      const to = pp.clone(); to.y = (state.mode === 'car' ? car.pos.y + 0.8 : state.pos.y + 1.25);
      to.x += (Math.random() - 0.5) * 1.6; to.z += (Math.random() - 0.5) * 1.6;
      spawnTracer(from, to, 0xff9d7a); spawnFlash(from, 0.8);
      if (typeof gunSound === 'function') gunSound(0.12);
      let hitChance = 0.55;
      if (state.crouch) hitChance *= 0.5; // cover-lite: crouching behind cover is harder to hit
      if (Math.random() < hitChance && typeof damagePlayer === 'function') {
        if (state.mode === 'car' && state.car) { damageCar(state.car, 4); if (Math.random() < 0.4) damagePlayer(2, car.pos); }
        else damagePlayer(5, car.pos);
        if (!state.policeShootNote && typeof showDialog === 'function') {
          state.policeShootNote = true;
          showDialog('Mereka menembak, Raka! Tiga bintang terlalu panas — lari atau tinggalkan mobil!');
        }
      }
    }
  }
  // helicopter follow + searchlight
  if (heli) {
    heli.pos.x += (pp.x - heli.pos.x) * Math.min(1, dt * 1.4);
    heli.pos.z += (pp.z - heli.pos.z) * Math.min(1, dt * 1.4);
    heli.pos.y = floorY(heli.pos.x, heli.pos.z) + 26 + Math.sin(state.time * 1.3) * 1.2;
    heli.rotor.rotation.y = state.time * 22;
    const hd = Math.hypot(pp.x - heli.pos.x, pp.z - heli.pos.z);
    heli.lit = hd < 14;
    heli.cone.material.opacity = heli.lit ? 0.22 : 0.1;
    heli.spot.position.set(pp.x - heli.pos.x, -25.5 + (floorY(pp.x, pp.z) - floorY(heli.pos.x, heli.pos.z)), pp.z - heli.pos.z);
    if (heli.lit) state.lastSeen = state.time; // while lit, wanted does NOT decay
  }
}
// ---------- law clock: LOS, decay, search zone, reload, regen, busted ----------
function stepLaw(dt) {
  // pending witness reports (cancelled if the witness was downed)
  for (let i = state.pendingReports.length - 1; i >= 0; i--) {
    const r = state.pendingReports[i];
    if (r.witness.down) { state.pendingReports.splice(i, 1); continue; }
    if (state.time >= r.at) { applyCrime(r.amount, r.pos); state.lastSeen = state.time; state.pendingReports.splice(i, 1); }
  }
  const pp = playerPos();
  let seen = false;
  for (const c of police) {
    if (roadblock.includes(c)) continue;
    if (c.pos.distanceTo(pp) < 37 && losClear(c.pos, pp)) { seen = true; break; }
  }
  if (seen) {
    state.lastSeen = state.time; state.lastKnown = pp.clone(); state.searchR = SEARCH_R0; state.searching = false;
  } else if (state.wantedF > 0 && state.time - state.lastSeen > 6.5) {
    state.searching = true;
    state.searchR = Math.max(12, state.searchR - 1.5 * dt); // the ring shrinks
    state.wantedF = Math.max(0, state.wantedF - dt * (state.hiddenSwap ? 0.22 : 0.1));
    if (state.wantedF <= 0.01) { state.wantedF = 0; state.hiddenSwap = false; state.searching = false; state.searchR = 0; }
  }
  if (state.reloading > 0) {
    state.reloading -= dt;
    if (state.reloading <= 0 && typeof finishReload === 'function') finishReload();
  }
  if (state.shootCd > 0) state.shootCd -= dt;
  if (playerMesh.armR.rotation.x < -0.5 && state.time - state.lastShot > 0.45) playerMesh.armR.rotation.x *= 0.8;
  if (state.health > 0 && state.health < 100 && state.time - state.lastHurt > 9) state.health = Math.min(100, state.health + 3 * dt);
  // busted meter: police close + player (nearly) stopped
  const stars = starsNow();
  let nearPolice = false;
  for (const c of police) if (c.pos.distanceTo(pp) < (state.mode === 'car' ? 8.5 : 6.5)) { nearPolice = true; break; }
  const slow = state.mode === 'car' ? Math.abs(state.car ? state.car.speed : 0) < 2.5 : state.footSpeed < 0.6;
  if (stars >= 1 && nearPolice && slow && (state.mode === 'foot' || state.mode === 'car')) state.busted += dt / 2.6;
  else state.busted = Math.max(0, state.busted - dt / 1.4);
  if (state.busted >= 1 && typeof triggerEnd === 'function') { state.busted = 0; triggerEnd('busted'); }
}
function honk(car) { // horn: nearby peds glance / step aside briefly
  if (typeof gunSound === 'function') { /* horn synth lives in chunk 5 audio; visual cue here */ }
  for (const ped of peds) {
    if (!ped.down && ped.pos.distanceTo(car.pos) < 12) { ped.fleeUntil = state.time + 0.8; ped.fleeFrom.copy(car.pos); }
  }
}

// Chunk 5 — COMBAT (data-driven weapons, pickups, blood), BUSTED/WASTED,
// HUD + minimap overlays (search ring, blips), dialog, audio synth.
// ---------- weapons (data-driven array) ----------
const WEAPONS = [
  { name: 'Fists', dmg: 12, range: 2.2, rate: 0.45, mag: Infinity, auto: false, spread: 0, pellets: 1 },
  { name: 'Pistol', dmg: 34, range: 55, rate: 0.27, mag: 12, auto: false, spread: 0.008, pellets: 1 },
  { name: 'SMG', dmg: 18, range: 45, rate: 0.09, mag: 30, auto: true, spread: 0.03, pellets: 1 },
  { name: 'Shotgun', dmg: 9, range: 22, rate: 0.85, mag: 6, auto: false, spread: 0.09, pellets: 7 },
  { name: 'Assault Rifle', dmg: 26, range: 70, rate: 0.11, mag: 30, auto: true, spread: 0.015, pellets: 1 },
];
const owned = [true, true, false, false, false];
state.mag = { 1: 12, 2: 0, 3: 0, 4: 0 };
state.reserve = { 1: Infinity, 2: 0, 3: 0, 4: 0 };
function selectWeapon(i) {
  if (!owned[i] || state.weapon === i) return;
  state.weapon = i;
  if (playerMesh.gun) playerMesh.gun.visible = i > 0;
  refreshHUD();
}
if (playerMesh.gun) playerMesh.gun.visible = true;
// ---------- audio (WebAudio synth only) ----------
let AC = null;
function ensureAudio() { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { /* no audio */ } }
function gunSound(vol = 0.4) {
  if (!AC) return;
  try {
    const t = AC.currentTime, len = Math.floor(AC.sampleRate * 0.14);
    const buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = AC.createBufferSource(); src.buffer = buf;
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(f); f.connect(g); g.connect(AC.destination); src.start();
  } catch (e) { /* ignore */ }
}
// ---------- pooled FX: tracers, muzzle flashes, blood, smoke ----------
const tracerPool = [], flashPool = [], fxPool = [];
{
  const geo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.9 }));
    m.visible = false; scene.add(m); const p = { mesh: m, life: 0 }; tracerPool.push(p); fxPool.push(p);
  }
  const fgeo = new THREE.SphereGeometry(0.22, 8, 8);
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({ color: 0xffc95e, transparent: true, opacity: 0.95 }));
    m.visible = false; scene.add(m); const p = { mesh: m, life: 0 }; flashPool.push(p); fxPool.push(p);
  }
}
let fxIdx = 0, flashIdx = 0;
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _mid = new THREE.Vector3();
function spawnTracer(from, to, color = 0xffe28a, persist = false) {
  const p = tracerPool[fxIdx++ % tracerPool.length];
  _dir.copy(to).sub(from); const len = Math.max(0.1, _dir.length());
  _mid.copy(from).add(to).multiplyScalar(0.5);
  p.mesh.position.copy(_mid); p.mesh.scale.set(1, len, 1);
  p.mesh.quaternion.setFromUnitVectors(_up, _dir.normalize());
  p.mesh.material.color.setHex(color); p.mesh.visible = true; p.life = persist ? 9999 : 0.09;
  return p;
}
function spawnFlash(at, scale = 1, persist = false) {
  const p = flashPool[flashIdx++ % flashPool.length];
  p.mesh.position.copy(at); p.mesh.scale.setScalar(scale); p.mesh.visible = true;
  p.life = persist ? 9999 : 0.07; return p;
}
function stepFx(dt) {
  for (const p of fxPool) { if (p.life <= 0 || p.life > 9000) continue;
    p.life -= dt; if (p.life <= 0) p.mesh.visible = false; }
}
const bloodPool = [];
{
  const geo = new THREE.TetrahedronGeometry(0.09);
  const mat = new THREE.MeshBasicMaterial({ color: 0xc01818 });
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(geo, mat); m.visible = false; scene.add(m);
    bloodPool.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
  }
}
let bloodIdx = 0;
function spawnBlood(at, n = 10) {
  for (let k = 0; k < n; k++) {
    const p = bloodPool[bloodIdx++ % bloodPool.length];
    p.mesh.position.copy(at); p.mesh.visible = true; p.life = 0.5 + Math.random() * 0.3;
    p.vel.set((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4);
  }
}
function stepBlood(dt) {
  for (const p of bloodPool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vel.y -= 12 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.scale.setScalar(Math.max(0.1, p.life * 2));
  }
}
const smokePool = [];
{
  const geo = new THREE.SphereGeometry(0.5, 8, 6);
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x555560, transparent: true, opacity: 0.55, roughness: 1 }));
    m.visible = false; scene.add(m);
    smokePool.push({ mesh: m, life: 0 });
  }
}
let smokeIdx = 0;
function puff(origin, strength = 1) {
  for (let k = 0; k < 3; k++) {
    const p = smokePool[smokeIdx++ % smokePool.length];
    p.mesh.position.set(origin.x + (Math.random() - 0.5) * 0.6, origin.y + Math.random() * 0.5, origin.z + (Math.random() - 0.5) * 0.6);
    p.mesh.visible = true; p.life = 0.9; p.mesh.scale.setScalar(0.6 * strength);
    p.mesh.material.opacity = 0.55;
  }
}
function stepSmoke(dt) {
  for (const p of smokePool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.mesh.position.y += dt * 1.4;
    p.mesh.scale.multiplyScalar(1 + dt * 1.6);
    p.mesh.material.opacity = Math.max(0, p.life * 0.6);
  }
}
// ---------- combat ----------
let mouseDown = false;
addEventListener('pointerdown', e => { if (e.button === 0) mouseDown = true; });
addEventListener('pointerup', e => { if (e.button === 0) mouseDown = false; });
function startReload() {
  const w = WEAPONS[state.weapon];
  if (state.weapon === 0 || state.reloading > 0) return;
  if ((state.mag[state.weapon] || 0) >= w.mag) return;
  if ((state.reserve[state.weapon] || 0) <= 0) return;
  state.reloading = 1.15;
}
function finishReload() {
  const w = WEAPONS[state.weapon];
  const need = w.mag - (state.mag[state.weapon] || 0);
  const take = Math.min(need, state.reserve[state.weapon] === Infinity ? need : state.reserve[state.weapon]);
  state.mag[state.weapon] = (state.mag[state.weapon] || 0) + take;
  if (state.reserve[state.weapon] !== Infinity) state.reserve[state.weapon] -= take;
}
function playerShoot(persist = false) {
  if (state.mode !== 'foot' || state.reloading > 0 || state.shootCd > 0) return false;
  const w = WEAPONS[state.weapon];
  if (state.weapon > 0 && (state.mag[state.weapon] || 0) <= 0) { startReload(); return false; }
  ensureAudio();
  if (state.weapon > 0) state.mag[state.weapon]--;
  state.shootCd = w.rate; state.lastShot = state.time;
  const aim = new THREE.Vector3(); camera.getWorldDirection(aim);
  state.heading = Math.atan2(aim.x, aim.z);
  player.rotation.y = state.heading;
  playerMesh.armR.rotation.x = -1.35;
  const rayD = new THREE.Vector3(aim.x, 0, aim.z).normalize();
  const origin = state.pos.clone(); origin.y = state.pos.y + 1.42;
  origin.addScaledVector(rayD, 0.4);
  const rayO = origin.clone();
  gunSound(0.45);
  // fists: melee swing, no tracer
  if (state.weapon === 0) {
    let hitPed = null;
    for (const ped of peds) {
      if (ped.down) continue;
      const d = ped.pos.distanceTo(state.pos);
      if (d < w.range && Math.abs(Math.atan2(ped.pos.x - state.pos.x, ped.pos.z - state.pos.z) - state.heading) < 0.9) { hitPed = ped; break; }
    }
    if (hitPed) { knockPed(hitPed, false); hitPed.downT = 9; spawnBlood(hitPed.pos.clone().setY(hitPed.pos.y + 1), 8); reportCrime(1, { loud: true, force: true }); }
    for (const ped of peds) if (!ped.down && ped.pos.distanceTo(state.pos) < 26) { ped.fleeUntil = state.time + 2.6; ped.fleeFrom.copy(state.pos); }
    refreshHUD();
    return true;
  }
  let bestT = w.range, hitPoint = null, hitPed = null, hitCar = null, headshot = false;
  const testSphere = (centre, radius, onHit) => {
    _dir.copy(centre).sub(rayO); const t = _dir.dot(rayD);
    if (t < 0.5 || t > bestT) return;
    _mid.copy(rayO).addScaledVector(rayD, t);
    if (_mid.distanceTo(centre) < radius) { bestT = t; hitPoint = _mid.clone(); onHit(); }
  };
  for (let pel = 0; pel < w.pellets; pel++) {
    const spreadD = rayD.clone();
    spreadD.x += (Math.random() - 0.5) * w.spread * 2;
    spreadD.z += (Math.random() - 0.5) * w.spread * 2;
    spreadD.normalize();
    const saveRay = rayD.clone(); rayD.copy(spreadD);
    for (const ped of peds) {
      if (ped.down) continue;
      const head = ped.pos.clone(); head.y = ped.pos.y + 1.42;
      testSphere(head, 0.35, () => { hitPed = ped; hitCar = null; headshot = true; });
      const body = ped.pos.clone(); body.y = ped.pos.y + 0.8;
      testSphere(body, 1.0, () => { if (hitPed) return; hitPed = ped; hitCar = null; }); // body hit counts unless a headshot already landed
    }
    for (const c of cars) {
      if (c === state.car) continue;
      const centre = c.pos.clone(); centre.y = c.pos.y + 0.75;
      testSphere(centre, 2.1, () => { hitCar = c; hitPed = null; headshot = false; });
    }
    rayD.copy(saveRay);
  }
  const end = hitPoint || rayO.clone().addScaledVector(rayD, 55);
  spawnTracer(origin, end, 0xffe28a, persist); spawnFlash(origin, 1.15, persist);
  if (hitPed) {
    spawnBlood(hitPoint, headshot ? 16 : 10);
    knockPed(hitPed, false); hitPed.downT = 9;
    reportCrime(1, { loud: true, force: true });
    if (headshot && typeof showDialog === 'function') showDialog('Headshot. — Sari: "Bersih. Jangan lama-lama di situ."');
  } else if (hitCar) {
    damageCar(hitCar, w.dmg * (headshot ? 2 : 1)); puff(end, 0.7);
    reportCrime(hitCar.police ? 1 : 0.5, { loud: true });
    if (hitCar.police) state.lastSeen = state.time;
  } else reportCrime(0.5, { loud: true });
  for (const ped of peds) if (!ped.down && ped.pos.distanceTo(state.pos) < 26) { ped.fleeUntil = state.time + 2.6; ped.fleeFrom.copy(state.pos); }
  if (state.weapon > 0 && (state.mag[state.weapon] || 0) === 0) startReload();
  refreshHUD();
  return true;
}
function aimAt(x, z) { // debug/QA helper: turn the camera (and the aim ray) at a point
  camYaw = Math.atan2(x - state.pos.x, z - state.pos.z);
  state.aiming = true;
}
// ---------- pickups (glowing world spawns + police drops) ----------
const pickups = [];
const PICKUP_DEF = {
  smg: { weapon: 2, label: 'SMG', color: 0x39d0c4, ammo: 90 },
  shotgun: { weapon: 3, label: 'Shotgun', color: 0xff7a3c, ammo: 24 },
  rifle: { weapon: 4, label: 'Assault Rifle', color: 0xf2b13d, ammo: 90 },
  ammo: { weapon: -1, label: 'Ammo', color: 0x7dc383, ammo: 60 },
};
function addPickup(x, z, kind, respawnIn = 0) {
  const def = PICKUP_DEF[kind]; if (!def) return null;
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 2.2, roughness: 0.3 }));
  box.position.y = 0.6; g.add(box);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 24),
    new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.7 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring);
  g.position.set(x, floorY(x, z), z);
  scene.add(g);
  const p = { group: g, box, kind, def, x, z, taken: false, respawnAt: 0 };
  pickups.push(p); return p;
}
function dropPickup(x, z, kind) {
  if (pickups.filter(p => !p.taken).length >= 10) return;
  addPickup(x, z, kind);
}
{ // fixed spawns: plaza, harbor quay, island resort, hill climb
  addPickup(40, -60, 'smg');
  addPickup(170, 100, 'shotgun');
  addPickup(248, 150, 'rifle');
  addPickup(-140, -100, 'ammo');
}
function stepPickups(dt) {
  for (const p of pickups) {
    if (p.taken) {
      if (p.respawnAt && state.time >= p.respawnAt) { p.taken = false; p.group.visible = true; p.respawnAt = 0; }
      continue;
    }
    p.box.rotation.y = state.time * 1.6;
    p.box.position.y = 0.6 + Math.sin(state.time * 2.4 + p.x) * 0.18;
    if (state.mode !== 'busted' && state.mode !== 'wasted' && p.group.visible !== false) {
      const pp = playerPos();
      if (Math.hypot(pp.x - p.x, pp.z - p.z) < 2.2) {
        p.taken = true; p.group.visible = false; p.respawnAt = state.time + 45;
        if (p.def.weapon >= 0) {
          owned[p.def.weapon] = true;
          state.reserve[p.def.weapon] = (state.reserve[p.def.weapon] || 0) + p.def.ammo;
          if (state.mag[p.def.weapon] === 0) state.mag[p.def.weapon] = WEAPONS[p.def.weapon].mag;
          selectWeapon(p.def.weapon);
          if (typeof showDialog === 'function') showDialog(`Picked up ${p.def.label} — ${p.def.ammo} rounds. Keys 1–5 switch weapons.`);
        } else {
          const w = state.weapon;
          if (w > 0) state.reserve[w] = (state.reserve[w] === Infinity ? Infinity : (state.reserve[w] || 0) + p.def.ammo);
          if (typeof showDialog === 'function') showDialog(`Ammo +${p.def.ammo}.`);
        }
        refreshHUD();
      }
    }
  }
}
// ---------- damage / busted / wasted ----------
const STATION_POS = new THREE.Vector3(28, 0, -150); // police post, north spoke
const HOSPITAL_POS = new THREE.Vector3(104, 0, 92); // clinic, harbor grid
function damagePlayer(amount, srcPos) {
  if (amount <= 0 || state.mode === 'busted' || state.mode === 'wasted' || state.mode === 'title') return;
  state.health -= amount; state.lastHurt = state.time;
  const hurt = document.getElementById('hurt');
  if (hurt) hurt.style.opacity = '1';
  if (state.health <= 0) { state.health = 0; triggerEnd('wasted'); }
}
function triggerEnd(kind) {
  if (state.mode === 'busted' || state.mode === 'wasted') return;
  state.endKind = kind; state.mode = kind; state.endT = 3.4;
  const stars = starsNow();
  const penalty = kind === 'busted' ? Math.min(state.cash, 80 + stars * 40) : Math.min(state.cash, 120);
  state.cash -= penalty;
  const et = document.getElementById('end-title'), ex = document.getElementById('end-text'), es = document.getElementById('end-screen');
  if (et) { et.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED'; et.style.color = kind === 'busted' ? '#7db4ff' : '#ff5252'; }
  if (ex) ex.textContent = kind === 'busted'
    ? `Polisi Port Senja menangkapmu. Denda: $${penalty}. Kamu dilepas di luar kantor polisi — wanted bersih.`
    : `Kamu pingsan di jalan. Biaya rumah sakit: $${penalty}. Kamu bangun di luar klinik — wanted bersih.`;
  if (es) es.hidden = false;
  setRoadblock(false); ensureHeli(false);
}
function doRespawn() {
  const kind = state.endKind || 'wasted';
  clearPolice(); setRoadblock(false); ensureHeli(false);
  state.wantedF = 0; state.busted = 0; state.hiddenSwap = false; state.searchR = 0; state.searching = false;
  state.pendingReports.length = 0;
  if (state.car) { state.car.parked = true; state.car = null; }
  player.visible = true;
  state.pos.copy(kind === 'busted' ? STATION_POS : HOSPITAL_POS);
  state.pos.y = floorY(state.pos.x, state.pos.z);
  state.health = kind === 'busted' ? Math.max(70, state.health) : 100;
  state.heading = Math.PI * 0.75; camYaw = state.heading;
  player.position.copy(state.pos); player.rotation.y = state.heading;
  const es = document.getElementById('end-screen'); if (es) es.hidden = true;
  state.mode = 'foot'; state.prevMode = 'foot'; state.endKind = null;
  const obj = document.getElementById('objective');
  if (obj) obj.textContent = '📍 Free roam — Port Senja v2 • WASD jalan, E masuk mobil, F tembak';
  showDialog(kind === 'busted' ? 'Sudah keluar? Kali ini yang bersih, Raka. — Sari' : 'Kamu sudah ditambal. Mobil bisa menunggu — kakimu tidak. — Sari');
}
// ---------- dialog / HUD ----------
function showDialog(text) {
  const d = document.getElementById('dialog'), dt = document.getElementById('dialog-text');
  if (!d || !dt) return;
  d.hidden = false; d.style.opacity = '1'; dt.textContent = text;
  clearTimeout(showDialog._t);
  showDialog._t = setTimeout(() => { d.style.opacity = '0.25'; }, 8000);
}
const hud = {
  health: document.getElementById('health-bar'), cash: document.getElementById('cash'),
  speed: document.getElementById('speed'), objective: document.getElementById('objective'),
  prompt: document.getElementById('prompt'), wanted: document.getElementById('wanted'),
  ammo: document.getElementById('ammo'), ammoCount: document.getElementById('ammo-count'),
  reloadNote: document.getElementById('reload-note'), crosshair: document.getElementById('crosshair'),
  bustedWrap: document.getElementById('busted-wrap'), bustedBar: document.getElementById('busted-bar'),
  hurt: document.getElementById('hurt'), stamina: document.getElementById('stamina-bar'),
};
let lastStarsShown = -1;
function refreshHUD() {
  if (hud.health) {
    hud.health.style.width = Math.max(0, state.health) + '%';
    hud.health.style.background = state.health > 50 ? 'linear-gradient(90deg,#7dc383,#b7e07a)' : state.health > 25 ? 'linear-gradient(90deg,#e0a53d,#f2c13d)' : 'linear-gradient(90deg,#d94f3d,#ff5252)';
  }
  if (hud.stamina) hud.stamina.style.width = Math.max(0, state.stamina) + '%';
  if (hud.cash) hud.cash.textContent = '$' + Math.round(state.cash);
  const stars = starsNow();
  if (hud.wanted && stars !== lastStarsShown) {
    lastStarsShown = stars;
    hud.wanted.innerHTML = [1, 2, 3, 4, 5].map(i => `<span class="${i <= stars ? 'on' : ''}">${i <= stars ? '★' : '☆'}</span>`).join('');
  }
  if (hud.wanted) hud.wanted.classList.toggle('searching', state.searching && stars > 0);
  const w = WEAPONS[state.weapon];
  if (hud.ammo) {
    const magTxt = state.weapon === 0 ? '—' : String(state.mag[state.weapon] || 0);
    const resTxt = state.weapon === 0 ? '' : (state.reserve[state.weapon] === Infinity ? '∞' : String(state.reserve[state.weapon] || 0));
    hud.ammo.innerHTML = `🔫 ${w.name} &nbsp;<b>${magTxt}</b>${state.weapon === 0 ? '' : ' / ' + resTxt}&nbsp;<span style="color:var(--muted)">${state.reloading > 0 ? 'Reloading…' : ''}</span>`;
  }
  if (hud.crosshair) hud.crosshair.hidden = !(state.mode === 'foot' && (state.aiming || state.weapon > 0));
  if (hud.bustedWrap) {
    hud.bustedWrap.hidden = state.busted <= 0.02;
    if (hud.bustedBar) hud.bustedBar.style.width = Math.round(state.busted * 100) + '%';
  }
  if (hud.speed) {
    if (state.mode === 'car' && state.car) {
      const surf = state.car._surfName || 'asphalt';
      hud.speed.textContent = `Speed ${Math.round(Math.abs(state.car.speed) * 3.6)} km/h • ${state.car.modelName} • HP ${Math.round(state.car.health)}${state.car.flatTire ? ' • BAN KEMPES' : ''} • ${surf}`;
    } else if (state.mode === 'foot') {
      hud.speed.textContent = state.footState === 'swim' ? 'Swimming' : state.footState === 'crouch' ? 'Crouching' : state.footState === 'run' ? 'Running' : state.footState === 'aim' ? 'Aiming' : state.footState === 'roll' ? 'Rolling!' : state.footState === 'vault' ? 'Vault!' : state.footSpeed > 0.5 ? 'On foot — moving' : 'On foot';
    }
  }
}
// ---------- weapon wheel (Tab: time ~20%) ----------
state.timeScale = 1;
let wheelOpen = false;
const wheelEl = document.getElementById('wheel');
function renderWheel() {
  if (!wheelEl) return;
  wheelEl.innerHTML = WEAPONS.map((w, i) =>
    `<div class="wheel-slot${owned[i] ? '' : ' locked'}${state.weapon === i ? ' sel' : ''}" data-w="${i}">
      <b>${i + 1}</b> ${w.name}<span>${i === 0 ? '∞' : (state.mag[i] ?? 0) + ' / ' + (state.reserve[i] === Infinity ? '∞' : (state.reserve[i] ?? 0))}</span></div>`).join('');
}
addEventListener('keydown', e => { if (e.code === 'Tab' && !wheelOpen) { wheelOpen = true; state.timeScale = 0.2; renderWheel(); if (wheelEl) wheelEl.hidden = false; } });
addEventListener('keyup', e => { if (e.code === 'Tab' && wheelOpen) { wheelOpen = false; state.timeScale = 1; if (wheelEl) wheelEl.hidden = true; } });
if (wheelEl) wheelEl.addEventListener('click', e => {
  const slot = e.target.closest('.wheel-slot'); if (!slot) return;
  selectWeapon(+slot.dataset.w);
});
// ---------- minimap overlays: search ring + blips ----------
const _drawMinimapOrig = drawMinimap;
drawMinimap = function (px, pz, heading) {
  _drawMinimapOrig(px, pz, heading);
  if (state.lastKnown && state.wantedF > 0) { // shrinking search zone
    mm.strokeStyle = state.searching ? 'rgba(255,180,60,0.95)' : 'rgba(255,80,60,0.95)';
    mm.lineWidth = 1.6; mm.setLineDash([5, 4]);
    mm.beginPath(); mm.arc(mmX(state.lastKnown.x), mmY(state.lastKnown.z), Math.max(2, state.searchR * MM_S), 0, 7); mm.stroke();
    mm.setLineDash([]);
    mm.fillStyle = 'rgba(255,80,60,0.9)';
    mm.beginPath(); mm.arc(mmX(state.lastKnown.x), mmY(state.lastKnown.z), 2.4, 0, 7); mm.fill();
  }
  const blip = (x, z, color, r = 2) => { mm.fillStyle = color; mm.beginPath(); mm.arc(mmX(x), mmY(z), r, 0, 7); mm.fill(); };
  for (const c of traffic) blip(c.pos.x, c.pos.z, 'rgba(240,240,240,0.85)', 1.6);
  for (const c of police) blip(c.pos.x, c.pos.z, '#5ea8ff', 2.4);
  if (heli) blip(heli.pos.x, heli.pos.z, '#ffe14d', 3);
  for (const p of pickups) if (!p.taken) blip(p.x, p.z, '#7dc383', 1.8);
};
const _obj = document.getElementById('objective');
if (_obj) _obj.textContent = '📍 Free roam — Port Senja v2 • WASD jalan, E masuk mobil, F tembak';

// Chunk 6 — SHOT STAGING (R-A district shots kept; R-B system shots added).
const SHOTS = {
  downtown: { p: [6, -58], cam: [-58, 34, -172], look: [42, 8, -78] },
  kotalama: { p: [-96, -34], cam: [-52, 44, -6], look: [-158, 12, -100] },
  pelabuhan: { p: [110, 66], cam: [92, 22, 26], look: [152, 2, 128] },
  resor: { p: [110, 176], cam: [52, 15, 236], look: [138, 4, 164] },
  pemukiman: { p: [-24, 34], cam: [2, 17, 40], look: [-96, 5, 122] },
  rawa: { p: [-196, 152], cam: [-158, 24, 214], look: [-208, 0, 146] },
  pulau: { p: [196, 158], cam: [196, 20, 234], look: [246, 4, 168] },
  sungai: { p: [30, 26], cam: [-44, 21, 66], look: [64, 3, -8] },
  aerial: { p: [6, -58], cam: [300, 330, 330], look: [0, 0, 10] },
  title: { p: [6, -58], cam: [-40, 26, -150], look: [40, 12, -80] },
  play: { p: [6, -58], cam: [-8, 8, -84], look: [30, 4, -60] },
};
function stageShot(name) {
  const hero = window.__heroCar;
  const putPlayer = (x, z, heading = 0.6) => {
    state.pos.set(x, 0, z); state.pos.y = floorY(x, z); state.heading = heading; camYaw = heading;
    player.position.copy(state.pos); player.rotation.y = heading;
  };
  const putCarOnLane = (car, laneId, sFrac, dir = 1, speed = 0) => {
    const L = laneById(laneId); const q = lanePoint(L, L.len * sFrac);
    const D = { x: q.dx * dir, z: q.dz * dir };
    car.pos.set(q.x + D.z * 2.6, q.y, q.z - D.x * 2.6);
    car.heading = Math.atan2(-D.x, -D.z); car.speed = speed;
    car.group.position.copy(car.pos); car.group.rotation.y = car.heading;
  };
  if (name === 'drive') {
    if (hero) { putCarOnLane(hero, 'brB2', 0.15, 1, 14); enterCar(hero); state.camView = 0; }
    camera.position.set(40, 14, -70); camera.lookAt(58, 4, -10);
  } else if (name === 'chase') {
    if (hero) { putCarOnLane(hero, 'spE', 0.5, 1, 18); enterCar(hero); }
    reportCrime(3, { force: true }); spawnPolice(); spawnPolice();
    const p = police[0]; if (p) { p.pos.set(state.car.pos.x + 14, floorY(state.car.pos.x + 14, state.car.pos.z + 8), state.car.pos.z + 8); p.heading = state.car.heading; }
    // high steep angle: spE is flanked by towers, a low camera ends up inside one
    camera.position.set(state.car.pos.x + 16, 32, state.car.pos.z + 24); camera.lookAt(state.car.pos.x, 2, state.car.pos.z);
  } else if (name === 'combat') {
    putPlayer(20, -70, 0.9);
    const ped = peds.find(p => !p.chat && !p.down);
    if (ped) { ped.pos.set(26, floorY(26, -78) + 0.22, -78); ped.group.position.copy(ped.pos); ped.chat = false; }
    state.aiming = true; state.weapon = 1;
    camera.position.set(14, 4.5, -60); camera.lookAt(26, 1.4, -78);
  } else if (name === 'traffic') {
    putPlayer(40, -20, 0.5);
    const t = traffic[1]; if (t) putCarOnLane(t, 'brB2', 0.5, 1, 8);
    camera.position.set(28, 16, -64); camera.lookAt(58, 4, 0);
  } else if (name === 'hill') {
    if (hero) { putCarOnLane(hero, 'klClimb', 0.55, 1, 10); enterCar(hero); }
    camera.position.set(-88, 26, -30); camera.lookAt(-122, 12, -52);
  } else if (name === 'terminal') {
    putPlayer(-48, 48, 2.2);
    const t = traffic[0]; if (t) { assignLane(t, 'cds1', 1, 4, 0.92); t.traffic.s = t.traffic.lane.len * 0.92; }
    camera.position.set(-30, 14, 66); camera.lookAt(-52, 1, 42);
  } else if (name === 'peds') {
    putPlayer(46, -46, 2.6);
    camera.position.set(40, 3.5, -40); camera.lookAt(52, 1.5, -52);
  } else if (name === 'heli') {
    putPlayer(60, -60, 0.6);
    reportCrime(4, { force: true }); spawnPolice(); spawnPolice();
    camera.position.set(30, 20, -30); camera.lookAt(60, 2, -60);
  } else if (name === 'swim') {
    state.pos.set(30, 0, 6); state.pos.y = -0.45; state.heading = 1.2; camYaw = 1.2;
    player.position.copy(state.pos);
    camera.position.set(12, 6, 26); camera.lookAt(30, 0, 6);
  } else if (name === 'busted') {
    putPlayer(28, -140, 0.6);
    reportCrime(2, { force: true }); spawnPolice();
    const p = police[0]; if (p) { p.pos.set(30, floorY(30, -144), -144); p.heading = 0.6; p.group.position.copy(p.pos); }
    state.busted = 0.65;
    camera.position.set(18, 5, -128); camera.lookAt(28, 1.5, -142);
  } else if (name === 'aerial') {
    scene.fog.far = 1400; for (const sp of cloudSprites) sp.visible = false;
  }
}
const AUTOTEST = params.get('autotest');
const SYSTEM_SHOTS = ['drive', 'chase', 'combat', 'traffic', 'hill', 'terminal', 'peds', 'heli', 'swim', 'busted'];
if (SHOT && (SHOTS[SHOT] || SYSTEM_SHOTS.includes(SHOT))) {
  titleEl.hidden = true; state.mode = 'foot'; state.prevMode = 'foot';
  const s = SHOTS[SHOT];
  if (s) {
    state.pos.set(s.p[0], 0, s.p[1]); state.pos.y = floorY(s.p[0], s.p[1]);
    player.position.copy(state.pos);
    camera.position.set(...s.cam); camera.lookAt(...s.look);
  }
  if (SYSTEM_SHOTS.includes(SHOT)) stageShot(SHOT);
  else if (SHOT === 'aerial') stageShot('aerial');
}
if (AUTOTEST) { titleEl.hidden = true; state.mode = 'foot'; state.prevMode = 'foot'; }

// ---------- main loop + STRICT perf accounting + autotest ----------
// STRICT: renderer.info accumulates across ALL passes of one frame
// (shadow + main + bloom); reset once per frame, read after all passes.
const perfMax = { title: { calls: 0, tris: 0 }, game: { calls: 0, tris: 0 } };
window.__perfMax = perfMax;
let last = performance.now(), frames = 0, mmTick = 0, hudTick = 0;
// ---------- R-B autotest (?autotest=rb): scripted core-loop smoke ----------
const rbTest = { phase: 0, t0: 0, startPos: null, enterPos: null, results: {}, done: false };
function rbCheck(name, ok, evidence) { rbTest.results[name] = { ok: !!ok, evidence: String(evidence) }; }
function stepAutotest() {
  const T = rbTest, S = state;
  if (T.phase === 0) { // walk forward
    keys.KeyW = true; if (!T.startPos) T.startPos = S.pos.clone();
    if (S.time > 1.2) {
      keys.KeyW = false;
      const moved = Math.hypot(S.pos.x - T.startPos.x, S.pos.z - T.startPos.z);
      rbCheck('walk', moved > 2, `moved ${moved.toFixed(1)}m`);
      const hero = window.__heroCar;
      S.pos.set(hero.pos.x + 2, 0, hero.pos.z); S.pos.y = floorY(S.pos.x, S.pos.z);
      enterCar(hero); T.enterPos = hero.pos.clone(); T.phase = 1; T.t0 = S.time;
    }
  } else if (T.phase === 1) {
    rbCheck('enterCar', S.mode === 'car', `mode=${S.mode}`);
    keys.KeyW = true;
    if (S.time - T.t0 > 2.5) {
      keys.KeyW = false;
      const moved = Math.hypot(S.car.pos.x - T.enterPos.x, S.car.pos.z - T.enterPos.z);
      rbCheck('drive', moved > 12 && Math.abs(S.car.speed) > 2, `moved ${moved.toFixed(1)}m speed ${Math.abs(S.car.speed).toFixed(1)}`);
      exitCar();
      rbCheck('exitCar', S.mode === 'foot', `mode=${S.mode}`);
      T.phase = 2; T.t0 = S.time;
    }
  } else if (T.phase === 2) { // witnessed crime -> wanted + police
    reportCrime(1, { force: true }); spawnPolice();
    rbCheck('wantedRaise', starsNow() >= 1, `stars=${starsNow()}`);
    rbCheck('policeSpawn', police.length >= 1, `police=${police.length}`);
    const ped = peds.find(p => !p.down && !p.chat);
    if (ped) { ped.pos.set(S.pos.x + 4, floorY(S.pos.x + 4, S.pos.z + 2) + 0.22, S.pos.z + 2); ped.group.position.copy(ped.pos); ped.chat = true; ped.partner = null; T.ped = ped; }
    camYaw = Math.atan2(4, 2); S.aiming = true; S.weapon = 1;
    T.phase = 3; T.t0 = S.time;
  } else if (T.phase === 3) { // shoot the placed ped (camera settles first)
    if (S.time - T.t0 > 0.8) {
      const ammoBefore = S.mag[1];
      playerShoot();
      rbCheck('combatShoot', (S.mag[1] || 0) === ammoBefore - 1, `ammo ${ammoBefore}->${S.mag[1]}`);
      rbCheck('pedDown', !!T.ped && T.ped.down, `ped.down=${T.ped ? T.ped.down : 'none'}`);
      S.aiming = false;
      clearPolice(); // isolate the decay rule: no police in sight at all
      S.lastSeen = S.time - 20; // unseen for 20 s -> decay should run
      T.phase = 4; T.t0 = S.time; T.w0 = S.wantedF;
    }
  } else if (T.phase === 4) { // wanted decay while unseen
    if (S.time - T.t0 > 2) {
      rbCheck('wantedDecay', S.wantedF < T.w0, `wantedF ${T.w0.toFixed(2)} -> ${S.wantedF.toFixed(2)}`);
      T.phase = 5; T.t0 = S.time;
    }
  } else if (T.phase === 5) { // wasted -> respawn
    damagePlayer(500, S.pos);
    rbCheck('wasted', S.mode === 'wasted', `mode=${S.mode}`);
    doRespawn();
    rbCheck('respawnHospital', S.mode === 'foot' && S.health === 100, `mode=${S.mode} hp=${S.health}`);
    T.phase = 6; T.t0 = S.time;
  } else if (T.phase === 6) { // busted -> respawn
    triggerEnd('busted');
    rbCheck('busted', S.mode === 'busted', `mode=${S.mode}`);
    doRespawn();
    rbCheck('respawnStation', S.mode === 'foot' && S.wantedF === 0, `mode=${S.mode} wanted=${S.wantedF}`);
    togglePause();
    rbCheck('pause', S.mode === 'pause', `mode=${S.mode}`);
    togglePause();
    rbCheck('resume', S.mode === 'foot', `mode=${S.mode}`);
    T.phase = 7;
  } else if (T.phase === 7) {
    const all = Object.values(T.results).every(r => r.ok);
    window.__autotest = JSON.stringify({ rb: all, ...Object.fromEntries(Object.entries(T.results).map(([k, v]) => [k, v.ok + ':' + v.evidence])) });
    window.__shotReady = true; T.done = true;
  }
}
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now(), rawDt = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = rawDt * (state.timeScale || 1);
  state.time += dt; frames++;
  for (const sp of cloudSprites) { sp.position.x += sp.userData.speed * dt; if (sp.position.x > 760) sp.position.x = -760; }
  for (const m of waterMats) if (m.map) { m.map.offset.x = (state.time * 0.008) % 1; m.map.offset.y = (state.time * 0.005) % 1; }
  if (window.__lighthouse) window.__lighthouse.rotation.y = state.time * 0.35;
  if (window.__orb) window.__orb.material.emissiveIntensity = 2.3 + Math.sin(state.time * 2.2) * 0.5;
  // R-C autotest runs BEFORE the world step so its injected edge actions
  // (actSpace etc.) are consumed by this frame's step functions, exactly
  // like a real key event landing between frames
  if (AUTOTEST === 'rc' && window.__rcReady && typeof stepRCTest === 'function' && !window.__rcTestDone) stepRCTest(dt);
  // in ?shot= staging the camera is composed by stageShot — the follow cam
  // must not override it (traffic/peds/police below still step, so the scene lives)
  if (!SHOT) {
    if (state.mode === 'foot') stepFoot(dt);
    else if (state.mode === 'car') stepCar(dt);
  }
  if (state.mode === 'foot' || state.mode === 'car' || state.mode === 'boat') {
    if (mouseDown && state.mode === 'foot' && WEAPONS[state.weapon] && WEAPONS[state.weapon].auto) playerShoot();
    stepTraffic(dt); stepPeds(dt); stepPolice(dt); stepLaw(dt);
    stepFx(dt); stepBlood(dt); stepSmoke(dt); stepPickups(dt);
    if (hud.hurt && state.time - state.lastHurt > 0.6) hud.hurt.style.opacity = '0';
  }
  if (window.__rcReady && typeof stepRC === 'function' && (state.mode === 'foot' || state.mode === 'car' || state.mode === 'boat' || state.mode === 'interior')) stepRC(dt);
  if (AUTOTEST === 'rb' && !rbTest.done) stepAutotest();
  if (AUTOTEST && AUTOTEST !== 'rb' && AUTOTEST !== 'rc' && frames === 60) { // legacy stage-A smoke
    const moved = 0;
    window.__autotest = JSON.stringify({ moved, f1ok: worldStats.f1Share <= 0.45 });
    window.__shotReady = true;
  }
  if (state.mode === 'title' && !SHOT) {
    const a = state.time * 0.05;
    camera.position.set(STAR[0] + Math.cos(a) * 74, 30 + Math.sin(state.time * 0.13) * 5, STAR[1] + Math.sin(a) * 74);
    camera.lookAt(STAR[0], 10, STAR[1]);
  }
  if (++mmTick % 5 === 0) drawMinimap(state.pos.x, state.pos.z, state.mode === 'car' && state.car ? state.car.heading : state.heading);
  if (++hudTick % 6 === 0) refreshHUD();
  // consume edge-triggered actions once per frame
  actE = actV = actSpace = actShoot = actReload = actHorn = actLight = actCrouch = actWheel = false;
  renderer.info.reset();
  if (composer) composer.render(); else renderer.render(scene, camera);
  const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
  window.__strictPerf = { calls, tris };
  const pk = state.mode === 'title' ? 'title' : 'game';
  if (calls > perfMax[pk].calls) { perfMax[pk].calls = calls; perfMax[pk].tris = tris; }
  if (SHOT && frames > 40 && !window.__shotReady) window.__shotReady = true;
  if (!SHOT && !AUTOTEST && frames > 10) window.__shotReady = true;
}
drawMinimap(state.pos.x, state.pos.z, state.heading);
refreshHUD();
animate();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});
window.__rbTest = rbTest;
window.__game = {
  state, worldStats, cars, traffic, police, peds, pickups, LANES, PED_PATHS,
  reportCrime, playerShoot, spawnPolice, clearPolice, enterCar, exitCar, damagePlayer, triggerEnd, doRespawn,
  startGame, togglePause, selectWeapon, aimAt, WEAPONS, lanePoint, nearestOnLanes, groundH, floorY,
  get heli() { return heli; }, get roadblock() { return roadblock; },
  get actors() { return { cars: cars.length, traffic: traffic.length, police: police.length, peds: peds.length, pickups: pickups.filter(p => !p.taken).length }; },
};


// ======================================================================
// R-C CONTENT — interiors, boats + functional drawbridge, NPC interaction,
// mission chain, economy/progression, save, synth audio + radio, phone
// map + photo mode. Appended after R-B; everything hooks the R-B systems
// (generic vehicle controller data, witness wanted, graph lanes) rather
// than replacing them. Mirror: the vendored three has NO Reflector addon
// and no external assets are allowed, so the safehouse mirror is the
// brief-sanctioned fallback — a high-gloss env-map plane + a live mirrored
// Raka clone (BUILD-BRIEF: "swap to env-map fake and note it").
// ======================================================================
const rc = {
  mode: null, interior: null, returnPos: null, returnHeading: 0,
  boat: null, boats: {}, bridge: { open01: 0, target: 0, phase: 'closed', t: 14, forced: null },
  chain: { active: false, idx: -1, step: -1, done: [], approach: null, waitT: 0, chaseHold: 0, sailArmed: false },
  stats: { dist: 0, shots: 0, downs: 0, talked: 0, missions: 0, cashEarned: 0, maxStars: 0, interiors: 0, boatTrips: 0 },
  garage: null, safe2: false, photo: false, phoneOpen: false, route: null,
  radio: 0, counters: { policeShots: 0 }, lastPos: null, fadeBusy: false,
  flags: {}, shopOpen: false, started: false,
};
window.__rcState = rc;
// ---------- tiny DOM helpers ----------
const rcEl = id => document.getElementById(id);
const fadeEl = rcEl('fade');
function rcFade(mid) { // fade out, run mid(), fade back
  if (!fadeEl) { mid(); return; }
  rc.fadeBusy = true; fadeEl.style.opacity = '1';
  setTimeout(() => { try { mid(); } finally { fadeEl.style.opacity = '0'; setTimeout(() => rc.fadeBusy = false, 340); } }, 330);
}
function rcPrompt(html) { const p = rcEl('prompt'); if (p) { if (html) { p.hidden = false; p.innerHTML = html; } else p.hidden = true; } }
function rcToastRadio() {
  const t = rcEl('radio-toast'); if (!t) return;
  const names = ['Off', 'Radio Pantai FM', 'Neon FM', 'Dermaga FM'];
  const subs = ['', 'senja chill • synth pluck', 'synthwave • night drive', 'koplo dermaga • harbor groove'];
  if (rc.radio > 0) { rcEl('radio-name').textContent = '📻 ' + names[rc.radio]; rcEl('radio-sub').textContent = subs[rc.radio]; t.hidden = false; clearTimeout(rcToastRadio._t); rcToastRadio._t = setTimeout(() => t.hidden = true, 2600); }
  else t.hidden = true;
}
// ---------- counters wrapped around R-B combat FX ----------
const _spawnTracer0 = spawnTracer;
spawnTracer = function (from, to, color = 0xffe28a, persist = false) { if (color === 0xff9d7a) rc.counters.policeShots++; return _spawnTracer0(from, to, color, persist); };
const _playerShoot0 = playerShoot;
playerShoot = function (persist = false) { const r = _playerShoot0(persist); if (r) rc.stats.shots++; return r; };
const _knockPed0 = knockPed;
knockPed = function (ped, byPlayer) { const was = ped.down; _knockPed0(ped, byPlayer); if (!was && ped.down) rc.stats.downs++; };

// ======================================================================
// DRAWBRIDGE B4a (canal, z=84) — ONE functional leaf. The static ribbon
// for edge brB4a is hidden; a pivoting leaf + barriers + warning lamps
// replace it. Schedule: closed 26 s -> opening -> open 11 s -> closing,
// plus boat proximity / mission force-open. Traffic waits (stepTraffic
// wrap below); the player car/foot are pushed back at the gap.
// ======================================================================
const BRIDGE_C = { x: 140, z: 84 };
const bridgeLeaf = new THREE.Group();
let bridgeLampMat = null, bridgeBarriers = [];
{
  const e = EDGES.find(q => q.id === 'brB4a');
  const deckY = e && e.pts3.length ? e.pts3[Math.floor(e.pts3.length / 2)][1] : 2.2;
  if (e && e.mesh) e.mesh.visible = false;
  bridgeLeaf.position.set(BRIDGE_C.x + 6, deckY + 0.12, BRIDGE_C.z);
  const leafGeo = new THREE.BoxGeometry(12.4, 0.35, 11); leafGeo.translate(-6.2, 0, 0);
  const leaf = new THREE.Mesh(leafGeo, deckMat); leaf.castShadow = true; leaf.receiveShadow = true; bridgeLeaf.add(leaf);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 6), steelMat); counter.position.set(0.6, -0.6, 0); bridgeLeaf.add(counter);
  scene.add(bridgeLeaf);
  bridgeLampMat = new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0xff3333, emissiveIntensity: 0.4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), bridgeLampMat);
    lamp.position.set(BRIDGE_C.x + sx * 7.6, deckY + 2.6, BRIDGE_C.z + sz * 5.6); scene.add(lamp);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), steelMat);
    post.position.set(BRIDGE_C.x + sx * 7.6, deckY + 1.3, BRIDGE_C.z + sz * 5.6); scene.add(post);
  }
  for (const sx of [-1, 1]) { // barrier arms: horizontal = closed to traffic when bridge open
    const pivot = new THREE.Group(); pivot.position.set(BRIDGE_C.x + sx * 7.8, deckY + 1.1, BRIDGE_C.z - 5.4);
    const armGeo = new THREE.BoxGeometry(0.16, 0.16, 10.4); armGeo.translate(0, 0, 5.2);
    const arm = new THREE.Mesh(armGeo, new THREE.MeshStandardMaterial({ color: 0xffcf3d, roughness: 0.5 }));
    pivot.add(arm); pivot.rotation.x = Math.PI / 2; scene.add(pivot); bridgeBarriers.push(pivot);
  }
  rc.bridge.deckY = deckY;
}
function bridgeSet(open, forced = false) { rc.bridge.forced = forced ? !!open : null; rc.bridge.target = open ? 1 : 0; }
function stepBridge(dt) {
  const B = rc.bridge;
  const boatNear = rc.boat && Math.abs(rc.boat.pos.x - BRIDGE_C.x) < 10 && Math.abs(rc.boat.pos.z - BRIDGE_C.z) < 46;
  const step = rc.chain.active ? missionStep() : null;
  const missionWant = step && step.type === 'sailthru';
  if (B.forced !== null) B.target = B.forced ? 1 : 0;
  else if (boatNear || missionWant) B.target = 1;
  else { // schedule
    B.t -= dt;
    if (B.phase === 'closed' && B.t <= 0) { B.phase = 'open'; B.target = 1; B.t = 11; }
    else if (B.phase === 'open' && B.t <= 0) { B.phase = 'closed'; B.target = 0; B.t = 26; }
  }
  const rate = dt / 3.2;
  B.open01 = THREE.MathUtils.clamp(B.open01 + THREE.MathUtils.clamp(B.target - B.open01, -rate, rate), 0, 1);
  bridgeLeaf.rotation.z = -1.12 * B.open01;
  const armA = (1 - B.open01) * Math.PI / 2; // arms drop across the road as the leaf lifts
  for (const p of bridgeBarriers) p.rotation.x = armA;
  if (bridgeLampMat) bridgeLampMat.emissiveIntensity = (B.open01 > 0.03 && B.open01 < 0.97) || B.target === 1 && B.open01 > 0.03 ? (Math.sin(state.time * 7) > 0 ? 3.4 : 0.3) : 0.4;
  // player car / foot must not cross the open gap
  if (B.open01 > 0.3) {
    const pp = state.mode === 'car' && state.car ? state.car.pos : state.pos;
    if ((state.mode === 'car' || state.mode === 'foot') && Math.abs(pp.x - BRIDGE_C.x) < 7.4 && Math.abs(pp.z - BRIDGE_C.z) < 6.2) {
      pp.x = BRIDGE_C.x + (pp.x < BRIDGE_C.x ? -7.6 : 7.6);
      if (state.mode === 'car' && state.car) state.car.speed = 0;
    }
  }
}
// traffic waits at the open drawbridge: freeze cars approaching on the
// harbour cross streets / the bridge lane itself (not cars ON the span)
const _stepTraffic0 = stepTraffic;
stepTraffic = function (dt) {
  if (rc.bridge.open01 <= 0.3) { _stepTraffic0(dt); return; }
  const held = [];
  for (const car of traffic) {
    const t = car.traffic; if (!t) continue;
    const onSpan = Math.abs(car.pos.x - BRIDGE_C.x) < 7 && Math.abs(car.pos.z - BRIDGE_C.z) < 6;
    const nearBridge = Math.hypot(car.pos.x - BRIDGE_C.x, car.pos.z - BRIDGE_C.z) < 30;
    if (!onSpan && nearBridge && ['hb84w', 'hb84e', 'brB4a'].includes(t.lane.id)) held.push([car, car.pos.x, car.pos.z, t.s, t.speed]);
  }
  _stepTraffic0(dt);
  for (const [car, x, z, s, sp] of held) { car.pos.x = x; car.pos.z = z; car.traffic.s = s; car.traffic.speed = 0; car.speed = 0; car.brakeMat.emissiveIntensity = 3; }
  rc.bridge.heldCount = held.length;
};

// ======================================================================
// BOATS — the SAME generic-vehicle idea on water params (roster index
// 10, Ombak Lumba): throttle/steer, drag, buoyancy bob, wake ripples.
// ======================================================================
const ripplePool = [];
{
  const geo = new THREE.RingGeometry(0.85, 1, 20);
  const mat = new THREE.MeshBasicMaterial({ color: 0xdff7f2, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(geo, mat.clone()); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); ripplePool.push({ mesh: m, life: 0 }); }
}
let rippleIdx = 0;
function spawnRipple(x, z, big = 1) {
  const p = ripplePool[rippleIdx++ % ripplePool.length];
  p.mesh.position.set(x, WATER_Y + 0.06, z); p.mesh.visible = true; p.life = 1; p.big = big;
}
function stepRipples(dt) {
  for (const p of ripplePool) { if (p.life <= 0) continue; p.life -= dt * 0.55; if (p.life <= 0) { p.mesh.visible = false; continue; } const s = (1 - p.life) * 5.5 * (p.big || 1) + 0.6; p.mesh.scale.set(s, s, 1); p.mesh.material.opacity = p.life * 0.5; }
}
function makeBoat(x, z, heading, color = 0x39d0c4) {
  const g = new THREE.Group();
  const hullMat = paintMat(color);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.85, 5.6), hullMat); hull.position.y = 0.25; hull.castShadow = true; g.add(hull);
  const bowGeo = new THREE.ConeGeometry(1.16, 1.7, 4); const bow = new THREE.Mesh(bowGeo, hullMat);
  bow.rotation.set(Math.PI / 2, Math.PI / 4, 0); bow.position.set(0, 0.25, -3.55); bow.scale.y = 1; g.add(bow);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 1.7), _carMat.glass); cabin.position.set(0, 1.05, 0.5); g.add(cabin);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.4), _carMat.wheel); motor.position.set(0, 0.55, 2.95); g.add(motor);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 2.4 }));
  light.position.set(0, 1.75, 0.5); g.add(light);
  scene.add(g);
  const boat = { group: g, pos: g.position, heading, speed: 0, params: VEHICLE_ROSTER[10], modelName: 'Ombak Lumba', wakeT: 0, phase: Math.random() * 6 };
  boat.pos.set(x, WATER_Y + 0.32, z); g.position.copy(boat.pos); g.rotation.y = heading;
  return boat;
}
rc.boats.sea = makeBoat(238, 96, Math.PI, 0x39d0c4);
rc.boats.canal = makeBoat(CANAL_X, 148, 0, 0xff7a3c);
function nearestBoat(maxD = 5.5) {
  let best = null, bd = maxD * maxD;
  for (const b of Object.values(rc.boats)) { const d2 = (b.pos.x - state.pos.x) ** 2 + (b.pos.z - state.pos.z) ** 2; if (d2 < bd) { bd = d2; best = b; } }
  return best;
}
function enterBoat(boat) {
  if (!boat || state.mode !== 'foot') return;
  rc.boat = boat; state.mode = 'boat'; state.prevMode = 'boat'; player.visible = false; rc.stats.boatTrips++;
  showDialog(boat === rc.boats.canal ? 'Perahu kanal Ombak Lumba. Lewati kanal ke utara — drawbridge B4 akan membuka untukmu.' : 'Perahu Ombak Lumba. Air terbuka: sungai, kanal, dan Pulau Senja.');
}
function exitBoat() {
  const boat = rc.boat; if (!boat) return;
  // step out onto a bank if one is within reach, else swim
  let placed = false;
  for (const [ox, oz] of [[3.4, 0], [-3.4, 0], [0, 3.4], [0, -3.4], [5, 5], [-5, 5], [5, -5], [-5, -5]]) {
    const x = boat.pos.x + ox, z = boat.pos.z + oz;
    if (groundH(x, z) > 0.25) { state.pos.set(x, floorY(x, z), z); placed = true; break; }
  }
  if (!placed) state.pos.set(boat.pos.x + 2.5, -0.45, boat.pos.z);
  player.visible = true; player.position.copy(state.pos);
  boat.speed = 0; rc.boat = null; state.mode = 'foot'; state.prevMode = 'foot';
}
function stepBoat(dt) {
  const boat = rc.boat; if (!boat) return;
  if (actV) state.camView = (state.camView + 1) % 4;
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  const p = boat.params;
  if (fwd > 0) boat.speed += p.accel * dt; else if (fwd < 0) boat.speed -= 7 * dt; else boat.speed -= Math.sign(boat.speed) * Math.min(Math.abs(boat.speed), 2.2 * dt);
  boat.speed = THREE.MathUtils.clamp(boat.speed, -5, p.top);
  boat.heading += steer * p.steer * dt * Math.min(1, Math.abs(boat.speed) / 5) * (boat.speed < 0 ? -1 : 1);
  const nx = boat.pos.x + -Math.sin(boat.heading) * boat.speed * dt;
  const nz = boat.pos.z + -Math.cos(boat.heading) * boat.speed * dt;
  if (groundH(nx, nz) < -0.35) { boat.pos.x = nx; boat.pos.z = nz; }
  else { boat.speed *= 0.25; state.shake = Math.max(state.shake, 0.12); } // bumped the bank
  boat.pos.x = THREE.MathUtils.clamp(boat.pos.x, -290, 295); boat.pos.z = THREE.MathUtils.clamp(boat.pos.z, -215, 245);
  boat.pos.y = WATER_Y + 0.32 + Math.sin(state.time * 2.1 + boat.phase) * 0.07;
  boat.group.position.copy(boat.pos);
  boat.group.rotation.set(Math.sin(state.time * 1.7 + boat.phase) * 0.02 - boat.speed * 0.006, boat.heading, steer * Math.min(1, Math.abs(boat.speed) / 9) * 0.09, 'YXZ');
  state.speed = Math.abs(boat.speed);
  boat.wakeT -= dt;
  if (Math.abs(boat.speed) > 1.6 && boat.wakeT <= 0) { boat.wakeT = 0.16; spawnRipple(boat.pos.x + Math.sin(boat.heading) * 2.8, boat.pos.z + Math.cos(boat.heading) * 2.8, 0.8 + Math.abs(boat.speed) / 16); }
  // chase camera (same family as the car cam)
  const fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading);
  if (state.camView === 2) { camera.position.lerp(new THREE.Vector3(boat.pos.x + fx * 1.2, boat.pos.y + 1.5, boat.pos.z + fz * 1.2), 1 - Math.pow(0.00001, dt)); camera.lookAt(boat.pos.x + fx * 16, boat.pos.y + 0.8, boat.pos.z + fz * 16); }
  else { const dist = state.camView === 1 ? 8 : 12; camera.position.lerp(new THREE.Vector3(boat.pos.x - fx * dist, boat.pos.y + 4.6, boat.pos.z - fz * dist), 1 - Math.pow(0.001, dt)); camera.lookAt(boat.pos.x + fx * 5, boat.pos.y + 0.8, boat.pos.z + fz * 5); }
  camera.fov += ((62 + Math.min(10, Math.abs(boat.speed) * 0.5)) - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  if (actE && Math.abs(boat.speed) < 1.2) exitBoat();
}

// ======================================================================
// INTERIORS — 5 curated rooms in a separate zone (600,-40,600), fade
// transitions, per-room props + NPCs. Exit returns to the exact door.
// ======================================================================
const INT_Y = -40, INT_Z = 600;
const ROOMS = [
  { id: 'safehouse', name: 'RUMAH RAKA — SAFEHOUSE', wall: 0x4a3a52, floor: 0x6b4a3a },
  { id: 'warung', name: 'WARUNG SARI', wall: 0x6e4a26, floor: 0x8a6a44 },
  { id: 'shop', name: 'TOKO SENJATA BANG RUDI', wall: 0x37414d, floor: 0x596270 },
  { id: 'police', name: 'KANTOR POLISI PORT SENJA — LOBI', wall: 0x2c4472, floor: 0x707a88 },
  { id: 'hospital', name: 'KLINIK SEHAT SENJA — LOBI', wall: 0xd8d4cc, floor: 0xaebbb2 },
];
ROOMS.forEach((r, i) => { r.cx = 600 + (i - 2) * 18; r.cz = INT_Z; r.w = 15; r.d = 12; });
const intLight = new THREE.PointLight(0xffd9a0, 14, 26, 1.1); intLight.visible = false; scene.add(intLight);
const intNPCs = {}; let mirrorMesh = null, mirrorClone = null, bedPos = null;
function signTex(text, bg = '#1c1426', fg = '#ffb347') {
  return canvasTex(512, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); let fs = 44; g.textAlign = 'center'; g.fillStyle = fg;
    do { g.font = `bold ${fs}px sans-serif`; fs -= 2; } while (g.measureText(text).width > w - 24 && fs > 14);
    g.fillText(text, w / 2, 80); });
}
function buildRoom(r) {
  const g = new THREE.Group(); const y = INT_Y;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.3, r.d), new THREE.MeshStandardMaterial({ color: r.floor, roughness: 0.9 }));
  floor.position.set(r.cx, y - 0.15, r.cz); floor.receiveShadow = true; g.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: r.wall, roughness: 0.85 });
  const mkWall = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3.6, d), wallMat); m.position.set(x, y + 1.8, z); g.add(m); return m; };
  mkWall(r.cx, r.cz - r.d / 2, r.w, 0.3); mkWall(r.cx, r.cz + r.d / 2, r.w, 0.3);
  mkWall(r.cx - r.w / 2, r.cz, 0.3, r.d); mkWall(r.cx + r.w / 2, r.cz, 0.3, r.d);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.25, r.d), new THREE.MeshStandardMaterial({ color: 0x241c2c, roughness: 1 }));
  ceil.position.set(r.cx, y + 3.7, r.cz); g.add(ceil);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.1), new THREE.MeshBasicMaterial({ map: signTex(r.name) }));
  sign.position.set(r.cx, y + 2.9, r.cz - r.d / 2 + 0.18); g.add(sign);
  const exitMat = new THREE.MeshStandardMaterial({ color: 0x39d0c4, emissive: 0x39d0c4, emissiveIntensity: 1.4 });
  const exitPad = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.2), exitMat);
  exitPad.position.set(r.cx, y + 0.06, r.cz + r.d / 2 - 1.1); g.add(exitPad);
  const propMat = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 0.8 });
  const prop = (x, z, w, h, d, mat = propMat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(r.cx + x, y + h / 2, r.cz + z); m.castShadow = true; g.add(m); return m; };
  if (r.id === 'safehouse') {
    const bed = prop(-4.6, -3.4, 2.2, 0.7, 4.4, new THREE.MeshStandardMaterial({ color: 0xb3543f, roughness: 0.95 })); bedPos = new THREE.Vector3(r.cx - 4.6, y, r.cz - 3.4);
    prop(-4.6, -3.4, 2.3, 0.22, 4.5, new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.95 })).position.y = y + 0.82;
    // MIRROR (env-map fake + live clone, see header note): north wall by the bed
    mirrorMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.1), new THREE.MeshStandardMaterial({ color: 0xcfe0ea, roughness: 0.05, metalness: 1, envMapIntensity: 2.2 }));
    mirrorMesh.position.set(r.cx - 1.8, y + 1.7, r.cz - r.d / 2 + 0.17); g.add(mirrorMesh);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.95, 2.35, 0.08), new THREE.MeshStandardMaterial({ color: 0xf2b13d, roughness: 0.4, metalness: 0.6 }));
    frame.position.set(r.cx - 1.8, y + 1.7, r.cz - r.d / 2 + 0.12); g.add(frame);
    mirrorClone = makePedMesh(0xff7a3c, 0x2b3550, 0xc98d5f); mirrorClone.group.position.set(r.cx - 1.8, y, r.cz - r.d / 2 - 1.6);
    const tv = prop(4.8, -4.6, 2.6, 1.5, 0.18, new THREE.MeshStandardMaterial({ color: 0x101018, emissive: 0x2b6ea8, emissiveIntensity: 1.1 }));
    tv.position.y = y + 1.7;
    prop(4.6, 2.8, 2.4, 0.9, 1.1); // dresser / garage-side cabinet
  } else if (r.id === 'warung') {
    prop(0, -4.2, 7.5, 1.05, 1.1, new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.7 })); // counter
    for (const [tx, tz] of [[-3.6, 0.6], [0.4, 1.8], [3.8, 0.2], [-1.4, 3.6]]) { prop(tx, tz, 1.5, 0.75, 1.5); prop(tx - 0.95, tz, 0.45, 0.5, 0.45); prop(tx + 0.95, tz, 0.45, 0.5, 0.45); }
    const sari = makePedMesh(0x39b8ad, 0x4a3626, 0xe0aa72); sari.group.position.set(r.cx + 1.8, y, r.cz - 4.9); sari.group.rotation.y = 0; scene.add(sari.group); intNPCs.sariIn = { ...sari, pos: sari.group.position, name: 'Sari' };
  } else if (r.id === 'shop') {
    prop(0, -4.2, 8.5, 1.05, 1.1, new THREE.MeshStandardMaterial({ color: 0x37414d, roughness: 0.5, metalness: 0.4 }));
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x16161c, roughness: 0.35, metalness: 0.75 });
    for (let i = 0; i < 5; i++) { const gm = prop(-3.4 + i * 1.7, -5.55, 0.16, 0.3, 1.15, gunMat); gm.position.y = y + 2 + (i % 2) * 0.55; }
    for (const bx of [-4.5, 4.5]) prop(bx, 1.5, 1.1, 1.1, 1.1, new THREE.MeshStandardMaterial({ color: 0x707a4a, roughness: 0.8 }));
    const rudi = makePedMesh(0x22242c, 0x2b3550, 0x8a5a34); rudi.group.position.set(r.cx - 2.2, y, r.cz - 4.9); scene.add(rudi.group); intNPCs.rudi = { ...rudi, pos: rudi.group.position, name: 'Bang Rudi' };
  } else if (r.id === 'police') {
    prop(0, -4.2, 8, 1.05, 1.1, new THREE.MeshStandardMaterial({ color: 0x2c4472, roughness: 0.6 }));
    prop(-4.8, 2.5, 2.6, 0.12, 1.4, new THREE.MeshBasicMaterial({ map: signTex('POLISI — MELAYANI & MELINDUNGI', '#123a7a', '#ffffff') })).position.y = y + 2.4;
    for (const bx of [-3.4, 3.4]) prop(bx, 2.2, 1.6, 0.55, 0.6, new THREE.MeshStandardMaterial({ color: 0x707a88, roughness: 0.7 }));
    const cop = makePedMesh(0x3d5a99, 0x22242c, 0xc98d5f); cop.group.position.set(r.cx + 2.4, y, r.cz - 4.9); scene.add(cop.group); intNPCs.cop = { ...cop, pos: cop.group.position, name: 'Petugas' };
  } else if (r.id === 'hospital') {
    const bedMat = new THREE.MeshStandardMaterial({ color: 0xe8f0ee, roughness: 0.9 });
    for (const bx of [-4.4, 0, 4.4]) { prop(bx, -3.6, 2.1, 0.65, 4.2, bedMat); }
    prop(0, 3.4, 5.5, 1, 1, new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.7 }));
    const cross = prop(0, -5.8, 0.9, 0.9, 0.1, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff4444, emissiveIntensity: 0.7 })); cross.position.y = y + 2.6;
    const nurse = makePedMesh(0xf5f5f5, 0x707a88, 0xe0aa72); nurse.group.position.set(r.cx - 1.6, y, r.cz + 2.2); scene.add(nurse.group); intNPCs.nurse = { ...nurse, pos: nurse.group.position, name: 'Perawat' };
  }
  scene.add(g); r.group = g;
}
ROOMS.forEach(buildRoom);
// ---------- world doors ----------
const DOORS = [
  { id: 'safehouse', label: 'RUMAH RAKA', x: 18, z: -50, room: 0 },
  { id: 'warung', label: 'WARUNG SARI', x: 54, z: -50, room: 1 },
  { id: 'shop', label: 'TOKO SENJATA BANG RUDI', x: 88, z: -80, room: 2 },
  { id: 'police', label: 'KANTOR POLISI', x: 28, z: -146, room: 3 },
  { id: 'hospital', label: 'KLINIK SEHAT SENJA', x: 106, z: 88, room: 4 },
  { id: 'islandhouse', label: 'RUMAH PULAU SENJA — $600', x: 232, z: 158, room: 0, buyable: true },
];
for (const d of DOORS) {
  const g = new THREE.Group(); const y = floorY(d.x, d.z);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2c2135, roughness: 0.7 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.1, 0.28), postMat); p.position.set(s * 1.25, 1.55, 0); p.castShadow = true; g.add(p); }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.3, 0.34), postMat); lintel.position.y = 3.1; g.add(lintel);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.68), new THREE.MeshBasicMaterial({ map: signTex(d.label, '#1c1426', d.buyable ? '#7de8de' : '#ffb347'), side: THREE.DoubleSide }));
  sign.position.y = 2.62; g.add(sign);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 8, 24), new THREE.MeshBasicMaterial({ color: 0x39d0c4, transparent: true, opacity: 0.75 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; g.add(ring); d.ring = ring;
  g.position.set(d.x, y, d.z); scene.add(g); d.group = g;
}
function nearestDoor(maxD = 3.6) { let best = null, bd = maxD * maxD; for (const d of DOORS) { const d2 = (d.x - state.pos.x) ** 2 + (d.z - state.pos.z) ** 2; if (d2 < bd) { bd = d2; best = d; } } return best; }
function enterInterior(door) {
  if (rc.fadeBusy || state.mode !== 'foot') return;
  if (door.buyable && !rc.safe2) { showDialog('Rumah Pulau Senja dijual $600. Tekan F di pintu untuk membeli — garasi + tempat simpan di pulau.'); return; }
  rc.returnPos = state.pos.clone(); rc.returnHeading = state.heading;
  rcFade(() => {
    const r = ROOMS[door.room]; rc.interior = door.id; rc.room = r;
    state.mode = 'interior'; state.prevMode = 'interior';
    state.pos.set(r.cx, INT_Y, r.cz + r.d / 2 - 2.6); player.position.copy(state.pos); player.visible = true;
    camYaw = Math.PI; state.heading = Math.PI;
    intLight.position.set(r.cx, INT_Y + 3, r.cz); intLight.visible = true;
    const lbl = rcEl('int-label'); if (lbl) { lbl.textContent = '🏠 ' + r.name + ' — E di pintu keluar untuk kembali'; lbl.hidden = false; }
    rc.stats.interiors++;
    if (door.id === 'warung' && intNPCs.sariIn) showDialog('Sari: "Duduk, Raka. Makan dulu — F di konter kalau lapar. Kerjaan? Ngobrol denganku di luar juga bisa."');
    if (door.id === 'shop') showDialog('Rudi: "Lihat-lihat saja dulu. F di konter untuk beli — cash only."');
    refreshHUD();
  });
}
function exitInterior() {
  if (state.mode !== 'interior') return;
  rcFade(() => {
    state.mode = 'foot'; state.prevMode = 'foot';
    if (rc.returnPos) { state.pos.copy(rc.returnPos); state.pos.y = floorY(state.pos.x, state.pos.z); state.heading = rc.returnHeading; camYaw = rc.returnHeading; }
    player.position.copy(state.pos);
    intLight.visible = false; rc.interior = null; rc.room = null;
    const lbl = rcEl('int-label'); if (lbl) lbl.hidden = true;
    if (rc.shopOpen) toggleShop(false);
  });
}
function stepInterior(dt) {
  const r = rc.room; if (!r) return;
  const ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const moving = ix !== 0 || iz !== 0;
  if (moving) {
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw), len = Math.hypot(ix, iz);
    const dx = (iz * sin + ix * cos) / len, dz = (iz * cos - ix * sin) / len;
    state.pos.x = THREE.MathUtils.clamp(state.pos.x + dx * 4.4 * dt, r.cx - r.w / 2 + 0.8, r.cx + r.w / 2 - 0.8);
    state.pos.z = THREE.MathUtils.clamp(state.pos.z + dz * 4.4 * dt, r.cz - r.d / 2 + 0.8, r.cz + r.d / 2 - 0.8);
    state.heading = Math.atan2(dx, dz);
    playerMesh.walkT += dt * 9; const sw = Math.sin(playerMesh.walkT) * 0.5;
    playerMesh.legL.rotation.x = sw; playerMesh.legR.rotation.x = -sw;
  }
  state.pos.y = INT_Y;
  player.position.copy(state.pos); player.rotation.y = state.heading;
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const cx = THREE.MathUtils.clamp(state.pos.x - fx * 5.6, r.cx - r.w / 2 + 0.7, r.cx + r.w / 2 - 0.7);
  const cz = THREE.MathUtils.clamp(state.pos.z - fz * 5.6, r.cz - r.d / 2 + 0.7, r.cz + r.d / 2 - 0.7);
  camera.position.lerp(new THREE.Vector3(cx, INT_Y + 2.5, cz), 1 - Math.pow(0.0001, dt));
  camera.lookAt(state.pos.x, INT_Y + 1.35, state.pos.z);
  // mirror clone (safehouse): reflect Raka across the mirror plane
  if (mirrorClone) { const vis = r.id === 'safehouse'; mirrorClone.group.visible = vis; if (mirrorMesh) mirrorMesh.visible = vis;
    if (vis) { const mz = r.cz - r.d / 2 + 0.17; mirrorClone.group.position.set(state.pos.x, INT_Y, 2 * mz - state.pos.z); mirrorClone.group.rotation.y = -state.heading; } }
  // prompts + actions inside
  const atExit = Math.abs(state.pos.x - r.cx) < 1.7 && state.pos.z > r.cz + r.d / 2 - 2.1;
  let prompt = null, act = null;
  if (atExit) { prompt = 'Press <kbd>E</kbd> to exit'; if (actE) act = () => exitInterior(); }
  else if (r.id === 'safehouse' && bedPos && state.pos.distanceTo(bedPos) < 2.6) { prompt = 'Press <kbd>F</kbd> — bed: save game + rest (heal)'; if (rcActF) act = () => { saveGame(); state.health = 100; showDialog('Tersimpan. Raka tidur sebentar — Port Senja menunggu. (Save: posisi, cash, misi, senjata)'); rcActF = false; }; }
  else if (r.id === 'warung' && Math.abs(state.pos.z - (r.cz - 4.2)) < 2.4) { prompt = 'Press <kbd>F</kbd> — buy Sari\'s cooking: $15, heal 40'; if (rcActF) act = () => { buyFood(); rcActF = false; }; }
  else if (r.id === 'shop' && Math.abs(state.pos.z - (r.cz - 4.2)) < 2.4) { prompt = 'Press <kbd>F</kbd> — Bang Rudi\'s counter (shop)'; if (rcActF) act = () => { toggleShop(!rc.shopOpen); rcActF = false; }; }
  else if (r.id === 'hospital' && intNPCs.nurse && state.pos.distanceTo(intNPCs.nurse.pos) < 3) { prompt = 'Press <kbd>F</kbd> — ask the nurse (heal $10)'; if (rcActF) act = () => { if (state.cash >= 10) { state.cash -= 10; state.health = 100; showDialog('Perawat: "Sudah ditambal semua. Hati-hati di jalan, ya."'); } else showDialog('Perawat: "Maaf, biaya perawatan $10."'); rcActF = false; }; }
  else if (r.id === 'police' && intNPCs.cop && state.pos.distanceTo(intNPCs.cop.pos) < 3) { prompt = 'Press <kbd>F</kbd> — talk to the officer'; if (rcActF) act = () => { showDialog(starsNow() > 0 ? 'Petugas: "Kami sedang mencarimu, Raka. Menyerah saja." (wanted tetap)' : 'Petugas: "Lapor kehilangan? Isi formulir di meja. Dan jangan ngebut di Tanjakan."'); rcActF = false; }; }
  if (rc.shopOpen && r.id !== 'shop') toggleShop(false);
  rcPrompt(prompt);
  if (act) act();
}
// ---------- shop / food (also used by tests + buttons) ----------
function buyFood() {
  if (state.cash < 15) { showDialog('Sari: "Uangmu kurang, Raka. Satu porsi $15."'); return false; }
  state.cash -= 15; state.health = Math.min(100, state.health + 40); refreshHUD();
  showDialog('Sari: "Makan yang banyak. Nasi + ayam dermaga, resep ibu." (+40 HP, -$15)'); return true;
}
const SHOP_ITEMS = [
  { key: 'smg', label: 'SMG', price: 800, desc: 'auto, 90 peluru' },
  { key: 'shotgun', label: 'Shotgun', price: 1200, desc: 'spread, 24 peluru' },
  { key: 'rifle', label: 'Assault Rifle', price: 1800, desc: 'auto, 90 peluru' },
  { key: 'ammo', label: 'Ammo pack', price: 120, desc: '+60 untuk senjata aktif' },
  { key: 'armor', label: 'Rompi (heal penuh)', price: 200, desc: 'HP ke 100' },
];
function buyItem(key) {
  const it = SHOP_ITEMS.find(q => q.key === key); if (!it) return false;
  if (state.cash < it.price) { showDialog(`Rudi: "Kurang $${it.price - Math.round(state.cash)} lagi, bos."`); return false; }
  if (key === 'ammo' && state.weapon === 0) { showDialog('Rudi: "Pegang senjata dulu, baru beli peluru."'); return false; }
  if ((key === 'smg' || key === 'shotgun' || key === 'rifle') && owned[{ smg: 2, shotgun: 3, rifle: 4 }[key]]) { showDialog('Rudi: "Sudah punya. Beli pelurunya saja."'); return false; }
  state.cash -= it.price;
  if (key === 'smg' || key === 'shotgun' || key === 'rifle') { const wi = { smg: 2, shotgun: 3, rifle: 4 }[key]; owned[wi] = true; state.reserve[wi] = (state.reserve[wi] || 0) + (key === 'shotgun' ? 24 : 90); if (!state.mag[wi]) state.mag[wi] = WEAPONS[wi].mag; selectWeapon(wi); }
  else if (key === 'ammo') { const w = state.weapon; state.reserve[w] = state.reserve[w] === Infinity ? Infinity : (state.reserve[w] || 0) + 60; }
  else if (key === 'armor') state.health = 100;
  refreshHUD(); renderShop(); showDialog(`Rudi: "${it.label} — $${it.price}. Jangan bilang beli di sini."`); saveGame(true); return true;
}
function renderShop() {
  const box = rcEl('shop-items'); if (!box) return;
  box.innerHTML = SHOP_ITEMS.map(it => `<div class="shop-item"><span>${it.label}<br><span style="color:var(--muted);font-size:11px">${it.desc}</span></span><button class="pbtn" data-buy="${it.key}">$${it.price}</button></div>`).join('');
  box.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => buyItem(b.dataset.buy)));
}
function toggleShop(on) { rc.shopOpen = on; const s = rcEl('shop'); if (s) s.hidden = !on; if (on) renderShop(); }
rcEl('shop-close') && rcEl('shop-close').addEventListener('click', () => toggleShop(false));
// ======================================================================
// NPC INTERACTION (world) — F prompt + per-NPC callback. Sari stands at
// her warung door; the island contact waits by the resort; generic peds
// answer with contextual one-liners.
// ======================================================================
function makeStandingNPC(x, z, heading, shirt, pants, skin, name) {
  const m = makePedMesh(shirt, pants, skin);
  const pos = new THREE.Vector3(x, floorY(x, z) + 0.22, z);
  m.group.position.copy(pos); m.group.rotation.y = heading;
  return { ...m, pos: m.group.position, name, down: false, chat: true };
}
const sariNPC = makeStandingNPC(52, -46.5, 2.8, 0x39b8ad, 0x4a3626, 0xe0aa72, 'Sari');
const contactNPC = makeStandingNPC(246, 152, -2.2, 0xf2b13d, 0x22242c, 0x8a5a34, 'Bimo (kontak pulau)');
const thugNPC = spawnPed(); // a real ped (shootable/knockable) posted at the harbour
thugNPC.pos.set(176, floorY(176, 90) + 0.22, 90); thugNPC.group.position.copy(thugNPC.pos);
thugNPC.chat = true; thugNPC.partner = null; thugNPC.name = 'Preman Dermaga';
const PED_LINES = [
  'Halo, Raka! Hati-hati, polisi lagi rajin patroli.', 'Senja begini enaknya kopi di Warung Sari.',
  'Kamu dengar? Sindikat Dermaga lagi cari gara-gara di pelabuhan.', 'Mobilmu keren. Pinjam dong — bercanda!',
  'Tanjakan Cakrawala itu uji nyali, bukan uji rem.', 'Ikan hari ini segar-segar di dermaga.',
];
function nearestInteractPed(maxD = 3) {
  let best = null, bd = maxD * maxD;
  for (const p of [sariNPC, contactNPC, ...(thugNPC.group.visible ? [thugNPC] : []), ...peds]) {
    if (p.down) continue; const d2 = p.pos.distanceTo(state.pos) ** 2; if (d2 < bd) { bd = d2; best = p; }
  }
  return best;
}
function interactWith(ped) {
  rc.stats.talked++;
  state.heading = Math.atan2(ped.pos.x - state.pos.x, ped.pos.z - state.pos.z);
  const step = rc.chain.active ? missionStep() : null;
  if (ped === sariNPC) {
    if (step && step.type === 'interact' && step.target === 'sari') { advanceStep('Sari menerima laporanmu.'); return; }
    if (rc.flags.sariOffer && !rc.chain.active) { rc.flags.sariOffer = false; startChain(); return; }
    if (!rc.chain.active && rc.chain.done.length === 0) { showDialog('Sari: "Raka! Ada rantai kerjaan malam ini — Sindikat Dermaga makin berani. Mulai dari menu judul ★ Story, atau bicara lagi denganku dan tekan F saat kutawari." — Tekan F lagi untuk MULAI.'); rc.flags.sariOffer = true; return; }
    if (rc.chain.active) { showDialog(`Sari (petunjuk): "${step ? step.hint || step.label : 'Selesaikan rantai ini.'}"`); return; }
    showDialog('Sari: "Semua kerjaan selesai. Port Senja lebih tenang malam ini — berkat kamu."'); return;
  }
  if (ped === contactNPC) {
    if (step && step.type === 'interact' && step.target === 'contact') { advanceStep('Bimo menyerahkan kunci gudang + peta kanal.'); return; }
    showDialog('Bimo: "Pulau ini tenang karena semua orang tahu jam mainnya. Kamu tamu Sari, jadi aman."'); return;
  }
  if (ped === thugNPC) { showDialog('Preman Dermaga: "Pergi sana. Dermaga ini punya kami sekarang."'); return; }
  if (starsNow() >= 2) showDialog(`Warga: "Itu dia yang dicari polisi! Aku tidak lihat apa-apa, sungguh!"`);
  else if (state.weapon > 0) showDialog('Warga: "Woi, simpan dulu senjatanya. Ini lingkungan baik-baik."');
  else showDialog('Warga: "' + PED_LINES[Math.floor(Math.random() * PED_LINES.length)] + '"');
}

// ======================================================================
// MISSIONS — data-driven framework (GoTo / Kill / Steal / Escort-style
// Chase / Escape / Interact / Wait / Hide / SailThru / Choice) + the
// Raka & Sari vs Sindikat Dermaga chain. Every mission USES the v2
// geography: river-crossing chase (B2), island run (B3), canal +
// drawbridge escape (B4a), harbour finale.
// ======================================================================
const MISSIONS = [
  { id: 'm1', name: 'Rantai Sari', reward: 200, steps: [
    { type: 'interact', target: 'sari', label: 'Bicara dengan Sari di Warung Sari', hint: 'Sari berdiri di depan warungnya, dekat titik spawn.' },
    { type: 'goto', x: 170, z: 100, r: 8, label: 'Ambil paket di Pelabuhan (dermaga)', say: 'Sari: "Paket di dermaga, dekat kontainer. Jangan lama-lama."' },
    { type: 'wait', x: 170, z: 100, r: 9, dur: 3, label: 'Tunggu paket dimuat…' },
    { type: 'goto', x: 52, z: -46, r: 7, label: 'Antar paket kembali ke Sari', say: 'Sari: "Bagus. Sindikat Dermaga mengincar rute ini — mereka akan bergerak malam ini."' },
  ] },
  { id: 'm2', name: 'Kejar-kejaran di Atas Sungai', reward: 300, steps: [
    { type: 'goto', x: 58, z: -30, r: 9, label: 'Ke ujung utara Jembatan B2 — kurir Sindikat akan lewat', say: 'Sari: "Kurir mereka menyeberang sungai lewat B2. Cegat dia!"' },
    { type: 'chase', label: 'KEJAR kurir Sindikat — tetap dekat (2.5 dtk) atau hentikan mobilnya', say: 'Itu dia! Jangan biarkan dia menyeberang!' },
    { type: 'escape', x: 28, z: -84, r: 12, label: 'Kabur ke Bundaran Bintang (downtown)', say: 'Sari: "Polisi ikut campur — putus pandangan mereka, ke bundaran!"' },
  ] },
  { id: 'm3', name: 'Utusan Pulau Senja', reward: 350, steps: [
    { type: 'goto', x: 185, z: 158, r: 9, label: 'Seberangi Jembatan B3 (cable-stayed) ke Pulau Senja', say: 'Sari: "Bimo menunggumu di pulau. Lewat B3 — jembatan kabel itu."' },
    { type: 'interact', target: 'contact', x: 246, z: 152, label: 'Temui Bimo, kontak di Pulau Senja', hint: 'Bimo berdiri dekat pintu Rumah Pulau, sisi barat pulau.' },
    { type: 'goto', x: 18, z: -50, r: 7, label: 'Kembali ke safehouse Raka', say: 'Bimo memberimu kunci gudang + peta kanal. Sari akan suka ini.' },
  ] },
  { id: 'm4', name: 'Kanal Tengah Malam', reward: 450, steps: [
    { type: 'choice', label: 'Pilih pendekatan: [8] STEALTH lewat kanal / [9] AGRESIF rebut truk', say: 'Sari: "Gudang mereka di utara kanal. Dua cara masuk — kamu yang pilih, Raka."' },
  ] },
  { id: 'm5', name: 'Lari dari Dermaga', reward: 600, steps: [
    { type: 'goto', x: 176, z: 88, r: 8, label: 'Ambil mobil pelarian di Pelabuhan', say: 'Sari: "Ambil buktinya di dermaga — lalu HILANG. Mereka + polisi akan datang semua!"' },
    { type: 'escape', x: 18, z: -50, r: 8, label: 'Kabur ke safehouse Raka', armWanted: 4 },
    { type: 'hide', x: 18, z: -50, r: 9, dur: 5, label: 'Bersembunyi di safehouse… (jangan keluar)', say: 'Sari: "Tahan napas. Lampu mati. Tunggu mereka lewat."' },
  ] },
];
function missionStep() { const c = rc.chain; if (!c.active || c.idx < 0) return null; const m = MISSIONS[c.idx]; return m && m.steps[c.step] || null; }
function missionDef() { const c = rc.chain; return c.idx >= 0 ? MISSIONS[c.idx] : null; }
const markerBeacon = (() => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.visible = false; scene.add(m); return m;
})();
function setObjective(txt) { const o = rcEl('objective'); if (o) o.textContent = txt; }
function startChain() {
  if (rc.chain.active) return;
  rc.chain.active = true; rc.chain.idx = 0; rc.chain.step = 0; rc.chain.done = rc.chain.done || [];
  showDialog('Sari: "Dengar, Raka. Sindikat Dermaga mau mengambil alih rute antar kota ini. Lima kerjaan. Selesaikan semua, mereka angkat kaki."');
  startStep();
}
function startStep() {
  const c = rc.chain, m = missionDef(), s = missionStep(); if (!m || !s) return;
  c.waitT = 0; c.chaseHold = 0;
  if (s.say) showDialog(s.say);
  if (s.type === 'chase') { // spawn the syndicate courier ON the B2 river crossing
    const car = makeCar(0xb03060, 7); car.modelName = 'Bayu Retro 76 — KURIR SINDIKAT';
    assignLane(car, 'brB2', 1, 13.5, 0.04); car.traffic.target = 13.5;
    traffic.push(car); cars.push(car); c.chaseTarget = car;
    reportCrime(2, { force: true });
  }
  if (s.type === 'kill') { const ped = peds.find(p => !p.chat && !p.down && p !== thugNPC) || thugNPC; ped.chat = true; ped.partner = null; ped.pos.set(s.x, floorY(s.x, s.z) + 0.22, s.z); ped.group.position.copy(ped.pos); c.killTarget = ped; }
  if (s.armWanted) reportCrime(s.armWanted, { force: true });
  if (s.type === 'choice') setObjective('★ PILIH: tekan 8 = STEALTH (perahu kanal) • 9 = AGRESIF (truk dermaga)');
  refreshObjective(); computeRoute();
}
function refreshObjective() {
  const c = rc.chain, m = missionDef(), s = missionStep();
  if (!c.active || !m || !s) { if (!c.active) setObjective('📍 Free roam — Port Senja v2 • bicara dengan Sari (F) untuk rantai misi'); return; }
  setObjective(`★ M${c.idx + 1}/${MISSIONS.length} ${m.name} — ${s.label} ($${m.reward})`);
}
function advanceStep(note) {
  const c = rc.chain, m = missionDef(); if (!m) return;
  if (note) showDialog(note);
  missionStinger(true);
  c.step++;
  if (c.step >= m.steps.length) { // mission complete
    state.cash += m.reward; rc.stats.cashEarned += m.reward; rc.stats.missions++;
    c.done.push(m.id); showDialog(`✔ MISI SELESAI: ${m.name} — +$${m.reward}. (Total misi: ${c.done.length}/${MISSIONS.length})`);
    c.idx++; c.step = 0;
    if (c.idx >= MISSIONS.length) { c.active = false; c.idx = -1; setObjective('🏆 Rantai selesai! Sindikat Dermaga angkat kaki dari Port Senja. Free roam — Sari berterima kasih.'); showDialog('Sari: "Selesai, Raka. Dermaga kembali ke orang-orangnya. Kamu resmi legenda Port Senja."'); rc.route = null; saveGame(true); refreshHUD(); return; }
    saveGame(true);
  }
  startStep(); refreshHUD();
}
function chooseApproach(mode) {
  const c = rc.chain, s = missionStep();
  if (!s || s.type !== 'choice' || c.approach) return false;
  c.approach = mode;
  const m = missionDef();
  if (mode === 'stealth') m.steps.splice(1, 0,
    { type: 'goto', x: 131, z: 150, r: 6, label: 'Ke dermaga kanal selatan — naik perahu kanal oranye', say: 'Sari: "Diam-diam lewat air. Drawbridge akan membuka untuk perahu."' },
    { type: 'sailthru', label: 'Layari kanal ke UTARA, lewati drawbridge B4 yang terbuka', say: 'Lewati kanal. Tunggu drawbridge membuka penuh, lalu lewat.' },
    { type: 'goto', x: 104, z: 62, r: 7, label: 'Merapat ke gudang utara kanal (104,62)', say: 'Sari: "Gudang direbut tanpa satu tembakan. Kelas."' });
  else m.steps.splice(1, 0,
    { type: 'steal', label: 'Rebut TRUK Sindikat di pelabuhan (masuk truk bertanda)', say: 'Sari: "Ambil truk mereka. Sekalian kirim pesan."' },
    { type: 'kill', x: 150, z: 96, label: 'Jatuhkan penjaga gudang di (150,96)', say: 'Penjaga gudang menghadang!' },
    { type: 'goto', x: 104, z: 62, r: 7, label: 'Bawa truk ke gudang utara kanal (104,62)', say: 'Sari: "Gudang jatuh. Berisik, tapi efektif."' });
  if (mode === 'aggressive') { const truck = makeTruck(0x707a4a, false); truck.pos.set(128, floorY(128, 104), 104); truck.heading = 1.2; truck.group.position.copy(truck.pos); truck.group.rotation.y = 1.2; truck.parked = true; truck.modelName = 'Kala Angkut — TRUK SINDIKAT'; cars.push(truck); c.stealTarget = truck; }
  showDialog(mode === 'stealth' ? 'Pendekatan: STEALTH — lewat air, tanpa bintang.' : 'Pendekatan: AGRESIF — rebut truk mereka. Polisi mungkin dengar.');
  advanceStepSilent();
  return true;
}
function advanceStepSilent() { const c = rc.chain; c.step++; startStep(); }
function stepMissions(dt) {
  const c = rc.chain, s = missionStep(); if (!c.active || !s) { markerBeacon.visible = false; return; }
  const pp = playerPos();
  // beacon on goto-like targets
  const tgt = s.type === 'chase' && c.chaseTarget ? c.chaseTarget.pos : (s.x !== undefined ? { x: s.x, z: s.z } : s.type === 'interact' && s.target === 'sari' ? sariNPC.pos : s.type === 'interact' ? contactNPC.pos : s.type === 'steal' && c.stealTarget ? c.stealTarget.pos : null);
  if (tgt) { markerBeacon.visible = true; markerBeacon.position.set(tgt.x, floorY(tgt.x, tgt.z) + 13, tgt.z); markerBeacon.material.opacity = 0.26 + Math.sin(state.time * 3) * 0.1; }
  else markerBeacon.visible = false;
  const distTo = (x, z) => Math.hypot(pp.x - x, pp.z - z);
  switch (s.type) {
    case 'goto': case 'escape': if (distTo(s.x, s.z) < (s.r || 7)) advanceStep(); break;
    case 'wait': if (distTo(s.x, s.z) < (s.r || 9)) { c.waitT += dt; if (c.waitT >= s.dur) advanceStep('Paket termuat. Jalan!'); } else c.waitT = Math.max(0, c.waitT - dt); break;
    case 'hide': if (distTo(s.x, s.z) < (s.r || 9)) { c.waitT += dt; if (c.waitT >= s.dur) { state.wantedF = 0; clearPolice(); advanceStep('Mereka lewat. Port Senja aman — untuk malam ini.'); } } else c.waitT = Math.max(0, c.waitT - dt * 2); break;
    case 'chase': { const t = c.chaseTarget; if (!t) { advanceStep(); break; } if (t.wrecked) { advanceStep('Mobil kurir berhenti total. Paket diamankan dari bagasi.'); break; } const d = Math.hypot(pp.x - t.pos.x, pp.z - t.pos.z); if (d < 8) { c.chaseHold += dt; if (c.chaseHold >= 2.5) { t.traffic = null; t.speed = 0; t.parked = true; advanceStep('Kurir menyerah di seberang sungai! Paket berpindah tangan.'); } } else c.chaseHold = Math.max(0, c.chaseHold - dt * 1.5); break; }
    case 'steal': if (state.car && state.car === c.stealTarget) { reportCrime(1, { force: true }); advanceStep('Truk direbut! Penjaga gudang tidak akan tinggal diam.'); } break;
    case 'kill': if (c.killTarget && c.killTarget.down) advanceStep('Penjaga tumbang.'); break;
    case 'sailthru': if (rc.boat === rc.boats.canal) { if (!c.sailArmed && rc.boat.pos.z > 100) c.sailArmed = true; if (c.sailArmed && rc.boat.pos.z < 82) { advanceStep('Lewat drawbridge tanpa suara. Kanal mengantarmu masuk.'); } } break;
    case 'interact': case 'choice': break; // resolved by interactWith / chooseApproach
  }
}
// ---------- GPS route (Dijkstra over the lane graph) ----------
let laneGraph = null;
function buildLaneGraph() {
  const nodes = new Map(), adj = new Map();
  const key = (L, end) => L.id + ':' + end;
  for (const L of LANES) { nodes.set(key(L, 0), L.pts[0]); nodes.set(key(L, 1), L.pts[L.pts.length - 1]); adj.set(key(L, 0), []); adj.set(key(L, 1), []); }
  for (const L of LANES) { adj.get(key(L, 0)).push({ to: key(L, 1), lane: L, cost: L.len, flip: false }); adj.get(key(L, 1)).push({ to: key(L, 0), lane: L, cost: L.len, flip: true }); }
  for (const L of LANES) for (const end of [0, 1]) {
    const p = end ? L.pts[L.pts.length - 1] : L.pts[0];
    for (const O of LANES) { if (O === L) continue; for (const oe of [0, 1]) { const q = oe ? O.pts[O.pts.length - 1] : O.pts[0]; if (Math.hypot(p.x - q.x, p.z - q.z) < 4.5) adj.get(key(L, end)).push({ to: key(O, oe), lane: null, cost: 1 }); } }
  }
  return { nodes, adj };
}
function computeRoute() {
  const s = missionStep();
  const tgt = s && s.x !== undefined ? { x: s.x, z: s.z } : s && s.type === 'interact' ? (s.target === 'sari' ? sariNPC.pos : contactNPC.pos) : s && s.type === 'chase' && rc.chain.chaseTarget ? rc.chain.chaseTarget.pos : null;
  if (!tgt) { rc.route = null; return null; }
  if (!laneGraph) laneGraph = buildLaneGraph();
  const pp = playerPos();
  const nearNode = pos => { let bk = null, bd = 1e18; for (const [k, p] of laneGraph.nodes) { const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2; if (d < bd) { bd = d; bk = k; } } return bk; };
  const start = nearNode(pp), goal = nearNode(tgt);
  const dist = new Map([[start, 0]]), prev = new Map(), open = new Set([start]);
  while (open.size) {
    let cur = null, cd = 1e18; for (const k of open) if ((dist.get(k) ?? 1e18) < cd) { cd = dist.get(k); cur = k; }
    if (cur === goal) break; open.delete(cur);
    for (const e of laneGraph.adj.get(cur) || []) { const nd = cd + e.cost; if (nd < (dist.get(e.to) ?? 1e18)) { dist.set(e.to, nd); prev.set(e.to, { from: cur, lane: e.lane, flip: e.flip }); open.add(e.to); } }
  }
  if (!prev.has(goal) && goal !== start) { rc.route = [{ x: pp.x, z: pp.z }, { x: tgt.x, z: tgt.z }]; return rc.route; }
  const pts = [{ x: tgt.x, z: tgt.z }]; let cur = goal;
  while (cur !== start && prev.has(cur)) { const p = prev.get(cur); if (p.lane) { const lp = p.flip ? [...p.lane.pts].reverse() : p.lane.pts; for (let i = lp.length - 1; i >= 0; i--) pts.push({ x: lp[i].x, z: lp[i].z }); } cur = p.from; }
  pts.push({ x: pp.x, z: pp.z }); pts.reverse(); rc.route = pts; return pts;
}
setInterval(() => { if (rc.chain.active && !rc.phoneOpen) computeRoute(); }, 4000);
// minimap: draw the GPS route under the blips
const _drawMinimapRC = drawMinimap;
drawMinimap = function (px, pz, heading) {
  _drawMinimapRC(px, pz, heading);
  if (rc.route && rc.route.length > 1) { mm.strokeStyle = '#ffffff'; mm.lineWidth = 2.6; mm.setLineDash([5, 3]); mm.beginPath(); rc.route.forEach((p, i) => i ? mm.lineTo(mmX(p.x), mmY(p.z)) : mm.moveTo(mmX(p.x), mmY(p.z))); mm.stroke(); mm.setLineDash([]); }
  const s = missionStep(); if (s && s.x !== undefined) { mm.fillStyle = '#ffb347'; mm.beginPath(); mm.arc(mmX(s.x), mmY(s.z), 4, 0, 7); mm.fill(); mm.fillStyle = '#241305'; mm.font = 'bold 6px sans-serif'; mm.textAlign = 'center'; mm.fillText('★', mmX(s.x), mmY(s.z) + 2); }
  for (const d of DOORS) { mm.fillStyle = d.buyable ? '#7de8de' : '#39d0c4'; mm.beginPath(); mm.arc(mmX(d.x), mmY(d.z), 2, 0, 7); mm.fill(); }
  for (const b of Object.values(rc.boats)) { mm.fillStyle = '#7de8de'; mm.beginPath(); mm.arc(mmX(b.pos.x), mmY(b.pos.z), 2.2, 0, 7); mm.fill(); }
  if (rc.bridge.open01 > 0.3) { mm.fillStyle = '#ff5252'; mm.beginPath(); mm.arc(mmX(BRIDGE_C.x), mmY(BRIDGE_C.z), 3, 0, 7); mm.fill(); }
};

// ======================================================================
// PHONE MAP (icon-legend style) + PHOTO MODE
// ======================================================================
function drawPhoneMap() {
  const cv = rcEl('phone-map'); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const X = x => (x + 310) / 620 * W, Y = z => (z + 250) / 500 * H;
  g.fillStyle = '#175263'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#262338'; g.beginPath(); g.moveTo(X(-300), Y(-240));
  for (let z = -240; z <= 240; z += 12) g.lineTo(X(coastX(z)), Y(z));
  for (let x = 300; x >= -300; x -= 12) g.lineTo(X(x), Y(Math.min(240, coastZ(x))));
  g.closePath(); g.fill();
  g.beginPath(); g.ellipse(X(ISLAND_C[0]), Y(ISLAND_C[1]), 15, 11, 0, 0, 7); g.fill();
  g.fillStyle = '#2fa8a0'; g.beginPath(); g.ellipse(X(LAKE_C[0]), Y(LAKE_C[1]), LAKE_RX / 620 * W, LAKE_RZ / 500 * H, 0, 0, 7); g.fill();
  g.strokeStyle = '#2fa8a0'; g.lineCap = 'round'; g.lineWidth = 9; g.beginPath(); RIVER_PTS.forEach(([x, z], i) => i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(X(CANAL_X), Y(CANAL_Z0)); g.lineTo(X(CANAL_X), Y(CANAL_Z1)); g.stroke();
  const drawCls = (cls, style, width, dash) => { g.strokeStyle = style; g.lineWidth = width; g.setLineDash(dash || []); for (const e of EDGES) { if (e.cls !== cls) continue; g.beginPath(); e.pts.forEach(([x, z], i) => i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))); g.stroke(); } g.setLineDash([]); };
  drawCls('ped', '#7dc383', 1.2, [4, 3]); drawCls('local', '#9fb4c8', 2); drawCls('major', '#ffb347', 3.6);
  // bridges as B-glyphs (icon-legend standard)
  g.font = 'bold 9px sans-serif'; g.textAlign = 'center';
  for (const e of EDGES) { if (!e.bridge) continue; const p = e.pts[Math.floor(e.pts.length / 2)]; g.fillStyle = '#101018'; g.fillRect(X(p[0]) - 8, Y(p[1]) - 6, 16, 12); g.fillStyle = '#7de8de'; g.fillText(e.bridge, X(p[0]), Y(p[1]) + 3); }
  // GPS route
  if (rc.route && rc.route.length > 1) { g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.setLineDash([7, 4]); g.beginPath(); rc.route.forEach((p, i) => i ? g.lineTo(X(p.x), Y(p.z)) : g.moveTo(X(p.x), Y(p.z))); g.stroke(); g.setLineDash([]); }
  // POI icons
  g.font = '13px sans-serif';
  const poi = (x, z, icon) => g.fillText(icon, X(x), Y(z) + 4);
  poi(18, -50, '🏠'); poi(54, -50, '🍜'); poi(88, -80, '🔫'); poi(28, -146, '🚓'); poi(106, 88, '🏥'); poi(232, 158, '🏝'); poi(140, 148, '⚓'); poi(238, 96, '⚓');
  const s = missionStep(); if (s && s.x !== undefined) { g.font = '17px sans-serif'; poi(s.x, s.z, '⭐'); }
  if (rc.bridge.open01 > 0.3) { g.font = '13px sans-serif'; poi(BRIDGE_C.x, BRIDGE_C.z, '🚧'); }
  // player arrow
  const pp = playerPos(); g.save(); g.translate(X(pp.x), Y(pp.z)); g.rotate(state.mode === 'car' && state.car ? state.car.heading : state.mode === 'boat' && rc.boat ? rc.boat.heading : state.heading);
  g.fillStyle = '#fff7ea'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill(); g.restore();
  const lg = rcEl('phone-legend');
  if (lg && !lg.innerHTML) lg.innerHTML = '<span>━ <b style="color:#ffb347">Jalan besar</b></span><span>━ Jalan lokal</span><span>┅ Gang/pedestrian</span><span>🏠 Safehouse</span><span>🍜 Warung</span><span>🔫 Senjata</span><span>🚓 Polisi</span><span>🏥 Klinik</span><span>⚓ Dermaga</span><span>⭐ Tujuan</span><span>🚧 Drawbridge terbuka</span>';
  const po = rcEl('phone-obj'); if (po) po.textContent = rc.chain.active ? (rcEl('objective') ? rcEl('objective').textContent : '') : 'Tidak ada misi aktif — free roam Port Senja.';
}
function togglePhone(on) {
  rc.phoneOpen = on === undefined ? !rc.phoneOpen : on;
  const p = rcEl('phone'); if (p) p.hidden = !rc.phoneOpen;
  if (rc.phoneOpen) { computeRoute(); drawPhoneMap(); }
}
rcEl('phone-close') && rcEl('phone-close').addEventListener('click', () => togglePhone(false));
rcEl('photo-btn') && rcEl('photo-btn').addEventListener('click', () => { togglePhone(false); setPhoto(true); });
function setPhoto(on) {
  rc.photo = on; if (on) rc.stats.photos++;
  for (const id of ['hud', 'controls', 'minimap-wrap']) { const e = rcEl(id); if (e) e.style.display = on ? 'none' : ''; }
  const t = rcEl('photo-tag'); if (t) t.hidden = !on;
}
// ======================================================================
// AUDIO — all WebAudio synth: engine, siren, radio sequencer (3
// stations), ambient pads, mission stingers. No external files.
// ======================================================================
const rcAudio = { eng: null, engGain: null, siren: null, sirenGain: null, beatT: 0, ambT: 0, beat: 0 };
function tone(freq, dur = 0.18, type = 'triangle', vol = 0.05, delay = 0, slideTo = 0) {
  if (!AC) return;
  try {
    const t = AC.currentTime + delay, o = AC.createOscillator(), gn = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.015); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(gn); gn.connect(AC.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch (e) { /* ignore */ }
}
function missionStinger(win) {
  ensureAudio(); if (!AC) return;
  if (win) { tone(659, 0.16, 'triangle', 0.06); tone(880, 0.16, 'triangle', 0.06, 0.11); tone(1046, 0.3, 'triangle', 0.07, 0.22); }
  else { tone(330, 0.2, 'sawtooth', 0.04); tone(262, 0.2, 'sawtooth', 0.04, 0.14); tone(196, 0.34, 'sawtooth', 0.04, 0.28); }
}
const RADIO_PATTERNS = [
  null,
  { name: 'Radio Pantai FM', mel: [523, 587, 659, 784, 659, 587, 523, 440], type: 'triangle', vol: 0.045, bass: [131, 98, 110, 98] },
  { name: 'Neon FM', mel: [440, 523, 659, 523, 440, 392, 440, 587], type: 'sawtooth', vol: 0.02, bass: [110, 110, 131, 98] },
  { name: 'Dermaga FM', mel: [392, 440, 494, 440, 392, 330, 392, 440], type: 'square', vol: 0.022, bass: [98, 98, 147, 98] },
];
function stepAudio(dt) {
  if (!AC) return;
  const driving = (state.mode === 'car' && state.car) || (state.mode === 'boat' && rc.boat);
  // engine
  if (driving) {
    if (!rcAudio.eng) { try { rcAudio.eng = AC.createOscillator(); rcAudio.eng.type = 'sawtooth'; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; rcAudio.engGain = AC.createGain(); rcAudio.engGain.gain.value = 0.0; rcAudio.eng.connect(f); f.connect(rcAudio.engGain); rcAudio.engGain.connect(AC.destination); rcAudio.eng.start(); } catch (e) { /* ignore */ } }
    if (rcAudio.eng) { const spd = state.mode === 'boat' ? Math.abs(rc.boat.speed) : Math.abs(state.car.speed); rcAudio.eng.frequency.value = (state.mode === 'boat' ? 52 : 62) + spd * 5.2; rcAudio.engGain.gain.value = 0.016 + Math.min(0.03, spd * 0.0012); }
  } else if (rcAudio.eng) { try { rcAudio.eng.stop(); } catch (e) { /* ignore */ } rcAudio.eng = null; rcAudio.engGain = null; }
  // siren (two-tone) while police are active
  const sirenOn = starsNow() > 0 && police.length > 0 && state.mode !== 'interior';
  if (sirenOn) {
    if (!rcAudio.siren) { try { rcAudio.siren = AC.createOscillator(); rcAudio.siren.type = 'square'; rcAudio.sirenGain = AC.createGain(); rcAudio.sirenGain.gain.value = 0.008; rcAudio.siren.connect(rcAudio.sirenGain); rcAudio.sirenGain.connect(AC.destination); rcAudio.siren.start(); } catch (e) { /* ignore */ } }
    if (rcAudio.siren) rcAudio.siren.frequency.value = Math.floor(state.time * 2.4) % 2 ? 950 : 660;
  } else if (rcAudio.siren) { try { rcAudio.siren.stop(); } catch (e) { /* ignore */ } rcAudio.siren = null; rcAudio.sirenGain = null; }
  // radio sequencer / ambient
  rcAudio.beatT -= dt;
  if (rcAudio.beatT <= 0) {
    rcAudio.beatT = 0.21; const b = rcAudio.beat++;
    if (rc.radio > 0 && driving) { const P = RADIO_PATTERNS[rc.radio]; tone(P.mel[b % P.mel.length], 0.19, P.type, P.vol); if (b % 2 === 0) tone(P.bass[(b >> 1) % P.bass.length], 0.3, 'sine', 0.06); if (rc.radio === 3 && b % 2 === 1) tone(6000, 0.03, 'square', 0.006); }
  }
  rcAudio.ambT -= dt;
  if (rcAudio.ambT <= 0) { rcAudio.ambT = 2.8; if (rc.radio === 0 && state.mode !== 'interior' && state.mode !== 'title') { tone(220, 2.4, 'sine', 0.011); tone(277, 2.4, 'sine', 0.009); } }
}
function cycleRadio() { rc.radio = (rc.radio + 1) % 4; rcToastRadio(); if (rc.radio > 0) showDialog('📻 ' + RADIO_PATTERNS[rc.radio].name + ' — R untuk ganti stasiun'); }
// ======================================================================
// SAVE / CONTINUE (localStorage) + GARAGE + SECOND SAFEHOUSE + STATS
// ======================================================================
const SAVE_KEY = 'senjaheat-save-v2';
function saveGame(silent = false) {
  try {
    const wp = state.mode === 'interior' && rc.returnPos ? rc.returnPos : state.mode === 'boat' && rc.boat ? rc.boat.pos : playerPos();
    const data = { v: 2, x: wp.x, z: wp.z, heading: state.heading, cash: Math.round(state.cash), health: Math.round(state.health),
      weapon: state.weapon, owned: [...owned], mag: { ...state.mag }, reserve: Object.fromEntries(Object.entries(state.reserve).map(([k, v]) => [k, v === Infinity ? 'inf' : v])),
      chainDone: [...rc.chain.done], safe2: rc.safe2, garage: rc.garage, stats: { ...rc.stats }, radio: rc.radio };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (!silent) showDialog('💾 Tersimpan di safehouse ini. (Continue dari menu judul)');
    return true;
  } catch (e) { return false; }
}
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
    const d = JSON.parse(raw); if (!d || d.v !== 2) return false;
    state.cash = d.cash; state.health = d.health; state.heading = d.heading || 0;
    state.pos.set(d.x, 0, d.z); state.pos.y = floorY(d.x, d.z); player.position.copy(state.pos);
    for (let i = 0; i < owned.length; i++) owned[i] = !!d.owned[i];
    state.mag = d.mag || state.mag; state.reserve = Object.fromEntries(Object.entries(d.reserve || {}).map(([k, v]) => [k, v === 'inf' ? Infinity : v]));
    selectWeapon(d.weapon || 1); rc.chain.done = d.chainDone || []; rc.safe2 = !!d.safe2; rc.garage = d.garage || null;
    Object.assign(rc.stats, d.stats || {}); rc.radio = d.radio || 0;
    state.wantedF = 0; clearPolice();
    showDialog('↩ Save dimuat. Selamat datang kembali di Port Senja, Raka.');
    refreshHUD(); return true;
  } catch (e) { return false; }
}
const GARAGE_SPOTS = [{ x: 26, z: -44, label: 'Garasi Rumah Raka' }, { x: 224, z: 150, label: 'Garasi Rumah Pulau', needSafe2: true }];
function garageSpotNear(maxD = 6) { for (const s of GARAGE_SPOTS) { if (s.needSafe2 && !rc.safe2) continue; if (Math.hypot(playerPos().x - s.x, playerPos().z - s.z) < maxD) return s; } return null; }
function garageToggle() {
  const spot = garageSpotNear(); if (!spot) return;
  if (state.mode === 'car' && state.car) {
    const car = state.car; rc.garage = { rosterIdx: Math.max(0, VEHICLE_ROSTER.indexOf(car.model)), modelName: car.modelName };
    exitCar(); const i = cars.indexOf(car); if (i >= 0) cars.splice(i, 1); scene.remove(car.group);
    showDialog(`Garasi: ${rc.garage.modelName} disimpan. Tekan G di garasi untuk mengambilnya.`); saveGame(true);
  } else if (state.mode === 'foot' && rc.garage) {
    const car = makeCar(0x39d0c4, rc.garage.rosterIdx); car.pos.set(spot.x, floorY(spot.x, spot.z), spot.z); car.heading = 0.4; car.group.position.copy(car.pos); car.group.rotation.y = 0.4; car.parked = true; cars.push(car);
    showDialog(`Garasi: ${rc.garage.modelName} dikeluarkan.`); rc.garage = null; saveGame(true);
  } else showDialog('Garasi kosong — bawa mobil ke sini lalu tekan G untuk menyimpan.');
}
// stats rendered into the pause card
const _togglePauseRC = togglePause;
togglePause = function () { _togglePauseRC(); if (state.mode === 'pause') { const el = rcEl('stats'); if (el) { const st = rc.stats; el.innerHTML =
  `Misi selesai <b>${rc.stats.missions} / ${MISSIONS.length}</b><br>Jarak tempuh <b>${(st.dist / 1000).toFixed(2)} km</b><br>Tembakan <b>${st.shots}</b> • Warga tumbang <b>${st.downs}</b><br>Interaksi NPC <b>${st.talked}</b> • Interior dikunjungi <b>${st.interiors}</b><br>Naik perahu <b>${st.boatTrips}</b> • Bintang maks <b>${'★'.repeat(st.maxStars) || '—'}</b><br>Cash dari misi <b>$${st.cashEarned}</b> • Safehouse pulau <b>${rc.safe2 ? 'dimiliki' : 'belum'}</b><br>Garasi <b>${rc.garage ? rc.garage.modelName : 'kosong'}</b>`; } } };
// title / pause buttons
{ const cb = rcEl('continue-btn'); if (cb && hasSave()) { cb.hidden = false; cb.addEventListener('click', () => { if (loadSave()) startGame(); }); }
  const mb = rcEl('mission-btn'); if (mb) mb.addEventListener('click', () => { startGame(); if (!rc.chain.active) startChain(); });
  const sb = rcEl('save-btn'); if (sb) sb.addEventListener('click', () => saveGame()); }
// ======================================================================
// INPUT (R-C keys) + prompt wrap + the R-C step
// ======================================================================
let rcActF = false, rcActG = false;
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyF') rcActF = true;
  if (e.code === 'KeyG') rcActG = true;
  if (e.code === 'KeyM') togglePhone();
  if (e.code === 'KeyO') setPhoto(!rc.photo);
  if (e.code === 'Digit8') chooseApproach('stealth');
  if (e.code === 'Digit9') chooseApproach('aggressive');
  if (e.code === 'KeyR' && (state.mode === 'car' || state.mode === 'boat')) { ensureAudio(); cycleRadio(); }
});
const _stepFootPromptRC = stepFootPrompt;
stepFootPrompt = function () {
  if (actShoot && state.mode === 'foot') { const t = nearestInteractPed(3.1); if (t) { interactWith(t); actShoot = false; rcActF = false; } }
  _stepFootPromptRC();
};
function stepRC(dt) {
  stepBridge(dt); stepRipples(dt); stepAudio(dt);
  // progression stats
  rc.stats.maxStars = Math.max(rc.stats.maxStars, starsNow());
  const pp = playerPos();
  if (rc.lastPos && state.mode !== 'interior') rc.stats.dist += Math.hypot(pp.x - rc.lastPos.x, pp.z - rc.lastPos.z);
  rc.lastPos = rc.lastPos || new THREE.Vector3(); rc.lastPos.copy(pp);
  if (state.mode === 'interior') { stepInterior(dt); rcActF = false; rcActG = false; return; }
  if (state.mode === 'boat') stepBoat(dt);
  if (state.mode === 'foot') {
    const door = nearestDoor(3.6), boat = nearestBoat(5.5), ped = nearestInteractPed(3.1);
    if (door && door.buyable && !rc.safe2) { rcPrompt(`Rumah Pulau Senja — <kbd>F</kbd> beli $600 (safehouse + garasi)`); if (rcActF) { if (state.cash >= 600) { state.cash -= 600; rc.safe2 = true; door.label = 'RUMAH PULAU SENJA — MILIK RAKA'; showDialog('🏝 Rumah Pulau Senja jadi milikmu! Pintu sekarang membuka safehouse; garasi pulau aktif.'); saveGame(true); } else showDialog('Uang kurang — Rumah Pulau $600.'); rcActF = false; } }
    else if (door) { rcPrompt(`Press <kbd>E</kbd> to enter — ${door.label}`); if (actE && !rc.fadeBusy) enterInterior(door); }
    else if (boat) { rcPrompt(`Press <kbd>E</kbd> to board — Ombak Lumba (perahu)`); if (actE) enterBoat(boat); }
    else if (ped) rcPrompt(`Press <kbd>F</kbd> to talk — ${ped.name || 'Warga Port Senja'}`);
    if (rcActG && garageSpotNear()) { garageToggle(); }
  }
  if (state.mode === 'car' && rcActG && garageSpotNear()) garageToggle();
  if (rc.phoneOpen && (rc.phoneTick = (rc.phoneTick || 0) + dt) > 0.6) { rc.phoneTick = 0; drawPhoneMap(); }
  stepMissions(dt);
  rcActF = false; rcActG = false;
}

// ======================================================================
// Instant interior helpers (tests/shots) + R-C shot staging + autotest
// ======================================================================
function enterInteriorInstant(id) {
  const door = DOORS.find(d => d.id === id) || DOORS[0];
  rc.returnPos = state.pos.clone(); rc.returnHeading = state.heading;
  const r = ROOMS[door.room]; rc.interior = door.id; rc.room = r;
  state.mode = 'interior'; state.prevMode = 'interior';
  state.pos.set(r.cx, INT_Y, r.cz + r.d / 2 - 2.6); player.position.copy(state.pos); player.visible = true;
  camYaw = Math.PI; state.heading = Math.PI;
  intLight.position.set(r.cx, INT_Y + 3, r.cz); intLight.visible = true;
  const lbl = rcEl('int-label'); if (lbl) { lbl.textContent = '🏠 ' + r.name; lbl.hidden = false; }
  return door;
}
function exitInteriorInstant() {
  state.mode = 'foot'; state.prevMode = 'foot';
  if (rc.returnPos) { state.pos.copy(rc.returnPos); state.pos.y = floorY(state.pos.x, state.pos.z); }
  player.position.copy(state.pos); intLight.visible = false; rc.interior = null; rc.room = null;
  const lbl = rcEl('int-label'); if (lbl) lbl.hidden = true;
}
const RC_SHOTS = ['rc-safehouse', 'rc-warung', 'rc-shop', 'rc-police', 'rc-hospital', 'rc-boat-river', 'rc-boat-canal', 'rc-bridge-open', 'rc-dialog', 'rc-phone', 'rc-photo', 'rc-stats', 'rc-chase'];
if (SHOT && RC_SHOTS.includes(SHOT)) {
  titleEl.hidden = true;
  const putP = (x, z, h = 0.6) => { state.pos.set(x, 0, z); state.pos.y = floorY(x, z); state.heading = h; camYaw = h; player.position.copy(state.pos); player.rotation.y = h; state.mode = 'foot'; state.prevMode = 'foot'; };
  if (SHOT === 'rc-safehouse') { putP(18, -54); enterInteriorInstant('safehouse'); state.pos.set(ROOMS[0].cx - 1.8, INT_Y, ROOMS[0].cz - 1.2); player.position.copy(state.pos); camYaw = Math.PI; state.heading = Math.PI; }
  else if (SHOT === 'rc-warung') { putP(54, -54); enterInteriorInstant('warung'); }
  else if (SHOT === 'rc-shop') { putP(88, -84); enterInteriorInstant('shop'); toggleShop(true); }
  else if (SHOT === 'rc-police') { putP(28, -150); enterInteriorInstant('police'); }
  else if (SHOT === 'rc-hospital') { putP(106, 84); enterInteriorInstant('hospital'); }
  else if (SHOT === 'rc-boat-river') { const b = rc.boats.sea; b.pos.set(58, WATER_Y + 0.32, 2); b.heading = 2.6; b.group.position.copy(b.pos); putP(52, 6, 2.2); enterBoat(b); }
  else if (SHOT === 'rc-boat-canal') { bridgeSet(true, true); rc.bridge.open01 = 1; const b = rc.boats.canal; b.pos.set(CANAL_X, WATER_Y + 0.32, 116); b.heading = 0; b.group.position.copy(b.pos); putP(131, 118, 1.2); enterBoat(b); camera.position.set(122, 9, 138); camera.lookAt(140, 1, 92); }
  else if (SHOT === 'rc-bridge-open') { bridgeSet(true, true); rc.bridge.open01 = 1; putP(118, 76, -1.4); const t = traffic[3]; if (t) assignLane(t, 'hb84w', 1, 8, 0.62); camera.position.set(112, 10, 62); camera.lookAt(142, 3, 84); }
  else if (SHOT === 'rc-dialog') { putP(50, -44, 2.8); showDialog('Sari: "Raka! Ada rantai kerjaan malam ini — Sindikat Dermaga makin berani. Lima misi, mulai dari warungku ini."'); camera.position.set(44, 3.4, -38); camera.lookAt(52, 1.4, -47); }
  else if (SHOT === 'rc-phone') { putP(30, -60, 0.6); startChain(); togglePhone(true); }
  else if (SHOT === 'rc-photo') { putP(20, -64, 0.9); setPhoto(true); camera.position.set(8, 3.2, -50); camera.lookAt(34, 2, -70); }
  else if (SHOT === 'rc-stats') { putP(20, -64); startGame(); togglePause(); }
  else if (SHOT === 'rc-chase') { putP(58, -34, 3.1); startChain(); rc.chain.idx = 1; rc.chain.step = 1; startStep(); if (rc.chain.chaseTarget) { const t = rc.chain.chaseTarget; } camera.position.set(38, 12, -52); camera.lookAt(60, 2, -6); }
}
// ---------- R-C autotest (?autotest=rc): R-B debt + R-C mechanics ----------
const rcTest = { phase: -1, t0: 0, setup: false, results: {}, samples: {} };
function rcCheck(name, ok, evidence) { rcTest.results[name] = { ok: !!ok, evidence: String(evidence) }; }
function stepRCTest(dt) {
  const T = rcTest, S = state;
  const phase = (n, setup, waitS, check) => {
    if (T.phase < n) { T.phase = n; T.t0 = S.time; T.setup = false; }
    if (T.phase !== n) return false;
    if (!T.setup) { setup(); T.setup = true; }
    if (S.time - T.t0 >= waitS) { check(); return true; }
    return false;
  };
  // 0 — ROADBLOCK ★4 (R-B debt)
  if (T.phase < 0) { T.phase = 0; T.t0 = S.time; T.setup = false; }
  if (T.phase === 0) { if (!T.setup) { T.setup = true; S.pos.set(28, 0, -84); S.pos.y = floorY(28, -84); clearPolice(); reportCrime(4, { force: true }); spawnPolice(); spawnPolice(); }
    if (S.time - T.t0 > 1.6) { rcCheck('roadblock4', roadblock.length >= 2, `roadblock cars=${roadblock.length}`); S.wantedF = 0; clearPolice(); setRoadblock(false); T.phase = 1; T.t0 = S.time; T.setup = false; } return; }
  // 1 — POLICE FIRE ★3 (R-B debt)
  if (T.phase === 1) { S.busted = 0; if (!T.setup) { T.setup = true; T.s0 = rc.counters.policeShots; T.hp0 = S.health; clearPolice(); reportCrime(3, { force: true }); spawnPolice(); const p = police[0]; if (p) { p.pos.set(S.pos.x + 10, floorY(S.pos.x + 10, S.pos.z), S.pos.z); p.group.position.copy(p.pos); } }
    if (S.time - T.t0 > 8.0 || rc.counters.policeShots > T.s0 || S.health < T.hp0) { rcCheck('policeFire3', rc.counters.policeShots > T.s0 || S.health < T.hp0, `police tracers=${rc.counters.policeShots - T.s0}, hp ${T.hp0}->${Math.round(S.health)}`); S.wantedF = 0; S.health = 100; clearPolice(); T.phase = 2; T.t0 = S.time; T.setup = false; } return; }
  // 2 — PIT ★5 (R-B debt): interceptor placed on the player's bumper
  if (T.phase === 2) { if (!T.setup) { T.setup = true; if (S.mode === 'busted' || S.mode === 'wasted') doRespawn(); const hero = window.__heroCar; hero.health = 100; S.pos.set(hero.pos.x + 2, 0, hero.pos.z); enterCar(hero); hero.pos.set(90, floorY(90, -84), -84); hero.heading = -Math.PI / 2; hero.group.position.copy(hero.pos); hero.speed = 13; reportCrime(5, { force: true }); spawnPolice(); const p = police[police.length - 1]; if (p) { p.pos.set(97, floorY(97, -84), -84); p.heading = -Math.PI / 2; p.speed = 17; p.group.position.copy(p.pos); } T.minD = 99; }
    const p = police[0]; if (p && S.car) T.minD = Math.min(T.minD, p.pos.distanceTo(S.car.pos));
    if (S.time - T.t0 > 3.0) { const hero = window.__heroCar; rcCheck('pit5', T.minD < 4.4 || hero.health < 100, `min police-player dist=${T.minD.toFixed(1)}m, hero HP=${Math.round(hero.health)}`); if (S.car) { S.car.speed = 0; exitCar(); } S.wantedF = 0; clearPolice(); hero.health = 100; T.phase = 3; T.t0 = S.time; T.setup = false; } return; }
  // 3 — VAULT (R-B debt)
  if (T.phase === 3) { if (!T.setup) { T.setup = true; const c = colliders.find(q => (q.maxX - q.minX) > 2.5 && (q.maxZ - q.minZ) > 2.5 && q.minX > -120 && q.minX < 160); T.col = c; S.pos.set(c.minX - 2.1, 0, (c.minZ + c.maxZ) / 2); S.pos.y = floorY(S.pos.x, S.pos.z); camYaw = Math.PI / 2; keys.KeyW = true; T.vaultSeen = false; T.spaceAt = S.time + 0.35; }
    if (!T.spaced && S.time > T.spaceAt) { actSpace = true; T.spaced = true; }
    if (S.footState === 'vault' || S.pos.x > T.col.minX - 0.4) T.vaultSeen = true;
    if (S.time - T.t0 > 1.5) { keys.KeyW = false; rcCheck('vault', T.vaultSeen, `footState=${S.footState}, x ${S.pos.x.toFixed(1)} vs collider minX ${T.col.minX.toFixed(1)}`); T.phase = 4; T.t0 = S.time; T.setup = false; } return; }
  // 4 — HOOD CAM (R-B debt)
  if (T.phase === 4) { if (!T.setup) { T.setup = true; const hero = window.__heroCar; S.pos.set(hero.pos.x + 2, 0, hero.pos.z); enterCar(hero); S.camView = 2; }
    if (S.time - T.t0 > 0.9) { const d = S.car ? camera.position.distanceTo(S.car.pos) : 99; rcCheck('hoodCam', d < 5, `camera-car dist=${d.toFixed(1)}m (hood ~1.4m ahead)`); T.phase = 5; T.t0 = S.time; T.setup = false; } return; }
  // 5 — CINEMATIC CAM (R-B debt)
  if (T.phase === 5) { if (!T.setup) { T.setup = true; if (!S.car) { const hero = window.__heroCar; S.pos.set(hero.pos.x + 2, 0, hero.pos.z); enterCar(hero); } if (S.car) S.car.speed = 0; S.camView = 3; T.a1 = S.car ? Math.atan2(camera.position.x - S.car.pos.x, camera.position.z - S.car.pos.z) : 0; }
    if (S.time - T.t0 > 1.6) { if (!S.car) { rcCheck('cineCam', false, 'no car available for cinematic test'); T.phase = 6; T.t0 = S.time; T.setup = false; return; } const a2 = Math.atan2(camera.position.x - S.car.pos.x, camera.position.z - S.car.pos.z); let dd = Math.abs(a2 - T.a1); rcCheck('cineCam', dd > 0.08, `orbit angle drift=${dd.toFixed(2)} rad in 2.0s`); if (S.car) exitCar(); S.camView = 0; T.phase = 6; T.t0 = S.time; T.setup = false; } return; }
  // 6 — INTERIOR enter/exit
  if (T.phase === 6) { if (!T.setup) { T.setup = true; S.pos.set(54, 0, -54); S.pos.y = floorY(54, -54); enterInteriorInstant('warung'); }
    if (S.time - T.t0 > 0.6) { rcCheck('interiorWarung', S.mode === 'interior' && rc.interior === 'warung', `mode=${S.mode} interior=${rc.interior}`); exitInteriorInstant(); rcCheck('interiorExit', S.mode === 'foot', `mode=${S.mode}`); T.phase = 7; T.t0 = S.time; T.setup = false; } return; }
  // 7 — BOAT + DRAWBRIDGE: force open, sail the canal north through it
  if (T.phase === 7) { if (!T.setup) { T.setup = true; T.sailing = false; const b = rc.boats.canal; b.pos.set(CANAL_X, WATER_Y + 0.32, 128); b.group.position.copy(b.pos); S.pos.set(b.pos.x + 2, 0, b.pos.z); S.pos.y = -0.45; enterBoat(b); bridgeSet(true, true); T.z0 = b.pos.z; }
    const b = rc.boats.canal;
    if (!T.sailing && rc.bridge.open01 > 0.85) { T.sailing = true; rcCheck('drawbridgeOpens', true, `open01=${rc.bridge.open01.toFixed(2)} before sailing`); keys.KeyW = true; }
    if (S.time - T.t0 > 13 || (T.sailing && b.pos.z < 104)) { keys.KeyW = false; if (!T.results.drawbridgeOpens) rcCheck('drawbridgeOpens', false, `open01=${rc.bridge.open01.toFixed(2)} after 13s wait`); rcCheck('boatSailsCanal', b.pos.z < T.z0 - 22, `canal boat z ${T.z0.toFixed(0)} -> ${b.pos.z.toFixed(0)}`); if (rc.boat) exitBoat(); T.phase = 8; T.t0 = S.time; T.setup = false; } return; }
  // 8 — TRAFFIC WAITS at the open drawbridge
  if (T.phase === 8) { if (!T.setup) { T.setup = true; const t = traffic[3]; assignLane(t, 'hb84w', 1, 8.5, 0.62); T.car = t; T.maxX = t.pos.x; }
    if (T.car) T.maxX = Math.max(T.maxX, T.car.pos.x);
    if (S.time - T.t0 > 3.6) { rcCheck('trafficWaits', T.maxX < 140.5, `eastbound harbour car maxX=${T.maxX.toFixed(1)} (bank at 134, span centre 140)`); bridgeSet(false); rc.bridge.forced = null; T.phase = 9; T.t0 = S.time; T.setup = false; } return; }
  // 9 — MISSION FRAMEWORK: walk the whole chain via advance/choose
  if (T.phase === 9) { if (!T.setup) { T.setup = true; T.cash0 = S.cash; startChain(); let guard = 0; while (rc.chain.active && guard++ < 40) { const s = missionStep(); if (!s) break; if (s.type === 'choice') chooseApproach('stealth'); else advanceStep(); } }
    rcCheck('missionChainFramework', rc.chain.done.length === 5 && S.cash > T.cash0, `missions done=${rc.chain.done.length}/5, cash ${T.cash0} -> ${Math.round(S.cash)}`);
    T.phase = 10; T.t0 = S.time; T.setup = false; return; }
  // 10 — SAVE / LOAD round-trip
  if (T.phase === 10) { S.cash = 1234; const okSave = saveGame(true); S.cash = 5; const okLoad = loadSave(); rcCheck('saveLoad', okSave && okLoad && S.cash === 1234, `cash after load=${Math.round(S.cash)}`); T.phase = 11; T.t0 = S.time; T.setup = false; return; }
  // 11 — SHOP + FOOD economy
  if (T.phase === 11) { S.cash += 3000; const bought = buyItem('smg'); S.health = 50; const ate = buyFood(); rcCheck('shopAndFood', bought && owned[2] && ate && S.health >= 89, `SMG owned=${owned[2]}, hp after food=${Math.round(S.health)}`); T.phase = 12; T.t0 = S.time; T.setup = false; return; }
  // 12 — PHONE + PHOTO
  if (T.phase === 12) { togglePhone(true); const phoneShown = !rcEl('phone').hidden; togglePhone(false); setPhoto(true); const hudHidden = rcEl('hud').style.display === 'none'; setPhoto(false); rcCheck('phoneAndPhoto', phoneShown && hudHidden, `phone shown=${phoneShown}, HUD hidden in photo=${hudHidden}`); T.phase = 13; return; }
  // 13 — done
  if (T.phase === 13) { const all = Object.values(T.results).every(r => r.ok); window.__autotest = JSON.stringify({ rc: all, ...Object.fromEntries(Object.entries(T.results).map(([k, v]) => [k, v.ok + ':' + v.evidence])) }); window.__rcTestDone = true; window.__shotReady = true; T.phase = 99; return; }
}
// ---------- exports ----------
window.__rc = { rc, ROOMS, DOORS, MISSIONS, enterBoat, exitBoat, enterInterior, exitInterior, enterInteriorInstant, exitInteriorInstant,
  bridgeSet, startChain, advanceStep, chooseApproach, missionStep, missionDef, buyItem, buyFood, toggleShop, saveGame, loadSave, hasSave,
  togglePhone, setPhoto, computeRoute, garageToggle, cycleRadio, missionStinger, interactWith, nearestDoor, nearestBoat, rcTest };
Object.assign(window.__game, { rc, rcTest, enterBoat, exitBoat, startChain, advanceStep, chooseApproach, saveGame, loadSave, togglePhone, setPhoto, bridgeSet,
  get bridge() { return rc.bridge; }, get chain() { return rc.chain; } });
if (!rc.chain.active) refreshObjective();
window.__rcReady = true;

// dialog prefix de-dup: the dialog box label already reads "Sari (fixer):"
const _showDialogRC = showDialog;
showDialog = function (text) { _showDialogRC(String(text).replace(/^Sari:\s*/, '')); };
