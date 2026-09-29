import * as THREE from "three";
import { GLTFLoader } from "three/addons/GLTFLoader.js";

const canvas = document.querySelector("#game-canvas");
const hint = document.querySelector("#hint");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x78bad5);
scene.fog = new THREE.FogExp2(0x78bad5, 0.016);
const camera = new THREE.PerspectiveCamera(54, 9 / 16, 0.1, 220);

scene.add(new THREE.HemisphereLight(0xdff5ff, 0x263719, 2.4));
const sun = new THREE.DirectionalLight(0xffedc4, 3.3);
sun.position.set(28, 36, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -38;
sun.shadow.camera.right = 38;
sun.shadow.camera.top = 38;
sun.shadow.camera.bottom = -38;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);

function makeCharacter() {
  const avatar = new THREE.Group();
  avatar.name = "Player placeholder";
  const suit = new THREE.MeshStandardMaterial({ color: 0x2e73d3, roughness: 0.76 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98762, roughness: 0.82 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x172238, roughness: 0.67 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x202018, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.88, 6, 12), suit);
  body.position.y = 1.08; body.castShadow = body.receiveShadow = true; avatar.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), skin);
  head.position.y = 1.92; head.castShadow = true; avatar.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.375, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.54), hair);
  cap.position.y = 2.04; cap.castShadow = true; avatar.add(cap);
  for (const x of [-0.23, 0.23]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.48, 4, 8), dark);
    leg.position.set(x, 0.47, 0); leg.castShadow = true; avatar.add(leg);
  }
  for (const x of [-0.49, 0.49]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), suit);
    arm.position.set(x, 1.22, 0); arm.rotation.z = x < 0 ? -0.16 : 0.16; arm.castShadow = true; avatar.add(arm);
  }
  return avatar;
}
const player = makeCharacter();
scene.add(player);

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.64, 24),
  new THREE.MeshBasicMaterial({
    color: 0x10210e,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.05;
scene.add(shadow);

const WORLD_RADIUS = 29;
const edge = new THREE.Mesh(
  new THREE.RingGeometry(WORLD_RADIUS - 0.1, WORLD_RADIUS + 0.1, 160),
  new THREE.MeshBasicMaterial({
    color: 0xffdda1,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  })
);
edge.rotation.x = -Math.PI / 2;
edge.position.y = 0.1;
scene.add(edge);

const loader = new GLTFLoader();
const world = new THREE.Group();
world.name = "Poly Haven Coast Line 02 — CC0 photogrammetry";
scene.add(world);

function setWorldShadows(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (node.material) {
      node.material.envMapIntensity = 0.2;
      node.material.needsUpdate = true;
    }
  });
}

function placeGroundedScan(source, x, z, rotation, scale = 1) {
  const prop = source.clone(true);
  prop.scale.setScalar(scale);
  prop.rotation.y = rotation;
  prop.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(prop);
  prop.position.set(x, -bounds.min.y + 0.01, z);
  prop.updateMatrixWorld(true);
  setWorldShadows(prop);
  world.add(prop);
}

// Load local bundled assets
loader.load(
  "./assets/coast_line_02/coast_line_02_1k.gltf",
  (gltf) => {
    setWorldShadows(gltf.scene);
    world.add(gltf.scene);
    hint.textContent = "Explore the coastline · drag to look";
  },
  undefined,
  (err) => {
    console.error("Local coast load error:", err);
    hint.textContent = "Coastline loaded with fallback environment.";
  }
);

loader.load(
  "./assets/rock_moss_set_01/rock_moss_set_01_1k.gltf",
  (gltf) => {
    placeGroundedScan(gltf.scene, -16, -7, 0.55, 0.9);
    placeGroundedScan(gltf.scene, 16, 7, -0.92, 0.85);
    placeGroundedScan(gltf.scene, -13, 9, 2.25, 0.7);
  },
  undefined,
  (err) => console.warn("Local rock set warning:", err)
);

loader.load(
  "./assets/rock_face_01/rock_face_01_1k.gltf",
  (gltf) => {
    placeGroundedScan(gltf.scene, -20, 4, 1.36, 0.92);
    placeGroundedScan(gltf.scene, 20, -4, -1.74, 0.92);
  },
  undefined,
  (err) => console.warn("Local cliff warning:", err)
);

const move = { x: 0, y: 0 };
const pad = document.querySelector("#joystick");
const stick = document.querySelector("#stick");
let stickPointer = null;
function setStick(event) {
  const rect = pad.getBoundingClientRect();
  const dx = event.clientX - rect.left - rect.width / 2;
  const dy = event.clientY - rect.top - rect.height / 2;
  const max = Math.min(rect.width, rect.height) * 0.31;
  const scale = Math.min(1, max / (Math.hypot(dx, dy) || 1));
  move.x = dx / max * scale;
  move.y = dy / max * scale;
  stick.style.transform = `translate(${move.x * max}px, ${move.y * max}px)`;
}
pad.addEventListener("pointerdown", (event) => { stickPointer = event.pointerId; pad.setPointerCapture(event.pointerId); setStick(event); });
pad.addEventListener("pointermove", (event) => { if (event.pointerId === stickPointer) setStick(event); });
for (const type of ["pointerup", "pointercancel"]) pad.addEventListener(type, (event) => {
  if (event.pointerId === stickPointer) { stickPointer = null; move.x = move.y = 0; stick.style.transform = ""; }
});

let lookPointer = null;
let lastLookX = 0;
let lastLookY = 0;
let cameraYaw = 0.72;
let cameraPitch = 0.52;
const LOOK_SENSITIVITY = 0.0062;
canvas.addEventListener("pointerdown", (event) => {
  if (lookPointer !== null) return;
  lookPointer = event.pointerId;
  lastLookX = event.clientX; lastLookY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== lookPointer) return;
  cameraYaw -= (event.clientX - lastLookX) * LOOK_SENSITIVITY;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch - (event.clientY - lastLookY) * LOOK_SENSITIVITY, 0.25, 1.02);
  lastLookX = event.clientX; lastLookY = event.clientY;
});
for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, (event) => {
  if (event.pointerId === lookPointer) lookPointer = null;
});
canvas.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });
canvas.addEventListener("gesturestart", (event) => event.preventDefault());

const keys = {};
addEventListener("keydown", (event) => { keys[event.code] = true; });
addEventListener("keyup", (event) => { keys[event.code] = false; });

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const input = new THREE.Vector3();
const followTarget = new THREE.Vector3(0, 1.2, 0);
const desiredCamera = new THREE.Vector3();
const CAMERA_DISTANCE = 8.2;
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const keyX = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const keyY = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  const controlX = Math.abs(move.x) > 0.01 ? move.x : keyX;
  const controlY = Math.abs(move.y) > 0.01 ? move.y : keyY;

  forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  right.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
  input.set(0, 0, 0).addScaledVector(forward, -controlY).addScaledVector(right, controlX);
  const walking = input.lengthSq() > 0.001;
  if (walking) {
    input.normalize();
    player.position.addScaledVector(input, 8.2 * dt);
    player.rotation.y = Math.atan2(input.x, input.z);
  }
  const distance = Math.hypot(player.position.x, player.position.z);
  if (distance > WORLD_RADIUS - 1.1) {
    const scale = (WORLD_RADIUS - 1.1) / distance;
    player.position.x *= scale; player.position.z *= scale;
  }
  const bob = walking ? Math.sin(now * 0.016) * 0.055 : 0;
  player.position.y = THREE.MathUtils.lerp(player.position.y, bob, Math.min(1, dt * 12));
  shadow.position.set(player.position.x, 0.05, player.position.z);

  followTarget.lerp(new THREE.Vector3(player.position.x, player.position.y + 1.15, player.position.z), 1 - Math.exp(-dt * 11));
  const flatDistance = Math.cos(cameraPitch) * CAMERA_DISTANCE;
  desiredCamera.set(
    followTarget.x + Math.sin(cameraYaw) * flatDistance,
    followTarget.y + Math.sin(cameraPitch) * CAMERA_DISTANCE + (walking ? Math.sin(now * 0.012) * 0.045 : 0),
    followTarget.z + Math.cos(cameraYaw) * flatDistance
  );
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 9));
  camera.lookAt(followTarget);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function resize() {
  const width = canvas.clientWidth || innerWidth;
  const height = canvas.clientHeight || innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
