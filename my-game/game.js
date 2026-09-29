import * as THREE from "three";
import { GLTFLoader } from "three/addons/GLTFLoader.js";

const canvas = document.querySelector("#game-canvas");
const hint = document.querySelector("#hint");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x78bad5);
scene.fog = new THREE.FogExp2(0x78bad5, 0.015);
const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 250);

// Lighting
scene.add(new THREE.HemisphereLight(0xdff5ff, 0x263719, 2.4));
const sun = new THREE.DirectionalLight(0xffedc4, 3.2);
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

// Character Setup
function makeCharacter() {
  const avatar = new THREE.Group();
  avatar.name = "Player";

  const suit = new THREE.MeshStandardMaterial({ color: 0x2e73d3, roughness: 0.72 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98762, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x172238, roughness: 0.65 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x202018, roughness: 0.95 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.88, 8, 16), suit);
  body.position.y = 1.08;
  body.castShadow = true;
  body.receiveShadow = true;
  avatar.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), skin);
  head.position.y = 1.92;
  head.castShadow = true;
  avatar.add(head);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.375, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.54), hair);
  cap.position.y = 2.04;
  cap.castShadow = true;
  avatar.add(cap);

  avatar.leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.48, 6, 10), dark);
  avatar.leftLeg.position.set(-0.23, 0.47, 0);
  avatar.leftLeg.castShadow = true;
  avatar.add(avatar.leftLeg);

  avatar.rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.48, 6, 10), dark);
  avatar.rightLeg.position.set(0.23, 0.47, 0);
  avatar.rightLeg.castShadow = true;
  avatar.add(avatar.rightLeg);

  avatar.leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 6, 10), suit);
  avatar.leftArm.position.set(-0.49, 1.22, 0);
  avatar.leftArm.rotation.z = -0.16;
  avatar.leftArm.castShadow = true;
  avatar.add(avatar.leftArm);

  avatar.rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 6, 10), suit);
  avatar.rightArm.position.set(0.49, 1.22, 0);
  avatar.rightArm.rotation.z = 0.16;
  avatar.rightArm.castShadow = true;
  avatar.add(avatar.rightArm);

  return avatar;
}

const player = makeCharacter();
scene.add(player);

// Player shadow
const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.65, 24),
  new THREE.MeshBasicMaterial({
    color: 0x10210e,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.05;
scene.add(shadow);

// World boundary ring
const WORLD_RADIUS = 29;
const edge = new THREE.Mesh(
  new THREE.RingGeometry(WORLD_RADIUS - 0.15, WORLD_RADIUS + 0.15, 160),
  new THREE.MeshBasicMaterial({
    color: 0xffdda1,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  })
);
edge.rotation.x = -Math.PI / 2;
edge.position.y = 0.08;
scene.add(edge);

// 3D Models
const loader = new GLTFLoader();
const world = new THREE.Group();
scene.add(world);

function setWorldShadows(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (node.material) {
      node.material.envMapIntensity = 0.25;
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

// Load local assets
loader.load(
  "./assets/coast_line_02/coast_line_02_1k.gltf",
  (gltf) => {
    setWorldShadows(gltf.scene);
    world.add(gltf.scene);
    hint.textContent = "Explore the island · drag to look around";
  },
  undefined,
  (err) => console.error("Coast load error:", err)
);

loader.load(
  "./assets/rock_moss_set_01/rock_moss_set_01_1k.gltf",
  (gltf) => {
    placeGroundedScan(gltf.scene, -16, -7, 0.55, 0.9);
    placeGroundedScan(gltf.scene, 16, 7, -0.92, 0.85);
    placeGroundedScan(gltf.scene, -13, 9, 2.25, 0.7);
  },
  undefined,
  (err) => console.warn("Rock set warning:", err)
);

loader.load(
  "./assets/rock_face_01/rock_face_01_1k.gltf",
  (gltf) => {
    placeGroundedScan(gltf.scene, -20, 4, 1.36, 0.92);
    placeGroundedScan(gltf.scene, 20, -4, -1.74, 0.92);
  },
  undefined,
  (err) => console.warn("Cliff warning:", err)
);

// Player movement & Jump physics state
let playerVelocityY = 0;
let isGrounded = true;
const GRAVITY = -24;
const JUMP_FORCE = 8.5;
const PLAYER_SPEED = 9.0;

// Analog Joystick Setup
const moveVector = { x: 0, y: 0 };
const joystickZone = document.querySelector("#joystick-zone");
const joystickBase = document.querySelector("#joystick-base");
const joystickKnob = document.querySelector("#joystick-knob");
let joystickPointerId = null;
let baseRect = null;
const MAX_RADIUS = 48;

function updateJoystick(clientX, clientY) {
  if (!baseRect) baseRect = joystickBase.getBoundingClientRect();
  const centerX = baseRect.left + baseRect.width / 2;
  const centerY = baseRect.top + baseRect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const clampedDist = Math.min(dist, MAX_RADIUS);

  const knobX = Math.cos(angle) * clampedDist;
  const knobY = Math.sin(angle) * clampedDist;
  joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

  moveVector.x = knobX / MAX_RADIUS;
  moveVector.y = knobY / MAX_RADIUS;
}

function resetJoystick() {
  joystickPointerId = null;
  moveVector.x = 0;
  moveVector.y = 0;
  joystickKnob.style.transform = "translate(0px, 0px)";
  baseRect = null;
}

joystickZone.addEventListener("pointerdown", (e) => {
  if (joystickPointerId !== null) return;
  joystickPointerId = e.pointerId;
  joystickZone.setPointerCapture(e.pointerId);
  baseRect = joystickBase.getBoundingClientRect();
  updateJoystick(e.clientX, e.clientY);
});

joystickZone.addEventListener("pointermove", (e) => {
  if (e.pointerId === joystickPointerId) {
    updateJoystick(e.clientX, e.clientY);
  }
});

for (const type of ["pointerup", "pointercancel"]) {
  joystickZone.addEventListener(type, (e) => {
    if (e.pointerId === joystickPointerId) resetJoystick();
  });
}

// Jump Action Button
const jumpBtn = document.querySelector("#jump-btn");
function triggerJump() {
  if (isGrounded) {
    playerVelocityY = JUMP_FORCE;
    isGrounded = false;
  }
}
jumpBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  triggerJump();
});

// Touch Drag to Look (Right side or full screen outside joystick)
let lookPointerId = null;
let lastLookX = 0;
let lastLookY = 0;
let cameraYaw = 0.72;
let cameraPitch = 0.52;
const LOOK_SENSITIVITY = 0.0055;

canvas.addEventListener("pointerdown", (e) => {
  // If touch is on the right half of the screen and not joystick
  if (lookPointerId !== null) return;
  lookPointerId = e.pointerId;
  lastLookX = e.clientX;
  lastLookY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== lookPointerId) return;
  const dx = e.clientX - lastLookX;
  const dy = e.clientY - lastLookY;
  cameraYaw -= dx * LOOK_SENSITIVITY;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch - dy * LOOK_SENSITIVITY, 0.18, 1.15);
  lastLookX = e.clientX;
  lastLookY = e.clientY;
});

for (const type of ["pointerup", "pointercancel"]) {
  canvas.addEventListener(type, (e) => {
    if (e.pointerId === lookPointerId) lookPointerId = null;
  });
}

// Keyboard Controls (fallback)
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Space") triggerJump();
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// Game Loop
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const input = new THREE.Vector3();
const followTarget = new THREE.Vector3(0, 1.2, 0);
const desiredCamera = new THREE.Vector3();
const CAMERA_DISTANCE = 8.5;
let lastTime = performance.now();
let walkCycle = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // Input resolution
  const keyX = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const keyY = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  const controlX = Math.abs(moveVector.x) > 0.05 ? moveVector.x : keyX;
  const controlY = Math.abs(moveVector.y) > 0.05 ? moveVector.y : keyY;

  // Direction relative to camera
  forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  right.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
  input.set(0, 0, 0).addScaledVector(forward, -controlY).addScaledVector(right, controlX);

  const isMoving = input.lengthSq() > 0.005;
  if (isMoving) {
    input.normalize();
    player.position.addScaledVector(input, PLAYER_SPEED * dt);
    // Smooth turn player towards input direction
    const targetAngle = Math.atan2(input.x, input.z);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, targetAngle, Math.min(1, dt * 14));
    
    // Leg & arm swing animation
    walkCycle += dt * 10;
    const swing = Math.sin(walkCycle) * 0.45;
    player.leftLeg.rotation.x = swing;
    player.rightLeg.rotation.x = -swing;
    player.leftArm.rotation.x = -swing * 0.8;
    player.rightArm.rotation.x = swing * 0.8;
  } else {
    // Return legs/arms to idle
    player.leftLeg.rotation.x = THREE.MathUtils.lerp(player.leftLeg.rotation.x, 0, dt * 8);
    player.rightLeg.rotation.x = THREE.MathUtils.lerp(player.rightLeg.rotation.x, 0, dt * 8);
    player.leftArm.rotation.x = THREE.MathUtils.lerp(player.leftArm.rotation.x, 0, dt * 8);
    player.rightArm.rotation.x = THREE.MathUtils.lerp(player.rightArm.rotation.x, 0, dt * 8);
  }

  // World Boundary
  const dist = Math.hypot(player.position.x, player.position.z);
  if (dist > WORLD_RADIUS - 1.2) {
    const scale = (WORLD_RADIUS - 1.2) / dist;
    player.position.x *= scale;
    player.position.z *= scale;
  }

  // Jump & Gravity Physics
  if (!isGrounded) {
    playerVelocityY += GRAVITY * dt;
    player.position.y += playerVelocityY * dt;
    if (player.position.y <= 0) {
      player.position.y = 0;
      playerVelocityY = 0;
      isGrounded = true;
    }
  }

  // Shadow follows player
  shadow.position.set(player.position.x, 0.05, player.position.z);
  const shadowScale = THREE.MathUtils.clamp(1 - player.position.y * 0.2, 0.4, 1);
  shadow.scale.setScalar(shadowScale);

  // Smooth Third-Person Camera
  followTarget.lerp(
    new THREE.Vector3(player.position.x, player.position.y + 1.2, player.position.z),
    1 - Math.exp(-dt * 12)
  );
  const flatDist = Math.cos(cameraPitch) * CAMERA_DISTANCE;
  desiredCamera.set(
    followTarget.x + Math.sin(cameraYaw) * flatDist,
    followTarget.y + Math.sin(cameraPitch) * CAMERA_DISTANCE,
    followTarget.z + Math.cos(cameraYaw) * flatDist
  );
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 10));
  camera.lookAt(followTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
