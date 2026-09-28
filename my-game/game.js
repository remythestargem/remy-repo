import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.querySelector("#game-canvas");
const hint = document.querySelector("#hint");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
  new THREE.MeshBasicMaterial({ color: 0x10210e, transparent: true, opacity: 0.28, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.028;
scene.add(shadow);

const WORLD_RADIUS = 29;
const edge = new THREE.Mesh(
  new THREE.RingGeometry(WORLD_RADIUS - 0.1, WORLD_RADIUS + 0.1, 160),
  new THREE.MeshBasicMaterial({ color: 0xffdda1, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
);
edge.rotation.x = -Math.PI / 2;
edge.position.y = 0.08;
scene.add(edge);

function makeFallbackIsland() {
  const island = new THREE.Group();
  const grass = new THREE.MeshStandardMaterial({ color: 0x3b7729, roughness: 0.94 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x59635c, roughness: 0.96 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(29, 25, 1.5, 96), grass);
  top.position.y = -0.76; top.receiveShadow = true; island.add(top);
  const underside = new THREE.Mesh(new THREE.ConeGeometry(25, 18, 96), stone);
  underside.position.y = -10.4; underside.rotation.x = Math.PI; underside.castShadow = underside.receiveShadow = true; island.add(underside);
  scene.add(island);
}

const loader = new GLTFLoader();
loader.load(
  "assets/world/world.gltf",
  (gltf) => {
    gltf.scene.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    scene.add(gltf.scene);
    hint.textContent = "Move with the joystick · drag anywhere else to look";
  },
  undefined,
  () => { makeFallbackIsland(); hint.textContent = "Island fallback loaded · drag to look"; }
);

// High-detail CC0 photogrammetry scans from Poly Haven, intentionally 1K-texture variants for mobile.
const polyHavenAssets = [
  {
    url: "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/rock_moss_set_01/rock_moss_set_01_1k.gltf",
    positions: [[-21, 0, -16, 0.2], [21, 0, -14, -0.9], [-22, 0, 14, 1.1], [19, 0, 17, 2.0]]
  },
  {
    url: "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/rock_face_01/rock_face_01_1k.gltf",
    positions: [[-25, 0, 1, 0.5], [24, 0, 4, -1.1], [-6, 0, -25, 1.8], [7, 0, 24, -2.0]]
  }
];
for (const asset of polyHavenAssets) {
  loader.load(asset.url, (gltf) => {
    gltf.scene.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    for (const [x, y, z, rotation] of asset.positions) {
      const prop = gltf.scene.clone(true);
      prop.position.set(x, y, z);
      prop.rotation.y = rotation;
      scene.add(prop);
    }
  }, undefined, () => console.warn("Poly Haven scenery could not be loaded."));
}

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

// Touch-drag rotates a third-person camera. Zoom gestures and mouse wheel are deliberately disabled.
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
  shadow.position.set(player.position.x, 0.028, player.position.z);

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
