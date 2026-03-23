import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const WORLD_SIZE = 52;
const WORLD_HEIGHT = 28;
const WATER_LEVEL = 8;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.34;
const HOTBAR = [
  { id: 'grass', color: '#66bb6a', label: 'Grass' },
  { id: 'dirt', color: '#8d5a34', label: 'Dirt' },
  { id: 'stone', color: '#a3adb8', label: 'Stone' },
  { id: 'wood', color: '#8d6e63', label: 'Wood' },
  { id: 'glow', color: '#8ff6ff', label: 'Glow' },
];
const TYPE_MAP = Object.fromEntries(HOTBAR.map((entry) => [entry.id, entry]));
const DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const scene = new THREE.Scene();
scene.background = new THREE.Color('#87b8ff');
scene.fog = new THREE.FogExp2('#87b8ff', 0.02);
const raycaster = new THREE.Raycaster();
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

const hemiLight = new THREE.HemisphereLight('#cfe7ff', '#27313f', 1.15);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight('#fff8dd', 1.35);
sun.position.set(18, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -36;
sun.shadow.camera.right = 36;
sun.shadow.camera.top = 36;
sun.shadow.camera.bottom = -36;
scene.add(sun);
scene.add(sun.target);

const moon = new THREE.DirectionalLight('#93b4ff', 0.15);
moon.position.set(-18, 18, -12);
scene.add(moon);

const menu = document.getElementById('menu');
const playButton = document.getElementById('play-button');
const hotbarEl = document.getElementById('hotbar');
const toastEl = document.getElementById('toast');
const biomeLabel = document.getElementById('biome-label');
const altitudeLabel = document.getElementById('altitude-label');
const timeLabel = document.getElementById('time-label');
const seedValue = document.getElementById('seed-value');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const waterMaterial = new THREE.MeshStandardMaterial({
  color: '#5fb6ff',
  transparent: true,
  opacity: 0.6,
  roughness: 0.2,
  metalness: 0.05,
});
const waterMesh = new THREE.Mesh(new THREE.BoxGeometry(WORLD_SIZE, WATER_LEVEL * 2, WORLD_SIZE), waterMaterial);
waterMesh.position.set(WORLD_SIZE / 2 - 0.5, WATER_LEVEL - 0.5, WORLD_SIZE / 2 - 0.5);
waterMesh.receiveShadow = true;
scene.add(waterMesh);

const reticleTarget = new THREE.Mesh(
  new THREE.BoxGeometry(1.04, 1.04, 1.04),
  new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true }),
);
reticleTarget.visible = false;
scene.add(reticleTarget);

const materials = {
  grass: new THREE.MeshStandardMaterial({ color: '#69c36d', roughness: 0.95 }),
  dirt: new THREE.MeshStandardMaterial({ color: '#8d5a34', roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: '#a8b0bb', roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.8 }),
  glow: new THREE.MeshStandardMaterial({ color: '#8ff6ff', emissive: '#74f2ff', emissiveIntensity: 0.8, roughness: 0.3 }),
};

const instancedMeshes = new Map();
const blocks = new Map();
const instanceMaps = new Map();
const history = [];
const future = [];
let selectedSlot = 0;
let interactionTarget = null;
let toastTimer = 0;
let minimapZoom = 3;
let worldSeed = Math.floor(Math.random() * 999999);
let previousTime = performance.now();
let dayCycle = 0.18;
let needsRebuild = true;

const state = {
  velocity: new THREE.Vector3(),
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
  canJump: false,
  boostCooldown: 0,
};

function createHotbar() {
  hotbarEl.innerHTML = '';
  HOTBAR.forEach((entry, index) => {
    const slot = document.createElement('div');
    slot.className = `hotbar-slot ${index === selectedSlot ? 'active' : ''}`;
    slot.innerHTML = `
      <div class="swatch" style="background:${entry.color}"></div>
      <div>${index + 1}</div>
      <div class="hotbar-label">${entry.label}</div>
    `;
    hotbarEl.appendChild(slot);
  });
}

function setToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  toastTimer = 2.2;
}

function hash2d(x, z, seed) {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 0.017) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const zf = z - z0;

  const n00 = hash2d(x0, z0, seed);
  const n10 = hash2d(x0 + 1, z0, seed);
  const n01 = hash2d(x0, z0 + 1, seed);
  const n11 = hash2d(x0 + 1, z0 + 1, seed);

  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(n00, n10, u), THREE.MathUtils.lerp(n01, n11, u), v);
}

function fractalNoise(x, z, seed) {
  let total = 0;
  let frequency = 0.045;
  let amplitude = 1;
  let maxValue = 0;

  for (let octave = 0; octave < 5; octave += 1) {
    total += smoothNoise(x * frequency, z * frequency, seed + octave * 97.13) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }

  return total / maxValue;
}

function biomeAt(x, z) {
  const humidity = fractalNoise(x + 400, z - 200, worldSeed + 9);
  const heat = fractalNoise(x - 300, z + 80, worldSeed + 17);
  if (heat > 0.66 && humidity < 0.42) return 'Mesa';
  if (humidity > 0.68) return 'Forest';
  if (heat < 0.32) return 'Tundra';
  return 'Plains';
}

function terrainHeight(x, z) {
  const base = fractalNoise(x, z, worldSeed);
  const detail = fractalNoise(x + 120, z - 70, worldSeed + 33);
  const ridge = Math.abs(fractalNoise(x - 50, z + 90, worldSeed + 77) - 0.5) * 2;
  const biome = biomeAt(x, z);
  const biomeModifiers = {
    Plains: 0,
    Forest: 1.5,
    Mesa: 3.5,
    Tundra: -0.5,
  };

  const height = 5 + base * 10 + detail * 4 + ridge * 5 + biomeModifiers[biome];
  return Math.max(3, Math.min(WORLD_HEIGHT - 4, Math.floor(height)));
}

function setBlock(x, y, z, type, recordHistory = false) {
  const key = `${x},${y},${z}`;
  const previous = blocks.get(key) ?? null;
  if (type) {
    blocks.set(key, type);
  } else {
    blocks.delete(key);
  }

  if (recordHistory && previous !== type) {
    history.push({ x, y, z, previous, next: type });
    future.length = 0;
  }

  needsRebuild = true;
}

function generateWorld() {
  blocks.clear();
  history.length = 0;
  future.length = 0;
  seedValue.textContent = worldSeed;

  for (let x = 0; x < WORLD_SIZE; x += 1) {
    for (let z = 0; z < WORLD_SIZE; z += 1) {
      const height = terrainHeight(x, z);
      const biome = biomeAt(x, z);
      for (let y = 0; y <= height; y += 1) {
        let type = 'stone';
        if (y === height) {
          if (biome === 'Mesa') {
            type = 'wood';
          } else if (biome === 'Tundra') {
            type = 'stone';
          } else {
            type = 'grass';
          }
        } else if (y > height - 3) {
          type = biome === 'Mesa' ? 'wood' : 'dirt';
        }
        setBlock(x, y, z, type, false);
      }

      if (biome === 'Forest' && height > WATER_LEVEL + 1 && hash2d(x, z, worldSeed + 55) > 0.87) {
        const trunkHeight = 3 + Math.floor(hash2d(x + 5, z + 9, worldSeed + 72) * 3);
        for (let y = height + 1; y <= height + trunkHeight; y += 1) {
          setBlock(x, y, z, 'wood', false);
        }
        for (let ox = -2; ox <= 2; ox += 1) {
          for (let oz = -2; oz <= 2; oz += 1) {
            for (let oy = trunkHeight - 1; oy <= trunkHeight + 1; oy += 1) {
              const distance = Math.abs(ox) + Math.abs(oz) + Math.abs(oy - trunkHeight);
              if (distance < 4) {
                const leafY = height + oy;
                if (leafY < WORLD_HEIGHT - 1) {
                  setBlock(x + ox, leafY, z + oz, 'grass', false);
                }
              }
            }
          }
        }
      }

      if (hash2d(x - 2, z + 8, worldSeed + 101) > 0.992 && height > WATER_LEVEL) {
        setBlock(x, height + 1, z, 'glow', false);
      }
    }
  }

  placePlayer();
  drawMinimap();
  needsRebuild = true;
}

function isInsideWorld(x, y, z) {
  return x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < WORLD_HEIGHT;
}


function hasVisibleFace(x, y, z) {
  return DIRECTIONS.some(([dx, dy, dz]) => !blocks.get(`${x + dx},${y + dy},${z + dz}`));
}

function rebuildWorld() {
  if (!needsRebuild) return;
  needsRebuild = false;

  for (const mesh of instancedMeshes.values()) {
    worldGroup.remove(mesh);
  }
  instancedMeshes.clear();
  instanceMaps.clear();

  const counts = new Map();
  for (const [key, type] of blocks.entries()) {
    const [x, y, z] = key.split(',').map(Number);
    if (!isInsideWorld(x, y, z) || !hasVisibleFace(x, y, z)) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  for (const entry of HOTBAR) {
    const count = counts.get(entry.id) ?? 0;
    if (!count) continue;

    const mesh = new THREE.InstancedMesh(cubeGeometry, materials[entry.id], count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const reverse = [];
    let index = 0;
    for (const [key, type] of blocks.entries()) {
      if (type !== entry.id) continue;
      const [x, y, z] = key.split(',').map(Number);
      if (!hasVisibleFace(x, y, z)) continue;
      const matrix = new THREE.Matrix4().makeTranslation(x, y, z);
      mesh.setMatrixAt(index, matrix);
      reverse[index] = key;
      index += 1;
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.blockType = entry.id;
    instancedMeshes.set(entry.id, mesh);
    instanceMaps.set(mesh.uuid, reverse);
    worldGroup.add(mesh);
  }

  drawMinimap();
}

function placePlayer() {
  const centerX = Math.floor(WORLD_SIZE / 2);
  const centerZ = Math.floor(WORLD_SIZE / 2);
  const spawnY = terrainHeight(centerX, centerZ) + PLAYER_HEIGHT + 2.5;
  controls.getObject().position.set(centerX, spawnY, centerZ);
  state.velocity.set(0, 0, 0);
}

function raycastBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects([...instancedMeshes.values()], false);
  const hit = hits.find((entry) => entry.distance < 8);
  if (!hit || hit.instanceId == null) {
    interactionTarget = null;
    reticleTarget.visible = false;
    return;
  }

  const reverse = instanceMaps.get(hit.object.uuid);
  const key = reverse?.[hit.instanceId];
  if (!key) return;
  const [x, y, z] = key.split(',').map(Number);
  const normal = hit.face?.normal?.clone()?.applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))?.round() ?? new THREE.Vector3();

  interactionTarget = {
    key,
    x,
    y,
    z,
    place: {
      x: x + normal.x,
      y: y + normal.y,
      z: z + normal.z,
    },
  };

  reticleTarget.position.set(x, y, z);
  reticleTarget.visible = true;
}

function updateMinimapScale() {
  return minimapCanvas.width / (WORLD_SIZE / minimapZoom);
}

function drawMinimap() {
  minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  const scale = updateMinimapScale();
  const player = controls.getObject().position;
  const offsetX = player.x - WORLD_SIZE / (2 * minimapZoom);
  const offsetZ = player.z - WORLD_SIZE / (2 * minimapZoom);

  minimapCtx.fillStyle = '#0b1322';
  minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

  for (let x = 0; x < WORLD_SIZE; x += 1) {
    for (let z = 0; z < WORLD_SIZE; z += 1) {
      let topY = -1;
      let topType = null;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
        const type = blocks.get(`${x},${y},${z}`);
        if (type) {
          topY = y;
          topType = type;
          break;
        }
      }
      if (!topType) continue;
      const px = (x - offsetX) * scale;
      const pz = (z - offsetZ) * scale;
      if (px < -scale || pz < -scale || px > minimapCanvas.width || pz > minimapCanvas.height) continue;
      const color = TYPE_MAP[topType]?.color ?? '#ffffff';
      minimapCtx.fillStyle = color;
      minimapCtx.fillRect(px, pz, scale + 1, scale + 1);
      if (topY < WATER_LEVEL + 1) {
        minimapCtx.fillStyle = 'rgba(95, 182, 255, 0.35)';
        minimapCtx.fillRect(px, pz, scale + 1, scale + 1);
      }
    }
  }

  minimapCtx.strokeStyle = '#ffffff';
  minimapCtx.lineWidth = 2;
  minimapCtx.beginPath();
  minimapCtx.arc(minimapCanvas.width / 2, minimapCanvas.height / 2, 5, 0, Math.PI * 2);
  minimapCtx.stroke();

  const yaw = camera.rotation.y;
  minimapCtx.beginPath();
  minimapCtx.moveTo(minimapCanvas.width / 2, minimapCanvas.height / 2);
  minimapCtx.lineTo(
    minimapCanvas.width / 2 - Math.sin(yaw) * 18,
    minimapCanvas.height / 2 - Math.cos(yaw) * 18,
  );
  minimapCtx.stroke();
}

function movePlayer(delta) {
  const damping = Math.exp(-7 * delta);
  state.velocity.x *= damping;
  state.velocity.z *= damping;

  const direction = new THREE.Vector3(Number(state.right) - Number(state.left), 0, Number(state.backward) - Number(state.forward));
  if (direction.lengthSq() > 0) direction.normalize();

  const speed = state.sprint ? 12.5 : 8.3;
  state.velocity.x += direction.x * speed * delta;
  state.velocity.z += direction.z * speed * delta;
  state.velocity.y -= 24 * delta;
  state.boostCooldown = Math.max(0, state.boostCooldown - delta);

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const movement = new THREE.Vector3();
  movement.addScaledVector(forward, -state.velocity.z * delta);
  movement.addScaledVector(right, state.velocity.x * delta);

  const position = controls.getObject().position.clone();
  position.add(movement);

  const probeX = Math.round(position.x);
  const probeZ = Math.round(position.z);
  const feetY = Math.floor(position.y - PLAYER_HEIGHT);
  const headY = Math.floor(position.y - 0.2);

  const blocked = [feetY, headY].some((y) => {
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        const near = Math.abs(ox) + Math.abs(oz) <= 1;
        if (!near) continue;
        const type = blocks.get(`${probeX + ox},${y},${probeZ + oz}`);
        if (!type) continue;
        const dx = Math.abs(position.x - (probeX + ox));
        const dz = Math.abs(position.z - (probeZ + oz));
        if (dx < PLAYER_RADIUS && dz < PLAYER_RADIUS) return true;
      }
    }
    return false;
  });

  if (!blocked) {
    controls.getObject().position.x = position.x;
    controls.getObject().position.z = position.z;
  }

  controls.getObject().position.y += state.velocity.y * delta;
  const belowX = Math.round(controls.getObject().position.x);
  const belowZ = Math.round(controls.getObject().position.z);
  const floorY = Math.floor(controls.getObject().position.y - PLAYER_HEIGHT - 0.02);
  let standing = false;
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oz = -1; oz <= 1; oz += 1) {
      if (Math.abs(ox) + Math.abs(oz) > 1) continue;
      const block = blocks.get(`${belowX + ox},${floorY},${belowZ + oz}`);
      if (!block) continue;
      const top = floorY + 1 + PLAYER_HEIGHT;
      if (controls.getObject().position.y <= top) {
        controls.getObject().position.y = top;
        state.velocity.y = 0;
        standing = true;
      }
    }
  }
  state.canJump = standing;

  if (controls.getObject().position.y < 0) {
    placePlayer();
    setToast('Respawned at the center plateau');
  }
}

function updateHud() {
  const pos = controls.getObject().position;
  biomeLabel.textContent = biomeAt(Math.floor(pos.x), Math.floor(pos.z));
  altitudeLabel.textContent = pos.y.toFixed(1);
  const hours = Math.floor((dayCycle % 1) * 24);
  const minutes = Math.floor((((dayCycle % 1) * 24) % 1) * 60);
  timeLabel.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function updateSky(delta) {
  dayCycle = (dayCycle + delta * 0.018) % 1;
  const sunAngle = dayCycle * Math.PI * 2;
  const daylight = Math.max(0.08, Math.sin(sunAngle) * 0.85 + 0.22);

  scene.background = new THREE.Color().setHSL(0.58, 0.65, 0.18 + daylight * 0.5);
  scene.fog.color.copy(scene.background);
  sun.position.set(Math.cos(sunAngle) * 26, Math.sin(sunAngle) * 24, 8);
  sun.intensity = 0.25 + daylight * 1.5;
  moon.intensity = 0.08 + (1 - daylight) * 0.35;
  hemiLight.intensity = 0.2 + daylight;
}

function performBreak() {
  if (!interactionTarget) return;
  const { x, y, z } = interactionTarget;
  setBlock(x, y, z, null, true);
}

function performPlace() {
  if (!interactionTarget) return;
  const { x, y, z } = interactionTarget.place;
  if (!isInsideWorld(x, y, z)) return;
  const player = controls.getObject().position;
  const insidePlayer = Math.abs(player.x - x) < 0.8 && Math.abs(player.z - z) < 0.8 && Math.abs((player.y - PLAYER_HEIGHT / 2) - y) < 1.5;
  if (insidePlayer || blocks.get(`${x},${y},${z}`)) return;
  setBlock(x, y, z, HOTBAR[selectedSlot].id, true);
}

function undo() {
  const entry = history.pop();
  if (!entry) return;
  future.push(entry);
  setBlock(entry.x, entry.y, entry.z, entry.previous, false);
  setToast('Undo');
}

function redo() {
  const entry = future.pop();
  if (!entry) return;
  history.push(entry);
  setBlock(entry.x, entry.y, entry.z, entry.next, false);
  setToast('Redo');
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min(0.045, (now - previousTime) / 1000);
  previousTime = now;

  rebuildWorld();
  movePlayer(delta);
  raycastBlock();
  updateHud();
  updateSky(delta);
  drawMinimap();

  if (toastTimer > 0) {
    toastTimer -= delta;
    if (toastTimer <= 0) toastEl.classList.remove('visible');
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  drawMinimap();
});

playButton.addEventListener('click', () => {
  menu.classList.add('hidden');
  controls.lock(true);
});

controls.addEventListener('lock', () => menu.classList.add('hidden'));
controls.addEventListener('unlock', () => menu.classList.remove('hidden'));

window.addEventListener('keydown', (event) => {
  switch (event.code) {
    case 'KeyW': state.forward = true; break;
    case 'KeyS': state.backward = true; break;
    case 'KeyA': state.left = true; break;
    case 'KeyD': state.right = true; break;
    case 'ShiftLeft': state.sprint = true; break;
    case 'Space':
      if (state.canJump) {
        state.velocity.y = 10.5;
        state.canJump = false;
      }
      break;
    case 'KeyQ':
      if (state.boostCooldown <= 0) {
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        direction.y = 0;
        direction.normalize();
        state.velocity.x += -direction.x * 22;
        state.velocity.z += direction.z * 22;
        state.boostCooldown = 1.8;
        setToast('Boost dash');
      }
      break;
    case 'KeyZ': undo(); break;
    case 'KeyY': redo(); break;
    case 'KeyM':
      minimapZoom = minimapZoom === 3 ? 1.8 : minimapZoom === 1.8 ? 5 : 3;
      setToast(`Minimap zoom x${minimapZoom.toFixed(1)}`);
      break;
    case 'KeyR':
      worldSeed = Math.floor(Math.random() * 999999);
      generateWorld();
      setToast('Generated a fresh world');
      break;
    default:
      if (/Digit[1-5]/.test(event.code)) {
        selectedSlot = Number(event.code.replace('Digit', '')) - 1;
        createHotbar();
      }
      break;
  }
});

window.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'KeyW': state.forward = false; break;
    case 'KeyS': state.backward = false; break;
    case 'KeyA': state.left = false; break;
    case 'KeyD': state.right = false; break;
    case 'ShiftLeft': state.sprint = false; break;
    default: break;
  }
});

window.addEventListener('mousedown', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (event.button === 0) performBreak();
  if (event.button === 2) performPlace();
});

window.addEventListener('contextmenu', (event) => event.preventDefault());

createHotbar();
generateWorld();
animate();
