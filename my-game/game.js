
// --- Performance Scratchpad (Zero per-frame allocations) ---
const _scratchVec1 = new THREE.Vector3();
const _scratchVec2 = new THREE.Vector3();
const _scratchCamTarget = new THREE.Vector3();
const _scratchRayOrigin = new THREE.Vector3();

// --- FPS & Frame Time Tracker ---
let frameCount = 0;
let lastFpsUpdate = performance.now();
let lastFrameTime = performance.now();
let curFps = 60;
let curFrameMs = 16.6;
const fpsElem = document.getElementById('fps-counter');
const frameTimeElem = document.getElementById('frametime-counter');
const renderScaleElem = document.getElementById('render-scale-counter');
// Spa Racing & Pursuit Engine - Three.js

// Game State
const state = {
  mode: 'car', // 'car' or 'foot'
  car: {
    speed: 0,
    maxSpeed: 210, // km/h
    accel: 55,
    brakePower: 90,
    reverseSpeed: 40,
    friction: 0.985,
    offRoadFriction: 0.965,
    steerAngle: 0,
    steerMax: 0.035,
    heading: 0,
    position: new THREE.Vector3(0, 1.0, 0),
    normal: new THREE.Vector3(0, 1, 0),
    gear: 'N',
    isOnRoad: true
  },
  player: {
    position: new THREE.Vector3(2, 0, 0),
    heading: 0,
    speed: 0,
    walkSpeed: 9.0, // m/s (~32 km/h sprint)
    walkCycle: 0
  },
  lapStartTime: Date.now()
};

const input = {
  gas: false,
  brake: false,
  left: false,
  right: false
};
const keyboardInput = { gas: false, brake: false, left: false, right: false };
const stickInput = { x: 0, y: 0, active: false };
let cameraOrbitYaw = 0;
let cameraOrbitPitch = 0;
const pointerInputCounts = { gas: 0, brake: 0, left: 0, right: 0 };
const activePointers = new Map();
const inputKeys = Object.keys(input);

function refreshInput(key) {
  input[key] = keyboardInput[key] || pointerInputCounts[key] > 0;
}

function releaseAllInputs() {
  activePointers.forEach(({ element }, pointerId) => {
    if (element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  });
  activePointers.clear();

  for (const key of inputKeys) {
    keyboardInput[key] = false;
    pointerInputCounts[key] = 0;
    refreshInput(key);
  }

  document.querySelectorAll('.control-btn.active').forEach((element) => {
    element.classList.remove('active');
  });
}

// Scene setup
const container = document.getElementById('game-container');
const canvas = document.getElementById('game-canvas');
const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const isMobileDevice = hasCoarsePointer || 'ontouchstart' in window;
const maxDevicePixelRatio = isMobileDevice ? 1 : 1.25;
const minMobileRenderScale = 0.5;
let renderScale = isMobileDevice ? 0.8 : 1;
let lastQualityCheck = performance.now();
let stableFrameTimeSince = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7fb5e6);
scene.fog = new THREE.Fog(0x7fb5e6, 250, 750);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 750);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: false,
    powerPreference: 'high-performance',
    precision: 'mediump'
  });
} catch (error) {
  const overlay = document.getElementById('loading-overlay');
  const message = document.getElementById('loading-text');
  if (overlay) {
    overlay.classList.add('webgl-error');
    overlay.setAttribute('role', 'alert');
  }
  if (message) message.textContent = '3D graphics are unavailable. Enable WebGL to play.';
  document.querySelector('.spinner')?.remove();
  throw error;
}

renderer.shadowMap.enabled = false;
// Three.js sorts opaque objects front-to-back and transparent objects back-to-front.
// Keep the single forward pass TBDR-friendly without a bandwidth-heavy depth pre-pass.
renderer.sortObjects = true;

function applyRenderScale() {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio) * renderScale);
  renderer.setSize(width, height, false);
  if (renderScaleElem) renderScaleElem.textContent = `RES ${Math.round(renderScale * 100)}%`;
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function adaptMobileRenderScale(now) {
  if (!isMobileDevice || now - lastQualityCheck < 1000) return;
  lastQualityCheck = now;

  // Frame interval is a CPU+GPU frame-time signal (not a GPU timer query).
  // Reduce resolution quickly when sustained frame time misses mobile budgets.
  const scaleStep = curFrameMs > 33 ? 0.1 : curFrameMs > 22 ? 0.05 : 0;
  if (scaleStep > 0 && renderScale > minMobileRenderScale) {
    renderScale = Math.max(minMobileRenderScale, renderScale - scaleStep);
    stableFrameTimeSince = 0;
    applyRenderScale();
    return;
  }

  // Recover slowly to avoid visible quality oscillation. HTML HUD stays native-resolution.
  if (curFrameMs < 18 && renderScale < 1) {
    if (stableFrameTimeSince === 0) stableFrameTimeSince = now;
    if (now - stableFrameTimeSince >= 10000) {
      renderScale = Math.min(1, renderScale + 0.025);
      stableFrameTimeSince = now;
      applyRenderScale();
    }
    return;
  }

  stableFrameTimeSince = 0;
}

applyRenderScale();

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xfff8e7, 1.25);
sun.position.set(150, 300, 100);
sun.castShadow = false;
scene.add(sun);

// --- Visual Models ---

// 1. Car Object
const carGroup = new THREE.Group();
scene.add(carGroup);

function createCarMesh() {
  const car = new THREE.Group();

  // Chassis
  const bodyGeo = new THREE.BoxGeometry(1.9, 0.55, 4.2);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xd91b1b });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);

  // Cabin
  const cabinGeo = new THREE.BoxGeometry(1.5, 0.45, 2.0);
  const cabinMat = new THREE.MeshLambertMaterial({ color: 0x111625 });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 0.95, -0.2);
  cabin.castShadow = true;
  car.add(cabin);

  // Spoiler
  const spoilerWing = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.08, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x111111 })
  );
  spoilerWing.position.set(0, 1.1, 1.9);
  spoilerWing.castShadow = true;
  car.add(spoilerWing);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const wheelPositions = [
    [-0.95, 0.38, 1.3],
    [0.95, 0.38, 1.3],
    [-0.95, 0.38, -1.3],
    [0.95, 0.38, -1.3]
  ];

  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(...pos);
    wheel.castShadow = true;
    car.add(wheel);
  });

  return car;
}

const carVisual = createCarMesh();
carGroup.add(carVisual);

// 2. Player Humanoid Character
const playerGroup = new THREE.Group();
playerGroup.visible = false;
scene.add(playerGroup);

let leftArmMesh, rightArmMesh, leftLegMesh, rightLegMesh;

function createPlayerCharacter() {
  const p = new THREE.Group();

  // Torso / Jacket
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.8, 0.35),
    new THREE.MeshLambertMaterial({ color: 0x2563eb })
  );
  torso.position.y = 1.1;
  torso.castShadow = true;
  p.add(torso);

  // Head / Helmet
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshLambertMaterial({ color: 0x1f2937 })
  );
  head.position.y = 1.7;
  head.castShadow = true;
  p.add(head);

  // Visor
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.12, 0.15),
    new THREE.MeshLambertMaterial({ color: 0xf59e0b })
  );
  visor.position.set(0, 1.7, -0.18);
  p.add(visor);

  // Limbs
  const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
  const armMat = new THREE.MeshLambertMaterial({ color: 0x1d4ed8 });
  
  leftArmMesh = new THREE.Mesh(armGeo, armMat);
  leftArmMesh.position.set(-0.42, 1.05, 0);
  p.add(leftArmMesh);

  rightArmMesh = new THREE.Mesh(armGeo, armMat);
  rightArmMesh.position.set(0.42, 1.05, 0);
  p.add(rightArmMesh);

  const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.22);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x111827 });

  leftLegMesh = new THREE.Mesh(legGeo, legMat);
  leftLegMesh.position.set(-0.18, 0.4, 0);
  p.add(leftLegMesh);

  rightLegMesh = new THREE.Mesh(legGeo, legMat);
  rightLegMesh.position.set(0.18, 0.4, 0);
  p.add(rightLegMesh);

  return p;
}

const playerVisual = createPlayerCharacter();
playerGroup.add(playerVisual);

// No giant fallback ground plane: it covered the actual world with a flat green sheet.
// If the track is unavailable, show the sky/fog rather than a misleading green void.

// --- Track & Environment Loading ---
const loader = new THREE.GLTFLoader();
const trackColliders = [];
const colliderGrid = new Map();
const unindexedColliders = [];
const colliderGridCellSize = 64;
let colliderQuerySequence = 0;
let trackLoaded = false;

const trackPaths = [
  'assets/track/track.glb',
  'assets/track/scene.gltf'
];

function tryLoadTrack(index = 0) {
  if (index >= trackPaths.length) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.opacity = '0';
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 500);
    return;
  }

  loader.load(
    trackPaths[index],
    (gltf) => {
      console.log('Spa track loaded successfully:', trackPaths[index]);
      const trackModel = gltf.scene;
      
      trackModel.updateMatrixWorld(true);
      trackModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          if (child.geometry) {
            child.geometry.computeBoundingBox();
            const wBox = new THREE.Box3().copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
            child.userData.worldBox = wBox;
          }

          const mat = child.material;
          const mats = Array.isArray(mat) ? mat : [mat];
          let isFoliageOrObstacle = false;

          // Mobile-grade materials: replace costly PBR (MeshStandardMaterial) with
          // per-vertex Lambert shading to cut fragment shader cost on phone GPUs.
          const converted = mats.map((m) => {
            if (!m) return m;
            const matName = (m.name || '').toLowerCase();
            const isFoliage = matName.includes('tree') || matName.includes('leaf') || matName.includes('veg') || matName.includes('fence') || matName.includes('alpha');
            if (isFoliage) isFoliageOrObstacle = true;

            if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
              return new THREE.MeshLambertMaterial({
                name: m.name,
                map: m.map || null,
                color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
                transparent: false,
                alphaTest: (isFoliage || m.transparent) ? 0.5 : 0,
                depthWrite: true,
                side: m.side,
                vertexColors: m.vertexColors
              });
            }
            if (isFoliage) {
              m.transparent = false;
              m.alphaTest = 0.5;
              m.depthWrite = true;
            }
            return m;
          });
          child.material = Array.isArray(mat) ? converted : converted[0];

          // Only road, terrain, grass, curbs, and asphalt should be ground colliders
          if (!isFoliageOrObstacle) {
            trackColliders.push(child);
            addColliderToGrid(child);
          }
        }
      });
      scene.add(trackModel);
      trackLoaded = true;

      // Find initial ground height for car
      snapToSurface(state.car.position, 1.0);

      const overlay = document.getElementById('loading-overlay');
      if (overlay) overlay.style.opacity = '0';
      setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 500);
    },
    undefined,
    () => {
      tryLoadTrack(index + 1);
    }
  );
}

tryLoadTrack(0);

// --- Optimized Surface Raycasting & Collision Physics ---
const downRay = new THREE.Raycaster();
const downDir = new THREE.Vector3(0, -1, 0);
const horizRay = new THREE.Raycaster();
const nearbyColliders = [];
const candidateBox = new THREE.Box3();

function getColliderCell(cellX, cellZ, create = false) {
  let row = colliderGrid.get(cellX);
  if (!row) {
    if (!create) return null;
    row = new Map();
    colliderGrid.set(cellX, row);
  }

  let cell = row.get(cellZ);
  if (!cell && create) {
    cell = [];
    row.set(cellZ, cell);
  }
  return cell || null;
}

function addColliderToGrid(mesh) {
  const box = mesh.userData.worldBox;
  if (!box) {
    unindexedColliders.push(mesh);
    return;
  }

  const minCellX = Math.floor(box.min.x / colliderGridCellSize);
  const maxCellX = Math.floor(box.max.x / colliderGridCellSize);
  const minCellZ = Math.floor(box.min.z / colliderGridCellSize);
  const maxCellZ = Math.floor(box.max.z / colliderGridCellSize);
  const coveredCells = (maxCellX - minCellX + 1) * (maxCellZ - minCellZ + 1);

  // Keep giant terrain meshes out of the grid; checking a short fallback list
  // is cheaper than inserting one mesh into hundreds of cells.
  if (!Number.isFinite(coveredCells) || coveredCells > 256) {
    unindexedColliders.push(mesh);
    return;
  }

  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      getColliderCell(cellX, cellZ, true).push(mesh);
    }
  }
}

function addNearbyCollider(mesh, queryId) {
  if (mesh.userData.lastColliderQuery === queryId) return;
  mesh.userData.lastColliderQuery = queryId;
  if (!mesh.userData.worldBox || candidateBox.intersectsBox(mesh.userData.worldBox)) {
    nearbyColliders.push(mesh);
  }
}

function getNearbyColliders(pos, radius = 40) {
  nearbyColliders.length = 0;
  candidateBox.min.set(pos.x - radius, pos.y - 70, pos.z - radius);
  candidateBox.max.set(pos.x + radius, pos.y + 70, pos.z + radius);

  const queryId = ++colliderQuerySequence;
  for (let i = 0; i < unindexedColliders.length; i++) {
    addNearbyCollider(unindexedColliders[i], queryId);
  }

  const minCellX = Math.floor(candidateBox.min.x / colliderGridCellSize);
  const maxCellX = Math.floor(candidateBox.max.x / colliderGridCellSize);
  const minCellZ = Math.floor(candidateBox.min.z / colliderGridCellSize);
  const maxCellZ = Math.floor(candidateBox.max.z / colliderGridCellSize);
  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      const cell = getColliderCell(cellX, cellZ);
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        addNearbyCollider(cell[i], queryId);
      }
    }
  }
  return nearbyColliders;
}

function snapToSurface(pos, heightOffset = 0.5) {
  if (trackColliders.length === 0) return null;
  
  const pool = getNearbyColliders(pos, 45);
  if (pool.length === 0) return null;

  _scratchRayOrigin.set(pos.x, pos.y + 35, pos.z);
  const rayOrigin = _scratchRayOrigin;
  downRay.set(rayOrigin, downDir);
  downRay.far = 100;

  const hits = downRay.intersectObjects(pool, false);
  if (hits.length > 0) {
    const hit = hits[0];
    pos.y = hit.point.y + heightOffset;
    return hit;
  }
  return null;
}

function checkBarrierCollision(origin, moveDir, dist = 1.8) {
  if (trackColliders.length === 0) return false;

  const pool = getNearbyColliders(origin, Math.max(dist + 5, 20));
  if (pool.length === 0) return false;

  _scratchRayOrigin.set(origin.x, origin.y + 0.6, origin.z);
  horizRay.set(_scratchRayOrigin, moveDir);
  horizRay.far = dist;

  const hits = horizRay.intersectObjects(pool, false);
  if (hits.length > 0) {
    const hit = hits[0];
    if (hit.face && Math.abs(hit.face.normal.y) < 0.45) {
      return hit;
    }
  }
  return false;
}

// World edge boundaries
const WORLD_BOUNDS = { minX: -1900, maxX: 1400, minZ: -3500, maxZ: 2550 };
function enforceWorldPerimeter(pos) {
  if (pos.x < WORLD_BOUNDS.minX) pos.x = WORLD_BOUNDS.minX;
  if (pos.x > WORLD_BOUNDS.maxX) pos.x = WORLD_BOUNDS.maxX;
  if (pos.z < WORLD_BOUNDS.minZ) pos.z = WORLD_BOUNDS.minZ;
  if (pos.z > WORLD_BOUNDS.maxZ) pos.z = WORLD_BOUNDS.maxZ;
}

// --- Mode Toggle: Car / Foot ---
const btnToggle = document.getElementById('btn-toggle-vehicle');
const modeVal = document.getElementById('mode-val');
const speedoBox = document.getElementById('speedo-box');
const gasButton = document.getElementById('btn-gas');
const brakeButton = document.getElementById('btn-brake');

function toggleMode() {
  releaseAllInputs();
  if (state.mode === 'car') {
    // Exit Car -> switch to on-foot
    state.mode = 'foot';
    state.car.speed = 0;

    // Spawn player to the left of the car
    const sideX = Math.cos(state.car.heading) * 2.2;
    const sideZ = -Math.sin(state.car.heading) * 2.2;
    state.player.position.set(state.car.position.x + sideX, state.car.position.y, state.car.position.z + sideZ);
    state.player.heading = state.car.heading;
    snapToSurface(state.player.position, 0.0);

    playerGroup.position.copy(state.player.position);
    playerGroup.rotation.y = state.player.heading;
    playerGroup.visible = true;

    if (btnToggle) {
      btnToggle.textContent = 'ENTER CAR';
      btnToggle.style.background = 'rgba(34, 197, 94, 0.85)';
    }
    if (modeVal) modeVal.textContent = 'ON FOOT';
    if (speedoBox) speedoBox.style.opacity = '0.3';
    if (gasButton) gasButton.textContent = 'RUN';
    if (brakeButton) brakeButton.textContent = 'BACK';
  } else {
    // Check distance to car
    const distToCar = state.player.position.distanceTo(state.car.position);
    if (distToCar <= 6.0) {
      // Enter Car
      state.mode = 'car';
      playerGroup.visible = false;

      if (btnToggle) {
        btnToggle.textContent = 'EXIT CAR';
        btnToggle.style.background = 'rgba(220, 38, 38, 0.85)';
      }
      if (modeVal) modeVal.textContent = 'IN CAR';
      if (speedoBox) speedoBox.style.opacity = '1';
      if (gasButton) gasButton.textContent = 'GAS';
      if (brakeButton) brakeButton.textContent = 'BRAKE';
    }
  }
}

if (btnToggle) {
  btnToggle.addEventListener('click', toggleMode);
}

// Input Handlers
function setupInput() {
  const bindPointer = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (activePointers.has(event.pointerId)) return;
      event.preventDefault();

      activePointers.set(event.pointerId, { key, element: el });
      pointerInputCounts[key]++;
      refreshInput(key);
      el.classList.add('active');
      el.setPointerCapture?.(event.pointerId);
    });

    const releasePointer = (event) => {
      const activePointer = activePointers.get(event.pointerId);
      if (!activePointer) return;
      if (event.cancelable) event.preventDefault();

      activePointers.delete(event.pointerId);
      pointerInputCounts[activePointer.key] = Math.max(0, pointerInputCounts[activePointer.key] - 1);
      refreshInput(activePointer.key);
      if (pointerInputCounts[activePointer.key] === 0) {
        activePointer.element.classList.remove('active');
      }
    };

    el.addEventListener('pointerup', releasePointer);
    el.addEventListener('pointercancel', releasePointer);
    el.addEventListener('lostpointercapture', releasePointer);
  };

  bindPointer('btn-gas', 'gas');
  bindPointer('btn-brake', 'brake');

  // Analog left stick: car steering, or relative movement while on foot.
  const stick = document.getElementById('steer-pad');
  const knob = document.getElementById('steer-knob');
  let stickPointerId = null;
  const updateStick = (event) => {
    if (!stick || event.pointerId !== stickPointerId) return;
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const radius = rect.width * 0.34;
    const length = Math.hypot(dx, dy);
    if (length > radius) { dx *= radius / length; dy *= radius / length; }
    stickInput.x = Math.max(-1, Math.min(1, dx / radius));
    stickInput.y = Math.max(-1, Math.min(1, dy / radius));
    stickInput.active = Math.hypot(stickInput.x, stickInput.y) > 0.12;
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.classList.toggle('active', stickInput.active);
  };
  const releaseStick = (event) => {
    if (event.pointerId !== stickPointerId) return;
    stickPointerId = null;
    stickInput.x = 0; stickInput.y = 0; stickInput.active = false;
    if (knob) knob.style.transform = 'translate(0px, 0px)';
    if (stick) stick.classList.remove('active');
  };
  if (stick) {
    stick.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      stickPointerId = event.pointerId;
      stick.setPointerCapture?.(event.pointerId);
      updateStick(event);
    });
    stick.addEventListener('pointermove', updateStick);
    stick.addEventListener('pointerup', releaseStick);
    stick.addEventListener('pointercancel', releaseStick);
    stick.addEventListener('lostpointercapture', releaseStick);
  }

  // Drag anywhere on the unobstructed game view to orbit the chase camera.
  let lookPointerId = null;
  let lastLookX = 0;
  let lastLookY = 0;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (lookPointerId !== null) return;
    event.preventDefault();
    lookPointerId = event.pointerId;
    lastLookX = event.clientX;
    lastLookY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== lookPointerId) return;
    const dx = event.clientX - lastLookX;
    const dy = event.clientY - lastLookY;
    lastLookX = event.clientX;
    lastLookY = event.clientY;
    cameraOrbitYaw -= dx * 0.005;
    cameraOrbitPitch = THREE.MathUtils.clamp(cameraOrbitPitch + dy * 0.004, -0.16, 0.58);
  });
  const releaseLook = (event) => { if (event.pointerId === lookPointerId) lookPointerId = null; };
  canvas.addEventListener('pointerup', releaseLook);
  canvas.addEventListener('pointercancel', releaseLook);
  canvas.addEventListener('lostpointercapture', releaseLook);

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const inputKey = key === 'arrowup' || key === 'w' ? 'gas'
      : key === 'arrowdown' || key === 's' ? 'brake'
        : key === 'arrowleft' || key === 'a' ? 'left'
          : key === 'arrowright' || key === 'd' ? 'right'
            : null;

    if (inputKey) {
      e.preventDefault();
      keyboardInput[inputKey] = true;
      refreshInput(inputKey);
    } else if (!e.repeat && (key === 'e' || key === 'f')) {
      toggleMode();
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    const inputKey = key === 'arrowup' || key === 'w' ? 'gas'
      : key === 'arrowdown' || key === 's' ? 'brake'
        : key === 'arrowleft' || key === 'a' ? 'left'
          : key === 'arrowright' || key === 'd' ? 'right'
            : null;
    if (!inputKey) return;
    keyboardInput[inputKey] = false;
    refreshInput(inputKey);
  });

  window.addEventListener('blur', releaseAllInputs);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAllInputs();
  });
}

setupInput();

// HUD Elements
const speedElem = document.getElementById('speedometer');
const gearElem = document.getElementById('gear-indicator');
const lapTimeElem = document.getElementById('lap-time');

function updateHUD(dt) {
  const kmh = Math.round(Math.abs(state.car.speed));
  if (speedElem) speedElem.textContent = state.mode === 'car' ? kmh : Math.round(state.player.speed * 3.6);

  if (gearElem) {
    if (state.mode === 'car') {
      if (state.car.speed < -1) state.car.gear = 'R';
      else if (kmh === 0) state.car.gear = 'N';
      else if (kmh < 45) state.car.gear = '1';
      else if (kmh < 85) state.car.gear = '2';
      else if (kmh < 130) state.car.gear = '3';
      else if (kmh < 170) state.car.gear = '4';
      else state.car.gear = '5';
      gearElem.textContent = state.car.gear;
    } else {
      gearElem.textContent = 'RUN';
    }
  }

  if (lapTimeElem) {
    const elapsed = Date.now() - state.lapStartTime;
    const mins = Math.floor(elapsed / 60000).toString().padStart(2, '0');
    const secs = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
    const ms = Math.floor((elapsed % 1000) / 10).toString().padStart(2, '0');
    lapTimeElem.textContent = `${mins}:${secs}.${ms}`;
  }
}

// Physics Loop
let lastTime = performance.now();
let animationFrameId = 0;

function animate(now) {
  animationFrameId = 0;
  if (document.hidden) return;
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (state.mode === 'car') {
    // --- CAR PHYSICS ---
    if (input.gas) {
      state.car.speed += state.car.accel * dt;
      if (state.car.speed > state.car.maxSpeed) state.car.speed = state.car.maxSpeed;
    } else if (input.brake) {
      if (state.car.speed > 5) {
        state.car.speed -= state.car.brakePower * dt;
      } else {
        state.car.speed -= 25 * dt;
        if (state.car.speed < -state.car.reverseSpeed) state.car.speed = -state.car.reverseSpeed;
      }
    } else {
      state.car.speed *= Math.pow(state.car.friction, dt * 60);
      if (Math.abs(state.car.speed) < 0.2) state.car.speed = 0;
    }

    // Steering
    const steerInput = stickInput.active ? stickInput.x : Number(input.left) - Number(input.right);
    const steerBlend = 1 - Math.exp(-7 * dt);
    state.car.steerAngle = THREE.MathUtils.lerp(state.car.steerAngle, steerInput, steerBlend);

    // Integrate yaw by delta time: predictable steering on both slow and fast phones.
    const speedFactor = Math.min(Math.abs(state.car.speed) / 55, 1);
    const turnDirection = state.car.speed >= 0 ? 1 : -1;
    state.car.heading += state.car.steerAngle * 1.15 * speedFactor * turnDirection * dt;

    // Proposed forward motion
    const forwardX = -Math.sin(state.car.heading);
    const forwardZ = -Math.cos(state.car.heading);
    const metersPerSec = (state.car.speed * 1000) / 3600;

    _scratchVec1.set(forwardX, 0, forwardZ).normalize();
    const moveVec = _scratchVec1;
    const barrierHit = checkBarrierCollision(state.car.position, moveVec, Math.abs(metersPerSec * dt) + 2.0);

    if (barrierHit) {
      // Barrier collision: bounce off wall, lose speed
      state.car.speed = -state.car.speed * 0.35;
    } else {
      state.car.position.x += forwardX * metersPerSec * dt;
      state.car.position.z += forwardZ * metersPerSec * dt;
    }

    // Snap to Spa track 3D elevation
    const groundHit = snapToSurface(state.car.position, 0.45);
    enforceWorldPerimeter(state.car.position);

    carGroup.position.copy(state.car.position);
    carGroup.rotation.y = state.car.heading;

    // Pitch/roll alignment with hill terrain (stabilized: prevent flipping)
    if (groundHit && groundHit.face && groundHit.face.normal.y > 0.65) {
      const normal = groundHit.face.normal;
      const targetPitch = Math.max(-0.25, Math.min(0.25, -normal.z * 0.6));
      const targetRoll = Math.max(-0.25, Math.min(0.25, normal.x * 0.6));
      carGroup.rotation.x = THREE.MathUtils.lerp(carGroup.rotation.x, targetPitch, 0.1);
      carGroup.rotation.z = THREE.MathUtils.lerp(carGroup.rotation.z, targetRoll, 0.1);
    } else {
      carGroup.rotation.x = THREE.MathUtils.lerp(carGroup.rotation.x, 0, 0.1);
      carGroup.rotation.z = THREE.MathUtils.lerp(carGroup.rotation.z, 0, 0.1);
    }

    // Smooth chase camera with touch-drag orbit.
    const camDistance = 8.5;
    const camPitch = 0.22 + cameraOrbitPitch;
    const camHeading = state.car.heading + cameraOrbitYaw;
    const horizontalDistance = Math.cos(camPitch) * camDistance;
    const focusY = state.car.position.y + 1.2;
    _scratchCamTarget.set(
      state.car.position.x + Math.sin(camHeading) * horizontalDistance,
      focusY + Math.sin(camPitch) * camDistance,
      state.car.position.z + Math.cos(camHeading) * horizontalDistance
    );
    camera.position.lerp(_scratchCamTarget, 1 - Math.exp(-8 * dt));
    camera.lookAt(state.car.position.x, focusY, state.car.position.z);

  } else {
    // --- ON-FOOT PLAYER PHYSICS ---
    const footX = stickInput.active ? stickInput.x : Number(input.right) - Number(input.left);
    const footY = stickInput.active ? -stickInput.y : Number(input.gas) - Number(input.brake) * 0.5;
    const footMagnitude = Math.min(1, Math.hypot(footX, footY));
    const moveDir = footMagnitude > 0.12 ? 1 : 0;
    state.player.speed = moveDir * state.player.walkSpeed * footMagnitude;

    if (moveDir !== 0) {
      state.player.walkCycle += dt * (8 + footMagnitude * 4);
      const swing = Math.sin(state.player.walkCycle) * 0.6;
      if (leftArmMesh) leftArmMesh.rotation.x = swing;
      if (rightArmMesh) rightArmMesh.rotation.x = -swing;
      if (leftLegMesh) leftLegMesh.rotation.x = -swing;
      if (rightLegMesh) rightLegMesh.rotation.x = swing;

      // Move relative to the current camera orbit, allowing forward/back and strafe.
      const viewHeading = state.player.heading + cameraOrbitYaw;
      const fwdX = -Math.sin(viewHeading), fwdZ = -Math.cos(viewHeading);
      const rightX = Math.cos(viewHeading), rightZ = -Math.sin(viewHeading);
      const moveX = rightX * footX - fwdX * footY;
      const moveZ = rightZ * footX - fwdZ * footY;
      _scratchVec1.set(moveX, 0, moveZ).normalize();
      const pMove = _scratchVec1;
      const pBarrier = checkBarrierCollision(state.player.position, pMove, 1.0);
      if (!pBarrier) {
        state.player.position.x += moveX * state.player.speed * dt;
        state.player.position.z += moveZ * state.player.speed * dt;
        state.player.heading = Math.atan2(-moveX, -moveZ);
      }
    } else {
      // Idle pose
      if (leftArmMesh) leftArmMesh.rotation.x = 0;
      if (rightArmMesh) rightArmMesh.rotation.x = 0;
      if (leftLegMesh) leftLegMesh.rotation.x = 0;
      if (rightLegMesh) rightLegMesh.rotation.x = 0;
    }

    snapToSurface(state.player.position, 0.0);
    enforceWorldPerimeter(state.player.position);

    playerGroup.position.copy(state.player.position);
    playerGroup.rotation.y = state.player.heading;

    // Check enter car button state
    const distToCar = state.player.position.distanceTo(state.car.position);
    if (btnToggle) {
      if (distToCar <= 6.0) {
        btnToggle.textContent = 'ENTER CAR';
        btnToggle.style.opacity = '1';
      } else {
        btnToggle.textContent = 'TOO FAR TO ENTER';
        btnToggle.style.opacity = '0.5';
      }
    }

    // Close third-person chase camera with the same drag-to-look orbit as driving.
    const pCamDist = 4.2;
    const pCamPitch = 0.24 + cameraOrbitPitch;
    const pCamHeading = state.player.heading + cameraOrbitYaw;
    const pHorizontalDistance = Math.cos(pCamPitch) * pCamDist;
    const pFocusY = state.player.position.y + 1.2;
    _scratchCamTarget.set(
      state.player.position.x + Math.sin(pCamHeading) * pHorizontalDistance,
      pFocusY + Math.sin(pCamPitch) * pCamDist,
      state.player.position.z + Math.cos(pCamHeading) * pHorizontalDistance
    );
    camera.position.lerp(_scratchCamTarget, 1 - Math.exp(-9 * dt));
    camera.lookAt(state.player.position.x, pFocusY, state.player.position.z);
  }

  // Measure FPS & Frame Time
  frameCount++;
  const frameMs = now - lastFrameTime;
  lastFrameTime = now;
  curFrameMs = (curFrameMs * 0.9) + (frameMs * 0.1);
  adaptMobileRenderScale(now);

  if (now - lastFpsUpdate >= 250) {
    curFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
    frameCount = 0;
    lastFpsUpdate = now;
    if (fpsElem) fpsElem.textContent = curFps + ' FPS';
    if (frameTimeElem) frameTimeElem.textContent = curFrameMs.toFixed(1) + ' ms';
    updateHUD(dt);
  }

  renderer.render(scene, camera);
  animationFrameId = requestAnimationFrame(animate);
}

function startAnimation() {
  if (animationFrameId === 0 && !document.hidden) {
    animationFrameId = requestAnimationFrame(animate);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (animationFrameId !== 0) cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
    return;
  }

  lastTime = performance.now();
  lastFrameTime = lastTime;
  lastFpsUpdate = lastTime;
  frameCount = 0;
  startAnimation();
});

startAnimation();

// Window resize
window.addEventListener('resize', applyRenderScale, { passive: true });
window.visualViewport?.addEventListener('resize', applyRenderScale, { passive: true });
