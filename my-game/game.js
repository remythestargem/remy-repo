// Spa Racing Engine - Three.js

const state = {
  speed: 0,
  maxSpeed: 210, // km/h
  accel: 55,
  brakePower: 90,
  reverseSpeed: 40,
  friction: 0.985,
  steering: 0,
  steerAngle: 0,
  steerMax: 0.035,
  heading: 0,
  position: new THREE.Vector3(0, 0.5, 0),
  gear: 'N',
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
scene.fog = new THREE.FogExp2(0x7fb5e6, 0.0018);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xfff8e7, 1.2);
sun.position.set(150, 220, 100);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 600;
const d = 120;
sun.shadow.camera.left = -d;
sun.shadow.camera.right = d;
sun.shadow.camera.top = d;
sun.shadow.camera.bottom = -d;
scene.add(sun);

// Car object container
const carGroup = new THREE.Group();
scene.add(carGroup);

// Procedural starter sports car
function createCarMesh() {
  const car = new THREE.Group();

  // Main chassis
  const bodyGeo = new THREE.BoxGeometry(1.9, 0.55, 4.2);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd91b1b, roughness: 0.25, metalness: 0.7 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);

  // Cabin / Windshield
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

// Ground plane
const groundGeo = new THREE.PlaneGeometry(2500, 2500);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Starter racetrack ribbon
function createFallbackCircuit() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.05, 0),
    new THREE.Vector3(0, 0.05, -200),
    new THREE.Vector3(120, 0.05, -350),
    new THREE.Vector3(300, 0.05, -300),
    new THREE.Vector3(320, 0.05, -100),
    new THREE.Vector3(220, 0.05, 80),
    new THREE.Vector3(80, 0.05, 120),
    new THREE.Vector3(-80, 0.05, 80)
  ], true);

  const points = curve.getPoints(250);
  const trackShape = new THREE.Shape();
  const width = 12;
  trackShape.moveTo(-width / 2, 0);
  trackShape.lineTo(width / 2, 0);

  const trackGeo = new THREE.BufferGeometry();
  const verts = [];
  const uvs = [];

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(width);

    verts.push(p1.x - side.x, 0.05, p1.z - side.z);
    verts.push(p1.x + side.x, 0.05, p1.z + side.z);
    verts.push(p2.x - side.x, 0.05, p2.z - side.z);

    verts.push(p1.x + side.x, 0.05, p1.z + side.z);
    verts.push(p2.x + side.x, 0.05, p2.z + side.z);
    verts.push(p2.x - side.x, 0.05, p2.z - side.z);
  }

  trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  trackGeo.computeVertexNormals();

  const trackMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.8 });
  const trackMesh = new THREE.Mesh(trackGeo, trackMat);
  trackMesh.receiveShadow = true;
  scene.add(trackMesh);
}

createFallbackCircuit();

// Try loading Spa-Francorchamps model from local assets if present
const loader = new THREE.GLTFLoader();
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
      console.log('Track model loaded successfully:', trackPaths[index]);
      const trackModel = gltf.scene;
      trackModel.traverse((child) => {
        if (child.isMesh) {
          child.receiveShadow = true;
          child.castShadow = true;
        }
      });
      scene.add(trackModel);
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
  const kmh = Math.round(Math.abs(state.speed));
  if (speedElem) speedElem.textContent = kmh;

  if (gearElem) {
    if (state.speed < -1) state.gear = 'R';
    else if (kmh === 0) state.gear = 'N';
    else if (kmh < 45) state.gear = '1';
    else if (kmh < 85) state.gear = '2';
    else if (kmh < 130) state.gear = '3';
    else if (kmh < 170) state.gear = '4';
    else state.gear = '5';
    gearElem.textContent = state.gear;
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

  // Acceleration / Braking
  if (input.gas) {
    state.speed += state.accel * dt;
    if (state.speed > state.maxSpeed) state.speed = state.maxSpeed;
  } else if (input.brake) {
    if (state.speed > 5) {
      state.speed -= state.brakePower * dt;
    } else {
      state.speed -= 25 * dt;
      if (state.speed < -state.reverseSpeed) state.speed = -state.reverseSpeed;
    }
  } else {
    state.speed *= Math.pow(state.friction, dt * 60);
    if (Math.abs(state.speed) < 0.2) state.speed = 0;
  }

  // Steering
  if (input.left) {
    state.steerAngle = Math.min(state.steerAngle + 3.0 * dt, 1);
  } else if (input.right) {
    state.steerAngle = Math.max(state.steerAngle - 3.0 * dt, -1);
  } else {
    state.steerAngle *= 0.8;
  }

  const speedFactor = Math.min(Math.abs(state.speed) / 50, 1);
  const turnDirection = state.speed >= 0 ? 1 : -1;
  state.heading += state.steerAngle * state.steerMax * speedFactor * turnDirection;

  // Move car
  const forwardX = -Math.sin(state.heading);
  const forwardZ = -Math.cos(state.heading);
  const metersPerSec = (state.speed * 1000) / 3600;

  state.position.x += forwardX * metersPerSec * dt;
  state.position.z += forwardZ * metersPerSec * dt;

  carGroup.position.copy(state.position);
  carGroup.rotation.y = state.heading;

  // Camera third-person chase
  const camDistance = 8.5;
  const camHeight = 3.2;
  const targetCamX = state.position.x + Math.sin(state.heading) * camDistance;
  const targetCamZ = state.position.z + Math.cos(state.heading) * camDistance;
  const targetCamY = state.position.y + camHeight;

  camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.15);
  camera.lookAt(state.position.x, state.position.y + 1.2, state.position.z);

  // Update light to follow car
  sun.position.set(state.position.x + 100, 200, state.position.z + 80);
  sun.target = carGroup;

  updateHUD(dt);
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
