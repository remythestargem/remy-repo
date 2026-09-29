import * as THREE from "three";
import { GLTFLoader } from "three/addons/GLTFLoader.js";

// --- Canvas & Renderer ---
const canvas = document.querySelector("#game-canvas");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x82c8e6);
scene.fog = new THREE.FogExp2(0x82c8e6, 0.012);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);

// --- Lighting ---
const hemiLight = new THREE.HemisphereLight(0xfff6e5, 0x3d6e35, 1.8);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffeedd, 2.5);
sunLight.position.set(35, 50, 25);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -40;
sunLight.shadow.camera.right = 40;
sunLight.shadow.camera.top = 40;
sunLight.shadow.camera.bottom = -40;
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.03;
scene.add(sunLight);

// --- Procedural Immediate Tropical Island Environment ---
const ISLAND_RADIUS = 36;
const terrainGroup = new THREE.Group();
scene.add(terrainGroup);

// Island Ground Mesh (Sand & Grass central hill)
function createIslandTerrain() {
  const geom = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 4, 3, 64, 16);
  const pos = geom.attributes.position;
  const colors = [];
  
  const grassColor = new THREE.Color(0x4a8c38);
  const sandColor = new THREE.Color(0xdebe78);
  const cliffColor = new THREE.Color(0x736c58);
  const tempCol = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const dist = Math.hypot(x, z);

    // Height deformation for hill in the center
    if (y > 0) {
      const elevation = Math.max(0, Math.cos((dist / ISLAND_RADIUS) * Math.PI * 0.5)) * 3.8;
      const noise = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.4;
      const newY = y + elevation + noise - 1.5;
      pos.setY(i, newY);

      if (dist < 22) {
        tempCol.copy(grassColor).offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05);
      } else {
        tempCol.copy(sandColor);
      }
    } else {
      tempCol.copy(cliffColor);
    }
    colors.push(tempCol.r, tempCol.g, tempCol.b);
  }

  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  terrainGroup.add(mesh);
  return mesh;
}
createIslandTerrain();

// Ocean Water Disk
const oceanGeom = new THREE.RingGeometry(ISLAND_RADIUS - 2, 180, 64);
oceanGeom.rotateX(-Math.PI / 2);
const oceanMat = new THREE.MeshStandardMaterial({
  color: 0x1b729e,
  roughness: 0.2,
  metalness: 0.4,
  transparent: true,
  opacity: 0.88
});
const ocean = new THREE.Mesh(oceanGeom, oceanMat);
ocean.position.y = -0.3;
scene.add(ocean);

// Procedural Palm Trees
function makePalmTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);

  // Trunk
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4e37, roughness: 0.9 });
  const trunkSegments = 5;
  let curY = 0;
  let curX = 0;
  for (let i = 0; i < trunkSegments; i++) {
    const segH = 0.8;
    const segGeom = new THREE.CylinderGeometry(0.22 - i * 0.02, 0.26 - i * 0.02, segH, 7);
    const seg = new THREE.Mesh(segGeom, trunkMat);
    seg.position.set(curX, curY + segH / 2, 0);
    seg.rotation.z = -0.06;
    seg.castShadow = true;
    seg.receiveShadow = true;
    tree.add(seg);
    curY += segH * 0.95;
    curX += 0.06;
  }

  // Fronds
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6, side: THREE.DoubleSide });
  const frondCount = 7;
  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2;
    const leafGeom = new THREE.ConeGeometry(0.7, 2.4, 4);
    leafGeom.rotateX(Math.PI / 2.6);
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    leaf.position.set(curX, curY, 0);
    leaf.rotation.y = angle;
    leaf.castShadow = true;
    tree.add(leaf);
  }

  // Adjust Y to island surface
  const dist = Math.hypot(x, z);
  const elevation = Math.max(0, Math.cos((dist / ISLAND_RADIUS) * Math.PI * 0.5)) * 3.8 - 0.2;
  tree.position.y = elevation;
  terrainGroup.add(tree);
}

// Scatter palm trees
const palmPositions = [
  [-12, -8, 1.1], [14, 10, 1.2], [-15, 12, 0.95], [16, -12, 1.05],
  [-6, 18, 1.0], [8, -17, 1.15], [-20, -5, 0.9], [19, 4, 1.0]
];
palmPositions.forEach(([x, z, s]) => makePalmTree(x, z, s));

// --- 3D Player Character ---
function createPlayer() {
  const avatar = new THREE.Group();
  avatar.name = "Player";

  const suitMat = new THREE.MeshStandardMaterial({ color: 0x1d6fa5, roughness: 0.65 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd99573, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2c1f18, roughness: 0.9 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x0f151c, roughness: 0.6 });

  // Torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.75, 8, 16), suitMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  avatar.add(torso);

  // Head & Hair
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), skinMat);
  head.position.y = 1.82;
  head.castShadow = true;
  avatar.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.y = 1.94;
  hair.castShadow = true;
  avatar.add(hair);

  // Legs
  avatar.leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.55, 6, 10), pantsMat);
  avatar.leftLeg.position.set(-0.2, 0.45, 0);
  avatar.leftLeg.castShadow = true;
  avatar.add(avatar.leftLeg);

  avatar.rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.55, 6, 10), pantsMat);
  avatar.rightLeg.position.set(0.2, 0.45, 0);
  avatar.rightLeg.castShadow = true;
  avatar.add(avatar.rightLeg);

  // Shoes
  const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.32), shoeMat);
  lShoe.position.set(0, -0.32, 0.06);
  avatar.leftLeg.add(lShoe);

  const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.32), shoeMat);
  rShoe.position.set(0, -0.32, 0.06);
  avatar.rightLeg.add(rShoe);

  // Arms
  avatar.leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.52, 6, 10), suitMat);
  avatar.leftArm.position.set(-0.46, 1.18, 0);
  avatar.leftArm.rotation.z = -0.12;
  avatar.leftArm.castShadow = true;
  avatar.add(avatar.leftArm);

  avatar.rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.52, 6, 10), suitMat);
  avatar.rightArm.position.set(0.46, 1.18, 0);
  avatar.rightArm.rotation.z = 0.12;
  avatar.rightArm.castShadow = true;
  avatar.add(avatar.rightArm);

  return avatar;
}

const player = createPlayer();
scene.add(player);

// Dynamic Ground Shadow
const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x07150a,
  transparent: true,
  opacity: 0.35,
  depthWrite: false
});
const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), shadowMat);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.03;
scene.add(shadow);

// Asynchronous Poly Haven Asset Loader (Non-blocking enhancement)
const gltfLoader = new GLTFLoader();
function loadAssetSafely(url, onLoad) {
  gltfLoader.load(
    url,
    (gltf) => {
      gltf.scene.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
      onLoad(gltf.scene);
    },
    undefined,
    (err) => console.warn(`Asset ${url} failed to load, procedural scene active:`, err)
  );
}

loadAssetSafely("./assets/rock_moss_set_01/rock_moss_set_01_1k.gltf", (model) => {
  model.scale.setScalar(0.85);
  model.position.set(-14, 0.8, -6);
  scene.add(model);
});

loadAssetSafely("./assets/rock_face_01/rock_face_01_1k.gltf", (model) => {
  model.scale.setScalar(0.7);
  model.position.set(18, 0.5, 8);
  scene.add(model);
});

// --- Dynamic Floating Joystick & Touch Controls ---
const leftZone = document.querySelector("#left-zone");
const joystickBase = document.querySelector("#joystick-base");
const joystickKnob = document.querySelector("#joystick-knob");
const rightZone = document.querySelector("#right-zone");
const btnJump = document.querySelector("#btn-jump");
const btnSprint = document.querySelector("#btn-sprint");

let joystickActive = false;
let joystickPointerId = null;
let joystickOriginX = 0;
let joystickOriginY = 0;
const JOYSTICK_MAX_RADIUS = 50;
const inputVector = { x: 0, y: 0 };

leftZone.addEventListener("pointerdown", (e) => {
  if (joystickActive) return;
  joystickActive = true;
  joystickPointerId = e.pointerId;
  leftZone.setPointerCapture(e.pointerId);

  joystickOriginX = e.clientX;
  joystickOriginY = e.clientY;

  joystickBase.style.left = `${joystickOriginX}px`;
  joystickBase.style.top = `${joystickOriginY}px`;
  joystickBase.classList.remove("hidden");
  joystickKnob.style.transform = `translate(0px, 0px)`;
  inputVector.x = 0;
  inputVector.y = 0;
});

leftZone.addEventListener("pointermove", (e) => {
  if (!joystickActive || e.pointerId !== joystickPointerId) return;

  const dx = e.clientX - joystickOriginX;
  const dy = e.clientY - joystickOriginY;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const clampedDist = Math.min(dist, JOYSTICK_MAX_RADIUS);

  const knobX = Math.cos(angle) * clampedDist;
  const knobY = Math.sin(angle) * clampedDist;
  joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

  // Normalized direction with deadzone
  if (clampedDist > 6) {
    inputVector.x = knobX / JOYSTICK_MAX_RADIUS;
    inputVector.y = knobY / JOYSTICK_MAX_RADIUS;
  } else {
    inputVector.x = 0;
    inputVector.y = 0;
  }
});

function endJoystick(e) {
  if (e.pointerId === joystickPointerId) {
    joystickActive = false;
    joystickPointerId = null;
    joystickBase.classList.add("hidden");
    joystickKnob.style.transform = `translate(0px, 0px)`;
    inputVector.x = 0;
    inputVector.y = 0;
  }
}
leftZone.addEventListener("pointerup", endJoystick);
leftZone.addEventListener("pointercancel", endJoystick);

// --- Camera Touch-Look (Right Screen Drag) ---
let lookActive = false;
let lookPointerId = null;
let lastLookX = 0;
let lastLookY = 0;
let cameraYaw = 0.5;
let cameraPitch = 0.45;
const CAMERA_SENSITIVITY = 0.005;

rightZone.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".action-btn")) return; // Don't steal action button clicks
  if (lookActive) return;
  lookActive = true;
  lookPointerId = e.pointerId;
  lastLookX = e.clientX;
  lastLookY = e.clientY;
  rightZone.setPointerCapture(e.pointerId);
});

rightZone.addEventListener("pointermove", (e) => {
  if (!lookActive || e.pointerId !== lookPointerId) return;
  const dx = e.clientX - lastLookX;
  const dy = e.clientY - lastLookY;

  cameraYaw -= dx * CAMERA_SENSITIVITY;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch - dy * CAMERA_SENSITIVITY, 0.1, 1.25);

  lastLookX = e.clientX;
  lastLookY = e.clientY;
});

function endLook(e) {
  if (e.pointerId === lookPointerId) {
    lookActive = false;
    lookPointerId = null;
  }
}
rightZone.addEventListener("pointerup", endLook);
rightZone.addEventListener("pointercancel", endLook);

// --- Action Buttons ---
let isSprinting = false;
let isGrounded = true;
let playerVelocityY = 0;
const GRAVITY = -24;
const JUMP_POWER = 8.8;

function doJump() {
  if (isGrounded) {
    playerVelocityY = JUMP_POWER;
    isGrounded = false;
  }
}

btnJump.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  doJump();
});

btnSprint.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  isSprinting = !isSprinting;
  btnSprint.classList.toggle("active", isSprinting);
});

// Keyboard Fallback
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Space") doJump();
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    isSprinting = true;
    btnSprint.classList.add("active");
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    isSprinting = false;
    btnSprint.classList.remove("active");
  }
});

// Calculate ground height at (x, z)
function getGroundHeight(x, z) {
  const dist = Math.hypot(x, z);
  if (dist > ISLAND_RADIUS + 2) return -1.5;
  const elevation = Math.max(0, Math.cos((dist / ISLAND_RADIUS) * Math.PI * 0.5)) * 3.8;
  const noise = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.4;
  return elevation + noise - 0.2;
}

// --- Main Game Loop ---
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const cameraTarget = new THREE.Vector3(0, 1.5, 0);
const desiredCamPos = new THREE.Vector3();
const CAMERA_DISTANCE = 8.0;

let lastTime = performance.now();
let walkCycle = 0;

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // Keyboard input resolution
  const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  const cx = Math.abs(inputVector.x) > 0.05 ? inputVector.x : kx;
  const cy = Math.abs(inputVector.y) > 0.05 ? inputVector.y : ky;

  // Direction relative to camera yaw
  forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  right.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
  moveDir.set(0, 0, 0).addScaledVector(forward, -cy).addScaledVector(right, cx);

  const inputMag = Math.min(1, Math.hypot(cx, cy));
  const isMoving = inputMag > 0.08;

  const baseSpeed = isSprinting ? 12.0 : 7.2;
  const currentSpeed = baseSpeed * inputMag;

  if (isMoving) {
    moveDir.normalize();
    player.position.addScaledVector(moveDir, currentSpeed * dt);

    // Smoothly turn character towards moving direction
    const targetAngle = Math.atan2(moveDir.x, moveDir.z);
    let diff = targetAngle - player.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    player.rotation.y += diff * Math.min(1, dt * 16);

    // Walking animation
    walkCycle += dt * (isSprinting ? 16 : 10);
    const swing = Math.sin(walkCycle) * (isSprinting ? 0.65 : 0.45);
    player.leftLeg.rotation.x = swing;
    player.rightLeg.rotation.x = -swing;
    player.leftArm.rotation.x = -swing * 0.8;
    player.rightArm.rotation.x = swing * 0.8;
  } else {
    // Idle smoothing
    player.leftLeg.rotation.x = THREE.MathUtils.lerp(player.leftLeg.rotation.x, 0, dt * 10);
    player.rightLeg.rotation.x = THREE.MathUtils.lerp(player.rightLeg.rotation.x, 0, dt * 10);
    player.leftArm.rotation.x = THREE.MathUtils.lerp(player.leftArm.rotation.x, 0, dt * 10);
    player.rightArm.rotation.x = THREE.MathUtils.lerp(player.rightArm.rotation.x, 0, dt * 10);
  }

  // Island boundary clamp
  const distFromCenter = Math.hypot(player.position.x, player.position.z);
  if (distFromCenter > ISLAND_RADIUS - 1.0) {
    const scale = (ISLAND_RADIUS - 1.0) / distFromCenter;
    player.position.x *= scale;
    player.position.z *= scale;
  }

  // Ground elevation and Jump physics
  const targetGroundY = getGroundHeight(player.position.x, player.position.z);
  if (!isGrounded) {
    playerVelocityY += GRAVITY * dt;
    player.position.y += playerVelocityY * dt;
    if (player.position.y <= targetGroundY) {
      player.position.y = targetGroundY;
      playerVelocityY = 0;
      isGrounded = true;
    }
  } else {
    // Stick to ground
    player.position.y = THREE.MathUtils.lerp(player.position.y, targetGroundY, dt * 20);
  }

  // Shadow positioning
  shadow.position.set(player.position.x, targetGroundY + 0.04, player.position.z);
  const airOffset = Math.max(0, player.position.y - targetGroundY);
  const sScale = THREE.MathUtils.clamp(1 - airOffset * 0.25, 0.4, 1);
  shadow.scale.setScalar(sScale);

  // Smooth Third-Person Camera Tracking
  cameraTarget.lerp(
    new THREE.Vector3(player.position.x, player.position.y + 1.4, player.position.z),
    1 - Math.exp(-dt * 14)
  );

  const flatDist = Math.cos(cameraPitch) * CAMERA_DISTANCE;
  desiredCamPos.set(
    cameraTarget.x + Math.sin(cameraYaw) * flatDist,
    cameraTarget.y + Math.sin(cameraPitch) * CAMERA_DISTANCE,
    cameraTarget.z + Math.cos(cameraYaw) * flatDist
  );

  camera.position.lerp(desiredCamPos, 1 - Math.exp(-dt * 12));
  camera.lookAt(cameraTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Window resize
function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", onWindowResize);
onWindowResize();

requestAnimationFrame(tick);
