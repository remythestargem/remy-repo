
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
    position: new THREE.Vector3(0, -9.42, 0),
    verticalVelocity: 0,
    lastGroundPosition: new THREE.Vector3(0, -9.42, 0),
    normal: new THREE.Vector3(0, 1, 0),
    gear: 'N',
    isOnRoad: true
  },
  player: {
    position: new THREE.Vector3(2, 0, 0),
    verticalVelocity: 0,
    lastGroundPosition: new THREE.Vector3(2, 0, 0),
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
let modeTransition = null;
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
const maxDevicePixelRatio = 1.5;
const minMobileRenderScale = 0.85;
let renderScale = 1.0;
let lastQualityCheck = performance.now();
let stableFrameTimeSince = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6ba4d9);
scene.fog = new THREE.Fog(0x6ba4d9, 650, 2200);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.4, 2500);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: 'high-performance',
    precision: 'highp'
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
  const scaleStep = curFrameMs > 40 ? 0.1 : curFrameMs > 28 ? 0.05 : 0;
  if (scaleStep > 0 && renderScale > minMobileRenderScale) {
    renderScale = Math.max(minMobileRenderScale, renderScale - scaleStep);
    stableFrameTimeSince = 0;
    applyRenderScale();
    return;
  }

  // Recover slowly to avoid visible quality oscillation. HTML HUD stays native-resolution.
  if (curFrameMs < 20 && renderScale < 1) {
    if (stableFrameTimeSince === 0) stableFrameTimeSince = now;
    if (now - stableFrameTimeSince >= 5000) {
      renderScale = Math.min(1, renderScale + 0.05);
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
const hemiLight = new THREE.HemisphereLight(0x7fb5e6, 0x3d4a36, 0.45);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff8e7, 1.25);
sun.position.set(150, 300, 100);
sun.castShadow = false;
scene.add(sun);

// --- Visual Models ---

// 1. Car Object
const carGroup = new THREE.Group();
scene.add(carGroup);

// The supplied Mercedes W206 GLB replaces the temporary block-car placeholder.
// This root remains attached to the physics body so steering and movement apply to the real model.
const carVisual = new THREE.Group();
carGroup.add(carVisual);
let carModelReady = false;

function loadCarModel() {
  loader.load('assets/car/mercedes-w206.glb', (gltf) => {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z);

    // The source model's front points +Z; this game drives forward along -Z.
    const orientation = new THREE.Group();
    orientation.rotation.y = Math.PI;
    orientation.add(model);
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      const original = node.material;
      const sourceMaterials = Array.isArray(original) ? original : [original];
      const optimizedMaterials = sourceMaterials.map((material) => {
        if (!material) return material;
        const matName = (material.name || '').toLowerCase();

        let color = material.color ? material.color.clone() : new THREE.Color(0xffffff);
        let specular = new THREE.Color(0x666666);
        let shininess = 60;
        let emissive = new THREE.Color(0x000000);
        let transparent = !!material.transparent;
        let opacity = material.opacity !== undefined ? material.opacity : 1.0;

        if (matName.includes('paint')) {
          // Sleek Mercedes-Benz Iridium Silver metallic body paint
          color = new THREE.Color(0xb8bcc4);
          specular = new THREE.Color(0xffffff);
          shininess = 90;
        } else if (matName.includes('chrome') || matName.includes('trim') || matName.includes('metallic') || matName.includes('lettering')) {
          color = new THREE.Color(0xf0f0f0);
          specular = new THREE.Color(0xffffff);
          shininess = 120;
        } else if (matName.includes('glass')) {
          color = new THREE.Color(0x223344);
          transparent = true;
          opacity = 0.45;
          specular = new THREE.Color(0xffffff);
          shininess = 100;
        } else if (matName.includes('headlight') || matName.includes('drl') || matName.includes('lights_29')) {
          color = new THREE.Color(0xffffff);
          emissive = new THREE.Color(0x99bbdd);
          shininess = 100;
        } else if (matName.includes('tail') || matName.includes('brake') || matName.includes('red')) {
          color = new THREE.Color(0xcc1111);
          emissive = new THREE.Color(0x440000);
          shininess = 80;
        } else if (matName.includes('tire') || matName.includes('tyr') || matName.includes('wheel')) {
          color = new THREE.Color(0x1a1a1a);
          specular = new THREE.Color(0x333333);
          shininess = 15;
        } else if (color.r < 0.04 && color.g < 0.04 && color.b < 0.04 && !material.map) {
          color = new THREE.Color(0x242424);
        }

        return new THREE.MeshPhongMaterial({
          name: material.name,
          map: material.map || null,
          color: color,
          specular: specular,
          shininess: shininess,
          emissive: emissive,
          side: material.side,
          vertexColors: material.vertexColors,
          transparent: transparent,
          opacity: opacity,
          alphaTest: material.alphaTest || 0,
          depthWrite: !transparent
        });
      });
      node.material = Array.isArray(original) ? optimizedMaterials : optimizedMaterials[0];
    });
    carVisual.add(orientation);
    carModelReady = true;
    console.info('Mercedes W206 loaded and connected to vehicle controls');
  }, undefined, (error) => {
    console.error('Mercedes W206 failed to load:', error);
  });
}

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
const barrierGrid = new Map();
const unindexedBarriers = [];
const nearbyBarriers = [];
const colliderGridCellSize = 64;
let colliderQuerySequence = 0;
let barrierQuerySequence = 0;
let trackLoaded = false;
let trackWorldBounds = null;

const trackPaths = [
  'assets/track/track.glb',
  'assets/track/scene.gltf'
];

function tryLoadTrack(index = 0) {
  if (index >= trackPaths.length) {
    console.error('All track paths failed to load!');
    const msg = document.getElementById('loading-text');
    if (msg) msg.textContent = 'Track failed to load. Please check asset paths.';
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.background = 'rgba(0,0,0,0.85)';
      overlay.innerHTML = '<div style="color:#ef4444;font-size:1.2rem;text-align:center;padding:24px;">Failed to load Spa track asset.<br><span style="font-size:0.9rem;color:#cbd5e1;">Tap to dismiss</span></div>';
      overlay.onclick = () => { overlay.style.display = 'none'; };
    }
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
            const wBox = new THREE.Box3().setFromObject(child);
            child.userData.worldBox = wBox;
          }

          const mat = child.material;
          const mats = Array.isArray(mat) ? mat : [mat];
          const labels = `${child.name || ''} ${mats.map((m) => m?.name || '').join(' ')}`.toLowerCase();
          const isBarrier = /guard.?rail|barrier|concrete-barrie|fence|wall|building|grandstand|gstand/.test(labels);
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

          // Keep horizontal obstacles separate from ground surfaces. Vehicle collision
          // must never triangle-raycast the full high-poly track every moving frame.
          if (isBarrier && child.userData.worldBox) addBarrierToGrid(child);
          if (!isBarrier && !isFoliageOrObstacle) {
            trackColliders.push(child);
            addColliderToGrid(child);
          }
        }
      });
      scene.add(trackModel);
      trackLoaded = true;
      trackModel.updateMatrixWorld(true);
      trackWorldBounds = new THREE.Box3().setFromObject(trackModel);

      // Find an actual drivable surface before enabling vehicle physics. The
      // track asset's origin is not guaranteed to lie on the road surface.
      const spawnHit = findInitialCarSpawn();
      if (!spawnHit) {
        console.error('No drivable track surface found for vehicle spawn');
      }
      state.car.lastGroundPosition.copy(state.car.position);
      carGroup.position.copy(state.car.position);

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

loadCarModel();
tryLoadTrack(0);

// --- Optimized Surface Raycasting & Collision Physics ---
const downRay = new THREE.Raycaster();
const downDir = new THREE.Vector3(0, -1, 0);
const downRayHits = [];
const horizRay = new THREE.Raycaster();
const horizRayHits = [];
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

function addBarrierToGrid(mesh) {
  const box = mesh.userData.worldBox;
  if (!box) { unindexedBarriers.push(mesh); return; }
  const minX = Math.floor(box.min.x / colliderGridCellSize);
  const maxX = Math.floor(box.max.x / colliderGridCellSize);
  const minZ = Math.floor(box.min.z / colliderGridCellSize);
  const maxZ = Math.floor(box.max.z / colliderGridCellSize);
  const cells = (maxX - minX + 1) * (maxZ - minZ + 1);
  if (!Number.isFinite(cells) || cells > 64) { unindexedBarriers.push(mesh); return; }
  for (let x = minX; x <= maxX; x++) {
    let row = barrierGrid.get(x);
    if (!row) { row = new Map(); barrierGrid.set(x, row); }
    for (let z = minZ; z <= maxZ; z++) {
      let cell = row.get(z);
      if (!cell) { cell = []; row.set(z, cell); }
      cell.push(mesh);
    }
  }
}

function getNearbyBarriers(pos, radius) {
  nearbyBarriers.length = 0;
  candidateBox.min.set(pos.x - radius, pos.y - 3, pos.z - radius);
  candidateBox.max.set(pos.x + radius, pos.y + 3, pos.z + radius);
  const queryId = ++barrierQuerySequence;
  const add = (mesh) => {
    if (mesh.userData.barrierQuery === queryId) return;
    mesh.userData.barrierQuery = queryId;
    if (candidateBox.intersectsBox(mesh.userData.worldBox)) nearbyBarriers.push(mesh);
  };
  for (let i = 0; i < unindexedBarriers.length; i++) add(unindexedBarriers[i]);
  const minX = Math.floor(candidateBox.min.x / colliderGridCellSize);
  const maxX = Math.floor(candidateBox.max.x / colliderGridCellSize);
  const minZ = Math.floor(candidateBox.min.z / colliderGridCellSize);
  const maxZ = Math.floor(candidateBox.max.z / colliderGridCellSize);
  for (let x = minX; x <= maxX; x++) {
    const row = barrierGrid.get(x);
    if (!row) continue;
    for (let z = minZ; z <= maxZ; z++) {
      const cell = row.get(z);
      if (cell) for (let i = 0; i < cell.length; i++) add(cell[i]);
    }
  }
  return nearbyBarriers;
}

function addNearbyCollider(mesh, queryId) {
  if (mesh.userData.lastColliderQuery === queryId) return;
  mesh.userData.lastColliderQuery = queryId;
  if (!mesh.userData.worldBox || candidateBox.intersectsBox(mesh.userData.worldBox)) {
    nearbyColliders.push(mesh);
  }
}

function getNearbyColliders(pos, radius = 40, verticalRange = 15) {
  nearbyColliders.length = 0;
  candidateBox.min.set(pos.x - radius, pos.y - verticalRange, pos.z - radius);
  candidateBox.max.set(pos.x + radius, pos.y + verticalRange, pos.z + radius);

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

function raycastSurface(pos) {
  if (trackColliders.length === 0) return null;
  const pool = getNearbyColliders(pos, 6);
  if (pool.length === 0) return null;
  _scratchRayOrigin.set(pos.x, pos.y + 20, pos.z);
  downRay.set(_scratchRayOrigin, downDir);
  downRay.far = 50;
  downRayHits.length = 0;
  downRay.intersectObjects(pool, false, downRayHits);
  for (let i = 0; i < downRayHits.length; i++) {
    const h = downRayHits[i];
    if (!h.face) return h;
    const wn = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (wn.y > 0.35) return h;
  }
  return null;
}

function snapToSurface(pos, heightOffset = 0.5) {
  const hit = raycastSurface(pos);
  if (hit) pos.y = hit.point.y + heightOffset;
  return hit;
}

function findInitialCarSpawn() {
  const originX = VEHICLE_CONFIG.initialPosition.x;
  const originZ = VEHICLE_CONFIG.initialPosition.z;
  const highY = 60;
  const candidates = [
    { x: originX, z: originZ },
    { x: -322.0, z: -760.0 },
    { x: -318.0, z: -740.0 },
    { x: -310.0, z: -720.0 },
    { x: -302.0, z: -700.0 }
  ];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    downRay.set(new THREE.Vector3(c.x, highY, c.z), downDir);
    downRay.far = 80;
    downRayHits.length = 0;
    downRay.intersectObjects(trackColliders, false, downRayHits);
    for (let j = 0; j < downRayHits.length; j++) {
      const hit = downRayHits[j];
      const wn = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
      if (!wn || wn.y > 0.35) {
        state.car.position.set(hit.point.x, hit.point.y + 0.06, hit.point.z);
        state.car.heading = VEHICLE_CONFIG.initialHeading;
        state.car.verticalVelocity = 0;
        state.car.unsupportedTime = 0;
        state.car.lastGroundPosition.copy(state.car.position);
        console.info('Vehicle spawned on Spa starting grid at:', state.car.position.toArray());
        return hit;
      }
    }
  }

  state.car.position.copy(VEHICLE_CONFIG.initialPosition);
  state.car.heading = VEHICLE_CONFIG.initialHeading;
  state.car.lastGroundPosition.copy(state.car.position);
  console.info('Vehicle defaulted to Spa starting grid:', state.car.position.toArray());
  return null;
}

// Follow the irregular track surface, applying gravity while airborne and landing
// cleanly rather than teleporting vertically to every newly sampled triangle.
function settleActorOnSurface(pos, actor, heightOffset, dt) {
  const hit = raycastSurface(pos);
  if (!hit) {
    actor.verticalVelocity -= 24 * dt;
    pos.y += actor.verticalVelocity * dt;
    if (pos.y < actor.lastGroundPosition.y - 12) {
      pos.copy(actor.lastGroundPosition);
      actor.verticalVelocity = 0;
      actor.speed = 0;
    }
    return null;
  }
  const groundY = hit.point.y + heightOffset;
  if (pos.y > groundY + 0.08) {
    actor.verticalVelocity -= 24 * dt;
    pos.y = Math.max(groundY, pos.y + actor.verticalVelocity * dt);
  } else {
    pos.y = groundY;
    actor.verticalVelocity = 0;
  }
  if (pos.y <= groundY + 0.001) actor.lastGroundPosition.set(pos.x, pos.y, pos.z);
  return hit;
}

function segmentEntersExpandedBox2D(startX, startZ, endX, endZ, box, radius) {
  const minX = box.min.x - radius;
  const maxX = box.max.x + radius;
  const minZ = box.min.z - radius;
  const maxZ = box.max.z + radius;
  // If an exported curb/rail box already contains the spawn point, let the
  // vehicle leave it instead of pinning the car at zero speed.
  if (startX >= minX && startX <= maxX && startZ >= minZ && startZ <= maxZ) return false;
  let enter = 0;
  let exit = 1;
  const dx = endX - startX;
  const dz = endZ - startZ;
  if (Math.abs(dx) < 1e-7) {
    if (startX < minX || startX > maxX) return false;
  } else {
    let a = (minX - startX) / dx;
    let b = (maxX - startX) / dx;
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a);
    exit = Math.min(exit, b);
  }
  if (Math.abs(dz) < 1e-7) {
    if (startZ < minZ || startZ > maxZ) return false;
  } else {
    let a = (minZ - startZ) / dz;
    let b = (maxZ - startZ) / dz;
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a);
    exit = Math.min(exit, b);
  }
  return exit >= enter && exit >= 0 && enter <= 1 && enter > 0.015;
}

const _barrierRay = new THREE.Raycaster();
const _barrierRayHits = [];

function checkBarrierCollision(origin, moveDir, dist = 1.8) {
  const pool = getNearbyBarriers(origin, dist + 2.0);
  if (pool.length === 0) return false;
  _scratchRayOrigin.set(origin.x, origin.y + 0.5, origin.z);
  _barrierRay.set(_scratchRayOrigin, moveDir);
  _barrierRay.far = Math.max(1.2, dist);
  _barrierRayHits.length = 0;
  _barrierRay.intersectObjects(pool, false, _barrierRayHits);
  return _barrierRayHits.length > 0 ? _barrierRayHits[0] : false;
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
  if (modeTransition) return;
  releaseAllInputs();
  if (state.mode === 'car') {
    // Exit beside the driver's door with a short, visible step-out transition.
    state.car.speed = 0;
    const sideX = Math.cos(state.car.heading) * 2.25;
    const sideZ = -Math.sin(state.car.heading) * 2.25;
    const start = state.car.position.clone();
    const target = new THREE.Vector3(state.car.position.x + sideX, state.car.position.y, state.car.position.z + sideZ);
    snapToSurface(target, 0.0);
    state.player.position.copy(start);
    state.player.heading = state.car.heading;
    state.player.verticalVelocity = 0;
    playerGroup.position.copy(start);
    playerGroup.rotation.y = state.player.heading;
    playerGroup.scale.setScalar(0.16);
    playerGroup.visible = true;
    state.mode = 'foot';
    modeTransition = { kind: 'exit', elapsed: 0, duration: 0.62, from: start, to: target };
    if (btnToggle) { btnToggle.textContent = 'EXITING...'; btnToggle.style.background = 'rgba(220, 38, 38, 0.85)'; }
    if (modeVal) modeVal.textContent = 'EXITING';
    if (speedoBox) speedoBox.style.opacity = '0.3';
    if (gasButton) gasButton.textContent = 'RUN';
    if (brakeButton) brakeButton.textContent = 'BACK';
  } else {
    const distToCar = state.player.position.distanceTo(state.car.position);
    if (distToCar > 6.0) return;
    // Walk to the driver's door before disappearing into the cabin.
    const door = new THREE.Vector3(
      state.car.position.x + Math.cos(state.car.heading) * 1.8,
      state.car.position.y,
      state.car.position.z - Math.sin(state.car.heading) * 1.8
    );
    snapToSurface(door, 0.0);
    modeTransition = { kind: 'enter', elapsed: 0, duration: 0.62, from: state.player.position.clone(), to: door };
    if (btnToggle) btnToggle.textContent = 'ENTERING...';
    if (modeVal) modeVal.textContent = 'ENTERING';
  }
}

function updateModeTransition(dt) {
  if (!modeTransition) return;
  const tr = modeTransition;
  tr.elapsed = Math.min(tr.duration, tr.elapsed + dt);
  const linear = tr.elapsed / tr.duration;
  const t = linear * linear * (3 - 2 * linear);
  playerGroup.position.lerpVectors(tr.from, tr.to, t);
  state.player.position.copy(playerGroup.position);
  if (tr.kind === 'exit') {
    playerGroup.scale.setScalar(0.16 + 0.84 * t);
    const step = Math.sin(linear * Math.PI * 2) * 0.42;
    if (leftLegMesh) leftLegMesh.rotation.x = step;
    if (rightLegMesh) rightLegMesh.rotation.x = -step;
    if (leftArmMesh) leftArmMesh.rotation.x = -step * 0.65;
    if (rightArmMesh) rightArmMesh.rotation.x = step * 0.65;
  } else {
    playerGroup.scale.setScalar(Math.max(0.04, 1 - t));
    if (leftLegMesh) leftLegMesh.rotation.x = Math.sin(linear * Math.PI * 2) * 0.3;
    if (rightLegMesh) rightLegMesh.rotation.x = -Math.sin(linear * Math.PI * 2) * 0.3;
  }
  if (linear < 1) return;
  if (tr.kind === 'exit') {
    state.player.position.copy(tr.to);
    playerGroup.position.copy(tr.to);
    playerGroup.scale.setScalar(1);
    state.player.lastGroundPosition.copy(tr.to);
    if (btnToggle) { btnToggle.textContent = 'ENTER CAR'; btnToggle.style.background = 'rgba(34, 197, 94, 0.85)'; }
    if (modeVal) modeVal.textContent = 'ON FOOT';
  } else {
    state.mode = 'car';
    playerGroup.visible = false;
    playerGroup.scale.setScalar(1);
    state.car.position.y = Math.max(state.car.position.y, state.player.position.y);
    if (btnToggle) { btnToggle.textContent = 'EXIT CAR'; btnToggle.style.background = 'rgba(220, 38, 38, 0.85)'; }
    if (modeVal) modeVal.textContent = 'IN CAR';
    if (speedoBox) speedoBox.style.opacity = '1';
    if (gasButton) gasButton.textContent = 'GAS';
    if (brakeButton) brakeButton.textContent = 'BRAKE';
  }
  modeTransition = null;
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

  updateModeTransition(dt);

  if (!modeTransition && state.mode === 'car') {
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
    const steerBlend = 1 - Math.exp(-16 * dt);
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
    const previousCarX = state.car.position.x;
    const previousCarZ = state.car.position.z;
    const carTravel = Math.abs(metersPerSec * dt);
    const barrierHit = carTravel > 0.001
      ? checkBarrierCollision(state.car.position, moveVec, carTravel + 0.35)
      : false;

    if (barrierHit) {
      // Barrier collision: bounce off wall, lose speed
      state.car.speed = -state.car.speed * 0.35;
    } else {
      state.car.position.x += forwardX * metersPerSec * dt;
      state.car.position.z += forwardZ * metersPerSec * dt;
    }

    // Ground raycasts are only needed when the car actually moved.
    const carMoved = Math.abs(state.car.position.x - previousCarX) > 0.0001
      || Math.abs(state.car.position.z - previousCarZ) > 0.0001;
    let groundHit = null;
    if (carMoved) {
      groundHit = settleActorOnSurface(state.car.position, state.car, 0.06, dt);
      if (!groundHit) {
        // A single missed surface triangle can be a mesh seam. Keep horizontal
        // input responsive and let gravity act; only recover after sustained
        // unsupported travel / a real fall, rather than pinning the car each frame.
        state.car.unsupportedTime = (state.car.unsupportedTime || 0) + dt;
        if (state.car.unsupportedTime > 1.5
          || state.car.position.y < state.car.lastGroundPosition.y - 8) {
          state.car.position.copy(state.car.lastGroundPosition);
          state.car.verticalVelocity = 0;
          state.car.unsupportedTime = 0;
          state.car.speed = 0;
        }
      } else {
        state.car.unsupportedTime = 0;
        enforceWorldPerimeter(state.car.position);
      }
    }

    carGroup.position.copy(state.car.position);
    carGroup.rotation.y = state.car.heading;

    // Pitch/roll alignment with hill terrain (stabilized: prevent flipping)
    if (groundHit && groundHit.face) {
      const normal = groundHit.face.normal.clone().transformDirection(groundHit.object.matrixWorld);
      if (normal.y > 0.45) {
        const targetPitch = Math.max(-0.35, Math.min(0.35, -normal.z * 0.7));
        const targetRoll = Math.max(-0.35, Math.min(0.35, normal.x * 0.7));
        carGroup.rotation.x = THREE.MathUtils.lerp(carGroup.rotation.x, targetPitch, 0.15);
        carGroup.rotation.z = THREE.MathUtils.lerp(carGroup.rotation.z, targetRoll, 0.15);
      }
    } else {
      carGroup.rotation.x = THREE.MathUtils.lerp(carGroup.rotation.x, 0, 0.1);
      carGroup.rotation.z = THREE.MathUtils.lerp(carGroup.rotation.z, 0, 0.1);
    }

    // Smooth chase camera with touch-drag orbit - tuned close for cinematic racing feel.
    const camDistance = 5.4;
    const camPitch = 0.16 + cameraOrbitPitch;
    const camHeading = state.car.heading + cameraOrbitYaw;
    const horizontalDistance = Math.cos(camPitch) * camDistance;
    const focusY = state.car.position.y + 0.85;
    _scratchCamTarget.set(
      state.car.position.x + Math.sin(camHeading) * horizontalDistance,
      focusY + Math.sin(camPitch) * camDistance,
      state.car.position.z + Math.cos(camHeading) * horizontalDistance
    );
    camera.position.lerp(_scratchCamTarget, 1 - Math.exp(-15 * dt));
    camera.lookAt(state.car.position.x, focusY, state.car.position.z);

  } else if (!modeTransition) {
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
      const footTravel = state.player.speed * dt;
      const pBarrier = footTravel > 0.001
        ? checkBarrierCollision(state.player.position, pMove, footTravel + 0.8)
        : false;
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

    if (moveDir !== 0) {
      const groundHit = settleActorOnSurface(state.player.position, state.player, 0.0, dt);
      if (!groundHit) {
        state.player.position.copy(state.player.lastGroundPosition);
        state.player.speed = 0;
      } else {
        enforceWorldPerimeter(state.player.position);
      }
    }

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
    camera.position.lerp(_scratchCamTarget, 1 - Math.exp(-15 * dt));
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
