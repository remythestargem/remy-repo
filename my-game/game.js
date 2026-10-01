
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

// Scene setup
const container = document.getElementById('game-container');
const canvas = document.getElementById('game-canvas');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7fb5e6);
scene.fog = new THREE.Fog(0x7fb5e6, 250, 750);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 750);
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: false,
  powerPreference: 'high-performance',
  precision: 'mediump'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
renderer.shadowMap.enabled = false;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xfff8e7, 1.25);
sun.position.set(150, 300, 100);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 800;
const d = 160;
sun.shadow.camera.left = -d;
sun.shadow.camera.right = d;
sun.shadow.camera.top = d;
sun.shadow.camera.bottom = -d;
scene.add(sun);

// --- Visual Models ---

// 1. Car Object
const carGroup = new THREE.Group();
scene.add(carGroup);

function createCarMesh() {
  const car = new THREE.Group();

  // Chassis
  const bodyGeo = new THREE.BoxGeometry(1.9, 0.55, 4.2);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd91b1b, roughness: 0.25, metalness: 0.7 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);

  // Cabin
  const cabinGeo = new THREE.BoxGeometry(1.5, 0.45, 2.0);
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111625, roughness: 0.1, metalness: 0.9 });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 0.95, -0.2);
  cabin.castShadow = true;
  car.add(cabin);

  // Spoiler
  const spoilerWing = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.08, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 })
  );
  spoilerWing.position.set(0, 1.1, 1.9);
  spoilerWing.castShadow = true;
  car.add(spoilerWing);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
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
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.7 })
  );
  torso.position.y = 1.1;
  torso.castShadow = true;
  p.add(torso);

  // Head / Helmet
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3, metalness: 0.5 })
  );
  head.position.y = 1.7;
  head.castShadow = true;
  p.add(head);

  // Visor
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.12, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.1, metalness: 0.9 })
  );
  visor.position.set(0, 1.7, -0.18);
  p.add(visor);

  // Limbs
  const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 });
  
  leftArmMesh = new THREE.Mesh(armGeo, armMat);
  leftArmMesh.position.set(-0.42, 1.05, 0);
  p.add(leftArmMesh);

  rightArmMesh = new THREE.Mesh(armGeo, armMat);
  rightArmMesh.position.set(0.42, 1.05, 0);
  p.add(rightArmMesh);

  const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.22);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });

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

// Ground plane fallback (infinite green horizon)
const groundGeo = new THREE.PlaneGeometry(8000, 8000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x225522, roughness: 0.95 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

// --- Track & Environment Loading ---
const loader = new THREE.GLTFLoader();
const trackColliders = [];
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

function getNearbyColliders(pos, radius = 40) {
  nearbyColliders.length = 0;
  candidateBox.min.set(pos.x - radius, pos.y - 70, pos.z - radius);
  candidateBox.max.set(pos.x + radius, pos.y + 70, pos.z + radius);

  for (let i = 0; i < trackColliders.length; i++) {
    const mesh = trackColliders[i];
    if (mesh.userData.worldBox) {
      if (candidateBox.intersectsBox(mesh.userData.worldBox)) {
        nearbyColliders.push(mesh);
      }
    } else {
      nearbyColliders.push(mesh);
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

function toggleMode() {
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
    }
  }
}

if (btnToggle) {
  btnToggle.addEventListener('click', toggleMode);
  btnToggle.addEventListener('touchstart', (e) => { e.preventDefault(); toggleMode(); });
}

// Input Handlers
function setupInput() {
  const bindTouch = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    const start = (e) => { e.preventDefault(); input[key] = true; el.classList.add('active'); };
    const end = (e) => { e.preventDefault(); input[key] = false; el.classList.remove('active'); };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', end);
  };

  bindTouch('btn-gas', 'gas');
  bindTouch('btn-brake', 'brake');
  bindTouch('btn-steer-left', 'left');
  bindTouch('btn-steer-right', 'right');

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.gas = true;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.brake = true;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
    if (e.key === 'e' || e.key === 'E' || e.key === 'f' || e.key === 'F') toggleMode();
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.gas = false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.brake = false;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
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

function animate(now) {
  requestAnimationFrame(animate);
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
    if (input.left) {
      state.car.steerAngle = Math.min(state.car.steerAngle + 3.0 * dt, 1);
    } else if (input.right) {
      state.car.steerAngle = Math.max(state.car.steerAngle - 3.0 * dt, -1);
    } else {
      state.car.steerAngle *= 0.8;
    }

    const speedFactor = Math.min(Math.abs(state.car.speed) / 50, 1);
    const turnDirection = state.car.speed >= 0 ? 1 : -1;
    state.car.heading += state.car.steerAngle * state.car.steerMax * speedFactor * turnDirection;

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

    // Camera chase car
    const camDistance = 8.5;
    const camHeight = 3.2;
    const targetCamX = state.car.position.x + Math.sin(state.car.heading) * camDistance;
    const targetCamZ = state.car.position.z + Math.cos(state.car.heading) * camDistance;
    const targetCamY = state.car.position.y + camHeight;

    _scratchCamTarget.set(targetCamX, targetCamY, targetCamZ);
    camera.position.lerp(_scratchCamTarget, 0.15);
    camera.lookAt(state.car.position.x, state.car.position.y + 1.2, state.car.position.z);

  } else {
    // --- ON-FOOT PLAYER PHYSICS ---
    if (input.left) state.player.heading += 3.2 * dt;
    if (input.right) state.player.heading -= 3.2 * dt;

    let moveDir = 0;
    if (input.gas) moveDir = 1;
    else if (input.brake) moveDir = -0.5;

    state.player.speed = moveDir * state.player.walkSpeed;

    if (moveDir !== 0) {
      state.player.walkCycle += dt * 10;
      // Animate limbs
      const swing = Math.sin(state.player.walkCycle) * 0.6;
      if (leftArmMesh) leftArmMesh.rotation.x = swing;
      if (rightArmMesh) rightArmMesh.rotation.x = -swing;
      if (leftLegMesh) leftLegMesh.rotation.x = -swing;
      if (rightLegMesh) rightLegMesh.rotation.x = swing;

      const forwardX = -Math.sin(state.player.heading);
      const forwardZ = -Math.cos(state.player.heading);
      _scratchVec1.set(forwardX, 0, forwardZ).normalize();
      const pMove = _scratchVec1;

      const pBarrier = checkBarrierCollision(state.player.position, pMove, 1.0);
      if (!pBarrier) {
        state.player.position.x += forwardX * state.player.speed * dt;
        state.player.position.z += forwardZ * state.player.speed * dt;
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

    // Camera chase player
    const pCamDist = 4.2;
    const pCamHeight = 2.2;
    const targetCamX = state.player.position.x + Math.sin(state.player.heading) * pCamDist;
    const targetCamZ = state.player.position.z + Math.cos(state.player.heading) * pCamDist;
    const targetCamY = state.player.position.y + pCamHeight;

    _scratchCamTarget.set(targetCamX, targetCamY, targetCamZ);
    camera.position.lerp(_scratchCamTarget, 0.18);
    camera.lookAt(state.player.position.x, state.player.position.y + 1.2, state.player.position.z);
  }

  // Update light to follow active actor
  const activePos = state.mode === 'car' ? state.car.position : state.player.position;
  sun.position.set(activePos.x + 100, activePos.y + 200, activePos.z + 80);
  sun.target.position.copy(activePos);

  // Measure FPS & Frame Time
  frameCount++;
  const frameMs = now - lastFrameTime;
  lastFrameTime = now;
  curFrameMs = (curFrameMs * 0.9) + (frameMs * 0.1);

  if (now - lastFpsUpdate >= 250) {
    curFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
    frameCount = 0;
    lastFpsUpdate = now;
    if (fpsElem) fpsElem.textContent = curFps + ' FPS';
    if (frameTimeElem) frameTimeElem.textContent = curFrameMs.toFixed(1) + ' ms';
    updateHUD(dt);
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
